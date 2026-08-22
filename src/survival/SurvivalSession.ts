import {
  ITEM_DEFINITIONS,
  type ItemId,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import {
  SURVIVAL_EVENTS,
  isDriftingItemEventId,
  survivalEventById,
} from './eventCatalog';
import { drawWeightedEvent } from './eventSelection';
import { resolveWeightedOutcome } from './eventResolver';
import { FishingSession, type FishingTerminalResult } from './FishingSession';
import { SurvivalInventoryState } from './inventory';
import type {
  JournalDayActionRecord,
  JournalDaytimeRecord,
  JournalEntry,
  JournalEventRecord,
  JournalCarlitosDawnRecord,
  JournalNightRecord,
  JournalInventoryMutation,
} from './journal';
import {
  cloneJournalActions,
  cloneJournalInventoryMutations,
  journalSnapshot,
} from './journalRecords';
import { mulberry32 } from './random';
import {
  CHEST_OPEN_ENERGY,
  drawChestReward,
  shouldBecomeMimic,
} from './chest';
import { clampSurvivalResources, eventResourceDelta } from './eventOutcomeRules';
import { pressureForDay, pressureIncreaseForDay } from './RunPressure';
import { SURVIVAL_BALANCE } from './survivalBalance';
import {
  dayActionResourceDelta,
  dayActionUnavailableReason,
  type DayActionRuleState,
} from './dayActionRules';
import {
  advanceCarlitosDawn,
  CARLITOS_EVENT_ENERGY_COST,
  carlitosStatus,
  carlitosWellness,
  createCarlitosState,
  feedCarlitos,
  petCarlitos,
  spendCarlitosEnergy,
  treatCarlitos,
  type CarlitosSnapshot,
  type CarlitosState,
} from './CarlitosState';
import type {
  ActionOutcome,
  BeginFishingResult,
  DayActionOption,
  DayActionId,
  DawnEnergy,
  EventResponse,
  EventResponseId,
  EventInventoryMutation,
  ItemCondition,
  PresentationCue,
  RandomSource,
  ResourceDelta,
  SurvivalEventDefinition,
  SurvivalSnapshot,
  SurvivalState,
  ResourceEffect,
  RewardSummary,
  ChestSnapshot,
  ChestState,
  CompanionEventActionAvailability,
  CompanionEventActionId,
  SurvivalEndingReason,
  WeatherId,
  WeightedEventOutcome,
} from './survivalTypes';

const NO_EVENT_EXCLUSIONS: ReadonlySet<string> = new Set();

function fallbackResultId(eventId: string): string | undefined {
  if (eventId === 'night-trader') return 'trader-food-fallback';
  if (eventId === 'handyman') return 'handyman-food-fallback';
  return undefined;
}

export interface SurvivalSessionOptions {
  seed: number;
  random?: RandomSource;
  weather?: WeatherId;
  initial?: Partial<Pick<
    SurvivalSnapshot,
    | 'health'
    | 'hunger'
    | 'energy'
    | 'hull'
    | 'day'
    | 'pressure'
    | 'rescueProgress'
    | 'food'
    | 'bait'
  >>;
  initialConditions?: Partial<Record<ItemInstanceId, ItemCondition>>;
  initialEventId?: string;
  initialChest?: ChestSnapshot;
  initialAppearanceCounts?: Readonly<Record<string, number>>;
  initialCarlitos?: Partial<CarlitosSnapshot>;
}

export type { DayActionOption } from './survivalTypes';
export type { BeginFishingResult } from './survivalTypes';

interface Rejection {
  code: string;
  message: string;
}

const DAY_ACTION_REJECTION_CODES: Readonly<Record<string, string>> = Object.freeze({
  'Finish the active fishing attempt first.': 'fishing-in-progress',
  'That option cannot be used for this action.': 'invalid-option',
  'The survival journey has already ended.': 'terminal',
  'That action is only available during the day.': 'not-daytime',
  'Fishing requires one energy.': 'not-enough-energy',
  'Diving requires a recovered scuba set.': 'no-scuba-set',
  'Diving is too dangerous during a squall.': 'weather-blocked',
  'Diving requires three energy.': 'not-enough-energy',
  'No food remains.': 'no-food',
  'You are not hungry.': 'not-hungry',
  'The hull needs no repair.': 'hull-full',
  'Repairing requires one energy.': 'not-enough-energy',
  'No duct tape remains.': 'no-duct-tape',
  'No repair material remains.': 'no-repair-material',
  'Choose a broken item to repair.': 'no-repair-target',
  'That item cannot be repaired.': 'item-not-repairable',
  'No treatment is needed.': 'health-full',
  'No medical-kit charges remain.': 'no-medical-kit',
  'You already sent the rescue message.': 'message-already-sent',
  'No bottled paper remains.': 'no-bottled-paper',
  'Sending the message requires one energy.': 'not-enough-energy',
  'No energy bar remains.': 'no-energy-bar',
  'Your energy is already full.': 'energy-full',
  'There is no closed chest to open.': 'no-closed-chest',
  'Opening the chest requires three energy.': 'not-enough-energy',
  'Carlitos is not aboard.': 'no-carlitos',
  'Carlitos cannot respond.': 'carlitos-dead',
  'Carlitos has already been petted today.': 'already-petted',
  'Carlitos is already satiated.': 'carlitos-not-hungry',
  'Carlitos needs no treatment.': 'carlitos-healthy',
  'No medical kit remains.': 'no-medical-kit',
});

interface ActiveFishingTransaction {
  readonly attempt: FishingSession;
  readonly capturedBait: boolean;
  readonly previousActedToday: boolean;
}

export class SurvivalSession {
  private state: SurvivalState = 'day';
  private endingReason: SurvivalEndingReason = 'standard';
  private day: number;
  private pressure: number;
  private health: number;
  private hunger: number;
  private energy: number;
  private hull: number;
  private food = 0;
  private bait = 0;
  private recoveredFood = 0;
  private recoveredBait = 0;
  private repairMaterial = 0;
  private rescueProgress: number;
  private chestState: ChestState;
  private chestAcquiredDay: number | null;
  private weather: WeatherId;
  private actedToday = false;
  private readonly inventory: SurvivalInventoryState;
  private readonly savedItems: readonly ItemInstance[];
  private readonly carlitos: CarlitosState | null;
  private pendingEventId: string | null;
  private pendingEvent: SurvivalEventDefinition | null = null;
  private pendingEventTargetId: ItemInstanceId | null = null;
  private readonly pendingDawnBreaks = new Set<ItemInstanceId>();
  private nextDawnEnergyOverride: DawnEnergy | null = null;
  private lastEventId: string | null = null;
  private readonly lastSeenDay = new Map<string, number>();
  private readonly appearanceCounts = new Map<string, number>();
  private rescueMessageSent = false;
  private lastOutcome: ActionOutcome | null = null;
  private pendingJournalDaytime: JournalDaytimeRecord | null;
  private pendingJournalNighttime: JournalNightRecord | null = null;
  private pendingJournalActions: JournalDayActionRecord[] = [];
  private readonly journalEntries: JournalEntry[] = [];
  private readonly seed: number;
  private readonly random: RandomSource;
  private fishingCounter = 0;
  private activeFishing: ActiveFishingTransaction | null = null;
  private cachedSnapshot: Readonly<SurvivalSnapshot> | null = null;

  constructor(savedItems: readonly ItemInstance[], options: SurvivalSessionOptions) {
    this.seed = options.seed;
    this.random = options.random ?? mulberry32(options.seed);
    this.weather = options.weather ?? 'calm';
    this.day = options.initial?.day ?? 1;
    this.pendingJournalDaytime = this.day === 1
      ? Object.freeze({ kind: 'sinkingShip' })
      : null;
    this.pressure = options.initial?.pressure ?? pressureForDay(this.day);
    this.health = options.initial?.health ?? SURVIVAL_BALANCE.start.health;
    this.hunger = options.initial?.hunger ?? SURVIVAL_BALANCE.start.hunger;
    this.energy = options.initial?.energy ?? SURVIVAL_BALANCE.start.energy;
    this.hull = options.initial?.hull ?? SURVIVAL_BALANCE.start.hull;
    this.rescueProgress = options.initial?.rescueProgress ?? 0;
    this.chestState = options.initialChest?.state ?? 'none';
    this.chestAcquiredDay = this.chestState === 'none'
      ? null
      : options.initialChest?.acquiredDay ?? this.day;
    for (const [eventId, count] of Object.entries(options.initialAppearanceCounts ?? {})) {
      if (!Number.isInteger(count) || count < 0) {
        throw new Error(`Invalid initial appearance count for ${eventId}.`);
      }
      this.appearanceCounts.set(eventId, count);
    }
    this.pendingEventId = null;
    const hasCarlitos = savedItems.some(({ type }) => type === 'carlitos');
    this.savedItems = Object.freeze(savedItems
      .filter(({ type }) => type !== 'carlitos')
      .map((item) => Object.freeze({ ...item })));
    this.carlitos = hasCarlitos
      ? createCarlitosState(options.initialCarlitos)
      : null;
    this.inventory = new SurvivalInventoryState(this.savedItems);
    this.applyInitialConditions(options.initialConditions);

    if (options.initialEventId !== undefined) {
      const initialEvent = survivalEventById(options.initialEventId);
      if (initialEvent === undefined) throw new Error(`Unknown survival event: ${options.initialEventId}`);
      this.openEvent(initialEvent);
    }

    this.recoveredFood = this.inventory.count('cannedFood', 'usable');
    this.recoveredBait = this.inventory.count('baitTin', 'usable');
    this.bait = options.initial?.bait ?? this.recoveredBait;
    this.food = options.initial?.food ?? this.recoveredFood;

    this.clampMeters();
    this.resolveTerminal();
  }

  snapshot(): SurvivalSnapshot {
    if (this.cachedSnapshot !== null) return this.cachedSnapshot;
    const clonedOutcome = this.lastOutcome === null ? null : this.cloneOutcome(this.lastOutcome);
    const lastOutcome = clonedOutcome === null
      ? null
      : Object.freeze({
          ...clonedOutcome,
          deltas: Object.freeze({ ...clonedOutcome.deltas }),
        });

    this.cachedSnapshot = Object.freeze({
      state: this.state,
      endingReason: this.endingReason,
      day: this.day,
      pressure: this.pressure,
      health: this.health,
      hunger: this.hunger,
      energy: this.energy,
      hull: this.hull,
      food: this.food,
      bait: this.bait,
      recoveredFood: this.recoveredFood,
      recoveredBait: this.recoveredBait,
      repairMaterial: this.repairMaterial,
      rescueProgress: this.rescueProgress,
      chest: Object.freeze({
        state: this.chestState,
        acquiredDay: this.chestAcquiredDay,
      }),
      weather: this.weather,
      actedToday: this.actedToday,
      journalEntries: journalSnapshot(this.journalEntries),
      inventory: this.inventory.snapshot(),
      savedItems: this.savedItems,
      carlitos: this.carlitos === null
        ? null
        : Object.freeze({ ...this.carlitos }),
      pendingEventId: this.pendingEventId,
      pendingEventTargetId: this.pendingEventTargetId,
      lastOutcome,
      seed: this.seed,
    });
    return this.cachedSnapshot;
  }

  availableReason(action: DayActionId, option?: DayActionOption): string | null {
    return dayActionUnavailableReason(this.dayActionRuleState(), action, option);
  }

  companionEventActionAvailability(
    action: CompanionEventActionId,
  ): CompanionEventActionAvailability {
    if (action !== 'delegateCarlitos') {
      throw new Error(`Unknown companion event action: ${action}`);
    }
    if (this.carlitos === null) {
      return {
        visible: false,
        energyCost: 0,
        availableEnergy: 0,
        unavailableReason: 'Carlitos is not aboard.',
      };
    }
    if (!this.carlitos.alive) {
      return {
        visible: false,
        energyCost: 0,
        availableEnergy: 0,
        unavailableReason: 'Carlitos cannot retrieve the loot.',
      };
    }
    if (this.carlitos.energy < CARLITOS_EVENT_ENERGY_COST) {
      return {
        visible: true,
        energyCost: CARLITOS_EVENT_ENERGY_COST,
        availableEnergy: this.carlitos.energy,
        unavailableReason: `Carlitos needs 3 energy; he has ${this.carlitos.energy}.`,
      };
    }
    if (carlitosWellness(this.carlitos) >= 4) {
      return {
        visible: true,
        energyCost: CARLITOS_EVENT_ENERGY_COST,
        availableEnergy: this.carlitos.energy,
        unavailableReason: null,
      };
    }

    const status = carlitosStatus(this.carlitos);
    const label = this.carlitos.hunger < 4
      ? status.hunger
      : this.carlitos.sickness > 0
        ? status.health
        : status.happiness;
    return {
      visible: true,
      energyCost: CARLITOS_EVENT_ENERGY_COST,
      availableEnergy: this.carlitos.energy,
      unavailableReason: `Carlitos is ${label} and cannot retrieve the loot.`,
    };
  }

  perform(action: Exclude<DayActionId, 'fish'>, option?: DayActionOption): ActionOutcome {
    const unavailable = this.unavailable(action, option);
    if (unavailable !== null) return this.reject(unavailable.code, unavailable.message);

    let outcome: ActionOutcome;
    switch (action) {
      case 'dive': outcome = this.dive(); break;
      case 'eat': outcome = this.eat(); break;
      case 'repair': outcome = this.repair(option); break;
      case 'repairItem': outcome = this.repairItem(option); break;
      case 'treat': outcome = this.treat(); break;
      case 'sendMessage': outcome = this.sendMessage(); break;
      case 'useEnergyBar': outcome = this.useEnergyBar(); break;
      case 'openChest': outcome = this.openChest(); break;
      case 'petCarlitos': outcome = this.petCarlitos(); break;
      case 'feedCarlitos': outcome = this.feedCarlitos(); break;
      case 'treatCarlitos': outcome = this.treatCarlitos(); break;
      case 'endDay': return this.endDay();
    }
    this.actedToday = true;
    return outcome;
  }

  beginFishing(): BeginFishingResult {
    const unavailable = this.unavailable('fish');
    if (unavailable !== null) {
      const message = unavailable.code === 'not-daytime'
        ? 'Fishing is only available during the day.'
        : unavailable.message;
      return { accepted: false, outcome: this.reject(unavailable.code, message) };
    }

    const capturedBait = this.bait > 0;
    const activeItemIds = new Set(
      Object.values(this.inventory.snapshot())
        .filter((item) => item?.condition === 'usable' || item?.condition === 'broken')
        .map((item) => item!.type),
    );
    const previousActedToday = this.actedToday;
    const attempt = new FishingSession({
      id: `fishing-${this.day}-${++this.fishingCounter}`,
      day: this.day,
      capturedBait,
      activeItemIds,
      ...(this.carlitos?.alive ? { fishWeightMultiplier: 1.01 } : {}),
      random: this.random,
    });
    const outcome = this.commit(
      'fishing-started',
      'You ready the line and look for a place to cast.',
      { energy: -SURVIVAL_BALANCE.actions.fishEnergy },
      'none',
    );
    this.actedToday = true;
    this.activeFishing = {
      attempt,
      capturedBait,
      previousActedToday,
    };
    return { accepted: true, outcome, attempt };
  }

  cancelFishing(attemptId: string): ActionOutcome {
    const transaction = this.activeFishing;
    if (transaction === null) {
      return this.reject('no-fishing-attempt', 'There is no active fishing attempt.');
    }
    const snapshot = transaction.attempt.snapshot();
    if (snapshot.id !== attemptId) {
      return this.reject('fishing-attempt-mismatch', 'That fishing attempt is no longer active.');
    }
    if (snapshot.state !== 'aiming') {
      return this.reject('fishing-already-cast', 'The line is already in the water.');
    }

    this.activeFishing = null;
    this.actedToday = transaction.previousActedToday;
    return this.commit(
      'fishing-cancelled',
      'You lower the rod without casting.',
      { energy: SURVIVAL_BALANCE.actions.fishEnergy },
      'none',
    );
  }

  finishFishing(attemptId: string, result: FishingTerminalResult): ActionOutcome {
    const transaction = this.activeFishing;
    if (transaction === null) {
      return this.reject('no-fishing-attempt', 'There is no active fishing attempt.');
    }
    const snapshot = transaction.attempt.snapshot();
    if (snapshot.id !== attemptId) {
      return this.reject('fishing-attempt-mismatch', 'That fishing attempt is no longer active.');
    }
    if (snapshot.result === null || (snapshot.state !== 'resolved' && snapshot.state !== 'missed')) {
      return this.reject('fishing-unresolved', 'The fishing attempt has not reached a result.');
    }
    if (snapshot.result !== result) {
      return this.reject('fishing-result-mismatch', 'That result does not belong to the active fishing attempt.');
    }

    const reward = result.kind === 'catch' ? result.catch.reward : { kind: 'none' as const };
    const food = reward.kind === 'food' ? reward.amount : 0;
    const baitConsumed = reward.kind === 'food' && transaction.capturedBait;
    const deltas: ResourceDelta = {};
    if (food > 0) deltas.food = food;
    if (reward.kind === 'bait') deltas.bait = reward.amount;
    if (baitConsumed) deltas.bait = -1;
    if (reward.kind === 'item') {
      const gained = this.inventory.gain(reward.itemId, reward.condition);
      if (gained === null) {
        throw new Error(`Fishing reward would duplicate active ${reward.itemId}`);
      }
    }
    const code = result.kind === 'miss'
      ? 'fish-missed'
      : result.catch.kind === 'fish'
        ? 'fish-caught'
        : result.catch.kind === 'utility'
          ? 'utility-caught'
          : 'junk-caught';
    const message = result.kind === 'miss'
      ? 'The fish got away.'
      : result.catch.kind === 'fish'
        ? `You caught a ${result.catch.label.toLocaleLowerCase('en-US')}.`
        : `You reeled in ${result.catch.label.toLocaleLowerCase('en-US')}.`;
    const outcome = this.commit(code, message, deltas, 'none');
    this.pendingJournalActions.push(Object.freeze({
      kind: 'fishing',
      attemptId,
      result: result.kind === 'miss' ? 'miss' : result.catch.kind,
      catchId: result.kind === 'miss' ? null : result.catch.id,
      catchLabel: result.kind === 'miss' ? null : result.catch.label,
      food,
      baitConsumed,
    }));
    this.activeFishing = null;
    return outcome;
  }

  requestDayEvent(): ActionOutcome {
    return this.reject(
      'day-event-scheduled',
      'Day events open only through their own schedule.',
    );
  }

  endDay(): ActionOutcome {
    const unavailable = this.unavailable('endDay');
    if (unavailable !== null) {
      const message = unavailable.code === 'not-daytime'
        ? 'The day cannot end while an event is unresolved.'
        : unavailable.message;
      return this.reject(unavailable.code, message);
    }

    if (this.chestState === 'closed'
      && this.chestAcquiredDay !== null
      && shouldBecomeMimic(this.chestAcquiredDay, this.day, this.random)) {
      this.chestState = 'mimic';
    }
    if (this.chestState === 'mimic') {
      const attack = survivalEventById('chest-attack');
      if (attack === undefined) throw new Error('Missing Chest Attack event definition.');
      this.openEvent(attack);
      return this.commit('event-opened', attack.prompt, {}, 'nightfall');
    }

    if (this.random.next() < SURVIVAL_BALANCE.night.quietChance) {
      this.state = 'nightEvent';
      this.pendingJournalNighttime = { kind: 'quiet' };
      this.finalizeJournalDay();
      return this.commit('quiet-night', 'The night passes without incident.', {}, 'nightfall');
    }

    const event = this.drawEvent('night');
    this.openEvent(event);
    return this.commit('event-opened', event.prompt, {}, 'nightfall');
  }

  resolveEvent(response: EventResponse): ActionOutcome {
    if (this.activeFishing !== null) return this.fishingInProgress();
    if (this.isTerminal()) return this.reject('terminal', 'The survival journey has already ended.');
    if ((this.state !== 'dayEvent' && this.state !== 'nightEvent') || this.pendingEvent === null) {
      return this.reject('no-event', 'There is no unresolved event.');
    }

    if (response.kind === 'endure') {
      if (
        this.pendingEvent.id !== 'other-people'
        && this.hasUsableEventChoice(this.pendingEvent)
      ) {
        return this.reject('endure-unavailable', 'Use one of the highlighted items to face this event.');
      }
      return this.resolveEventChoice('sleep', null, null, undefined);
    }

    if (response.kind === 'choice') {
      const choice = this.pendingEvent.choices.find(({ id }) => id === response.choiceId);
      if (choice?.itemId !== undefined) {
        return this.reject('choice-unavailable', 'That response is not available for this event.');
      }
      return this.resolveEventChoice(response.choiceId, null, null, response.resultId);
    }

    const item = this.inventory.snapshot()[response.instanceId];
    const choice = this.pendingEvent.choices.find(({ id }) => id === response.choiceId);
    if (choice?.itemId === undefined) {
      return this.reject('choice-unavailable', 'That response is not available for this event.');
    }
    if (item === undefined) return this.reject('item-unavailable', 'That item is no longer on the boat.');
    if (item.type !== choice.itemId) {
      return this.reject('item-mismatch', 'That physical item does not match the selected response.');
    }
    if (item.condition !== 'usable') {
      return this.reject('item-unavailable', 'That item has no uses remaining.');
    }
    return this.resolveEventChoice(choice.id, response.instanceId, choice.itemId, undefined);
  }

  private resolveEventChoice(
    choiceId: EventResponseId,
    selectedInstanceId: ItemInstanceId | null,
    attemptedItemId: ItemId | null,
    resultId: string | undefined,
  ): ActionOutcome {
    const event = this.pendingEvent;
    if (event === null) return this.reject('no-event', 'There is no unresolved event.');
    const choice = event.choices.find((candidate) => candidate.id === choiceId);
    if (choice === undefined) {
      return this.reject('choice-unavailable', 'That response is not available for this event.');
    }
    const companionRejection = this.unavailableCompanionEventAction(choice.companionAction);
    if (companionRejection !== null) {
      return this.reject(companionRejection.code, companionRejection.message);
    }
    if (!this.meetsChoiceRequirements(choice.requirements)) {
      return this.reject('requirements-unmet', 'You do not have the resources for that response.');
    }
    if (choice.requiredChestState !== undefined && choice.requiredChestState !== this.chestState) {
      return this.reject('chest-state-unavailable', `That response requires a ${choice.requiredChestState} chest.`);
    }
    if (choice.companionAction === 'delegateCarlitos'
      && !spendCarlitosEnergy(this.carlitos!)) {
      return this.reject('companion-action-unavailable', 'Carlitos does not have enough energy.');
    }

    const mutationExclusions = new Set<ItemInstanceId>();

    const phase = event.phase;
    const before = this.resourceValues();
    const resolved = resolveWeightedOutcome(
      choice,
      this.random,
      this.appearanceCounts.get(event.id) ?? 0,
      resultId,
    );
    const inventoryMutations: JournalInventoryMutation[] = [];
    let fallbackFoodGranted = false;
    for (const effect of resolved.effects.resources ?? []) {
      inventoryMutations.push(...this.applyEventResource(
        effect,
        mutationExclusions,
        selectedInstanceId,
        phase,
      ));
    }
    for (const mutation of resolved.effects.items ?? []) {
      if (phase === 'night' && (mutation.kind === 'break' || mutation.kind === 'breakRandom')) {
        const deferredBreak = this.deferNightBreak(
          phase,
          mutation,
          mutationExclusions,
          selectedInstanceId,
          attemptedItemId,
        );
        if (deferredBreak !== null) inventoryMutations.push(deferredBreak);
        continue;
      }
      const mutationResult = this.applyEventMutation(
        mutation,
        mutationExclusions,
        selectedInstanceId,
        attemptedItemId,
      );
      fallbackFoodGranted ||= mutationResult.fallbackFoodGranted;
      if (mutationResult.mutation !== null) inventoryMutations.push(mutationResult.mutation);
    }
    this.applyChestEffect(resolved.effects.chest);
    if (resolved.effects.nextDawnEnergy !== undefined) {
      this.nextDawnEnergyOverride = resolved.effects.nextDawnEnergy;
    }
    if (resolved.effects.endingReason === 'kidnapped') {
      this.endingReason = 'kidnapped';
      this.state = 'dead';
    }

    if (resolved.effects.rescue === true && !this.isTerminal()) {
      this.state = 'rescued';
      this.clearPendingEvent();
    }
    else this.resolveTerminal();
    this.lastEventId = event.id;
    this.lastSeenDay.set(event.id, this.day);
    this.appearanceCounts.set(event.id, (this.appearanceCounts.get(event.id) ?? 0) + 1);
    this.clearPendingEvent();

    const after = this.resourceValues();
    const deltas = this.appliedResourceDelta(before, after);
    const cue = this.presentationCue('none');
    const rewardSummary = this.driftingItemRewardSummary(
      event.id,
      choiceId,
      resolved,
      fallbackFoodGranted,
    );
    const resolvedResultId = fallbackFoodGranted
      ? fallbackResultId(event.id)
      : resolved.resultId;
    const eventResult = resolvedResultId === undefined
      ? undefined
      : Object.freeze({
          eventId: event.id,
          choiceId,
          resultId: resolvedResultId,
        });
    const outcome: ActionOutcome = {
      accepted: true,
      code: 'event-resolved',
      message: fallbackFoodGranted
        ? 'The item slot is occupied, so you receive one food instead.'
        : resolved.message,
      deltas,
      cue,
      ...(resolved.effects.nextDawnEnergy === undefined
        ? {}
        : { nextDawnEnergy: resolved.effects.nextDawnEnergy }),
      ...(resolved.presentationKey === undefined
        ? {}
        : { eventPresentationKey: resolved.presentationKey }),
      ...(rewardSummary === undefined ? {} : { rewardSummary }),
      ...(eventResult === undefined ? {} : { eventResult }),
    };
    this.lastOutcome = outcome;
    if (resolved.effects.followUpNight !== true) {
      this.recordJournalEvent(
        event,
        choiceId,
        choice.label,
        attemptedItemId,
        outcome,
        inventoryMutations,
      );
    }
    this.changed();

    if (!this.isTerminal()) {
      if (phase === 'day') {
        this.state = 'day';
      } else if (resolved.effects.followUpNight === true) {
        this.openEvent(this.drawEvent('night', new Set(['guarded-sleep'])));
      } else {
        this.state = 'nightEvent';
      }
    }
    return this.cloneOutcome(outcome);
  }

  beginDawn(): ActionOutcome {
    if (this.activeFishing !== null) return this.fishingInProgress();
    if (this.isTerminal()) return this.reject('terminal', 'The survival journey has already ended.');
    if (this.pendingEvent !== null) return this.reject('event-pending', 'Resolve the pending event before dawn.');
    if (this.state !== 'nightEvent') return this.reject('not-nighttime', 'Dawn cannot begin before the night is complete.');

    this.day += 1;
    this.pendingJournalDaytime = null;
    this.pendingJournalNighttime = null;
    this.pendingJournalActions = [];
    this.actedToday = false;
    this.clearPendingEvent();
    this.state = 'day';
    this.applyPendingDawnBreaks();
    this.advanceCarlitosDawn();

    this.weather = 'calm';

    const hungerAfterDawn = Math.min(
      SURVIVAL_BALANCE.thresholds.maximum,
      this.hunger + SURVIVAL_BALANCE.dawn.hungerIncrease,
    );
    const normalMorningEnergy = hungerAfterDawn >= SURVIVAL_BALANCE.thresholds.starving
      ? SURVIVAL_BALANCE.dawn.starvingEnergy
      : hungerAfterDawn >= SURVIVAL_BALANCE.thresholds.hungry
        ? SURVIVAL_BALANCE.dawn.hungryEnergy
        : SURVIVAL_BALANCE.dawn.normalEnergy;
    const morningEnergy = this.nextDawnEnergyOverride ?? normalMorningEnergy;
    this.nextDawnEnergyOverride = null;
    const deltas: ResourceDelta = {
      hunger: SURVIVAL_BALANCE.dawn.hungerIncrease,
      energy: morningEnergy - this.energy,
    };
    const pressureIncrease = pressureIncreaseForDay(this.day);
    if (pressureIncrease > 0) deltas.pressure = pressureIncrease;
    if (hungerAfterDawn >= SURVIVAL_BALANCE.thresholds.maximum) {
      deltas.health = -SURVIVAL_BALANCE.dawn.starvationDamage;
    }

    const dawn = this.commit('dawn', 'Another dawn breaks over the lifeboat.', deltas, 'dawn');
    if (this.isTerminal()) return dawn;

    if (this.day < SURVIVAL_BALANCE.rescue.firstDay) {
      this.openDayEventAfterDawn();
      return dawn;
    }

    const baseChance = Math.min(
      SURVIVAL_BALANCE.rescue.chanceCap,
      SURVIVAL_BALANCE.rescue.initialChance
        + (this.day - SURVIVAL_BALANCE.rescue.firstDay) * SURVIVAL_BALANCE.rescue.dailyIncrease,
    );
    const progressChance = Math.min(SURVIVAL_BALANCE.rescue.progressCap, this.rescueProgress) / 100;
    if (this.random.next() >= Math.min(0.85, baseChance + progressChance)) {
      this.openDayEventAfterDawn();
      return dawn;
    }

    this.state = 'rescued';
    this.clearPendingEvent();
    return this.commit('rescued', 'A rescue vessel finds the lifeboat at dawn.', {}, 'rescue');
  }

  private dayActionRuleState(): DayActionRuleState {
    return Object.freeze({
      state: this.state,
      activeFishing: this.activeFishing !== null,
      actedToday: this.actedToday,
      weather: this.weather,
      rescueMessageSent: this.rescueMessageSent,
      energy: this.energy,
      health: this.health,
      hunger: this.hunger,
      hull: this.hull,
      food: this.food,
      bait: this.bait,
      repairMaterial: this.repairMaterial,
      chestState: this.chestState,
      inventory: this.inventory.snapshot(),
      carlitos: this.carlitos === null
        ? null
        : Object.freeze({ ...this.carlitos }),
    });
  }

  private unavailable(action: DayActionId, option?: DayActionOption): Rejection | null {
    const message = dayActionUnavailableReason(this.dayActionRuleState(), action, option);
    if (message === null) return null;
    const code = DAY_ACTION_REJECTION_CODES[message];
    if (code === undefined) throw new Error(`Missing day action rejection code for: ${message}`);
    return { code, message };
  }

  private unavailableCompanionEventAction(
    action: CompanionEventActionId | undefined,
  ): Rejection | null {
    if (action === undefined) return null;
    const availability = this.companionEventActionAvailability(action);
    if (availability.unavailableReason === null) return null;
    return {
      code: 'companion-action-unavailable',
      message: availability.unavailableReason,
    };
  }

  private dive(): ActionOutcome {
    const hasFlashlight = this.inventory.hasUsable('flashlight');
    const weatherSuccessDelta = this.weather === 'overcast' ? SURVIVAL_BALANCE.diving.overcastSuccessDelta : 0;
    const weatherInjuryDelta = this.weather === 'overcast' ? SURVIVAL_BALANCE.diving.overcastInjuryDelta : 0;
    const successChance = (hasFlashlight ? SURVIVAL_BALANCE.diving.flashlightSuccess : SURVIVAL_BALANCE.diving.success)
      + weatherSuccessDelta;
    const injuryChance = (hasFlashlight ? SURVIVAL_BALANCE.diving.flashlightInjury : SURVIVAL_BALANCE.diving.injury)
      + weatherInjuryDelta;
    const recovered = this.random.next() < successChance;
    const injured = this.random.next() < injuryChance;
    const deltas: ResourceDelta = { energy: -SURVIVAL_BALANCE.actions.diveEnergy };
    if (injured) deltas.health = -SURVIVAL_BALANCE.diving.injuryDamage;

    if (recovered) {
      const rewardRoll = this.random.next();
      if (rewardRoll < 0.25) deltas.food = 1;
      else if (rewardRoll < 0.5) deltas.bait = 1;
      else if (rewardRoll < 0.75) deltas.repairMaterial = 1;
      else deltas.rescueProgress = 10;
    }

    return this.commit(
      recovered ? 'dive-recovered' : 'dive-empty',
      recovered ? 'You surfaced with useful salvage.' : 'You found nothing beneath the boat.',
      deltas,
      'dive',
    );
  }

  private eat(): ActionOutcome {
    const deltas = dayActionResourceDelta(this.dayActionRuleState(), 'eat');
    return this.commit(
      'ate',
      'The food takes the edge off your hunger.',
      deltas,
      'none',
    );
  }

  private repair(option?: DayActionOption): ActionOutcome {
    const deltas = dayActionResourceDelta(this.dayActionRuleState(), 'repair', option);
    if (option?.kind === 'hullRepair' && option.material === 'ductTape') {
      this.inventory.consume('ductTape', 1);
      return this.commit(
        'repaired-with-duct-tape',
        'The emergency patch holds for now.',
        deltas,
        'repair',
      );
    }

    return this.commit(
      'repaired',
      'You reinforce the damaged hull.',
      deltas,
      'repair',
    );
  }

  private repairItem(option?: DayActionOption): ActionOutcome {
    if (option?.kind !== 'itemRepair') {
      return this.reject('no-repair-target', 'Choose a broken item to repair.');
    }
    this.inventory.repair(option.target);
    this.inventory.consume('ductTape', 1);
    return this.commit('item-repaired', 'The duct tape makes the item usable again.', {}, 'repair');
  }

  private treat(): ActionOutcome {
    const deltas = dayActionResourceDelta(this.dayActionRuleState(), 'treat');
    this.inventory.consume('medicalKit', 1);
    return this.commit(
      'treated',
      'You clean and dress your wounds.',
      deltas,
      'treat',
    );
  }

  private petCarlitos(): ActionOutcome {
    if (this.carlitos === null || !petCarlitos(this.carlitos)) {
      throw new Error('Carlitos pet action was not available.');
    }
    const outcome = this.commit('carlitos-petted', 'You pet Carlitos.', {}, 'none');
    this.pendingJournalActions.push(Object.freeze({ kind: 'carlitosCare', action: 'pet' }));
    return outcome;
  }

  private feedCarlitos(): ActionOutcome {
    if (this.carlitos === null || !feedCarlitos(this.carlitos)) {
      throw new Error('Carlitos feed action was not available.');
    }
    const outcome = this.commit('carlitos-fed', 'You feed Carlitos.', { food: -1 }, 'none');
    this.pendingJournalActions.push(Object.freeze({ kind: 'carlitosCare', action: 'feed' }));
    return outcome;
  }

  private treatCarlitos(): ActionOutcome {
    if (this.carlitos === null || !treatCarlitos(this.carlitos)) {
      throw new Error('Carlitos treatment was not available.');
    }
    this.inventory.consume('medicalKit', 1);
    const outcome = this.commit('carlitos-treated', 'You treat Carlitos.', {}, 'none');
    this.pendingJournalActions.push(Object.freeze({ kind: 'carlitosCare', action: 'treat' }));
    return outcome;
  }

  private sendMessage(): ActionOutcome {
    const deltas = dayActionResourceDelta(this.dayActionRuleState(), 'sendMessage');
    this.inventory.consume('bottledPaper', 1);
    this.rescueMessageSent = true;
    return this.commit('message-sent', 'You cast the message into the current.', deltas, 'sighting');
  }

  private useEnergyBar(): ActionOutcome {
    const deltas = dayActionResourceDelta(this.dayActionRuleState(), 'useEnergyBar');
    this.inventory.consume('energyBar', 1);
    return this.commit('energy-bar-used', 'The ration restores your strength.', deltas, 'none');
  }

  private openChest(): ActionOutcome {
    const activeItemIds = this.targetableItemIds();
    const reward = drawChestReward(activeItemIds, this.random);
    this.chestState = 'none';
    this.chestAcquiredDay = null;

    if (reward.kind === 'resource') {
      const deltas: ResourceDelta = {
        energy: -CHEST_OPEN_ENERGY,
        [reward.resource]: reward.quantity,
      };
      return this.commit(
        'chest-opened',
        `The chest holds ${reward.quantity} ${reward.resource}.`,
        deltas,
        'none',
        { kind: 'resource', id: reward.resource, quantity: reward.quantity },
      );
    }

    const gained = this.inventory.gain(reward.itemId);
    if (gained === null) {
      return this.commit(
        'chest-opened',
        'The item cannot fit, so you recover two food.',
        { energy: -CHEST_OPEN_ENERGY, food: 2 },
        'none',
        { kind: 'resource', id: 'food', quantity: 2 },
      );
    }
    return this.commit(
      'chest-opened',
      `The chest holds ${ITEM_DEFINITIONS[reward.itemId].label.toLowerCase()}.`,
      { energy: -CHEST_OPEN_ENERGY },
      'none',
      { kind: 'item', id: reward.itemId, quantity: 1 },
    );
  }

  private drawEvent(
    phase: 'day' | 'night',
    excludedIds: ReadonlySet<string> = NO_EVENT_EXCLUSIONS,
  ): SurvivalEventDefinition {
    const eventExclusions = this.rescueMessageSent
      ? new Set([...excludedIds, 'drifting-bottle'])
      : excludedIds;
    return drawWeightedEvent(this.random, SURVIVAL_EVENTS, {
      phase,
      day: this.day,
      weather: this.weather,
      lastEventId: this.lastEventId,
      lastSeenDay: this.lastSeenDay,
      targetableItemIds: this.targetableItemIds(),
      appearanceCounts: this.appearanceCounts,
      inventoryItemIds: this.targetableItemIds(),
      rescueProgress: this.rescueProgress,
      pressure: this.pressure,
      chestState: this.chestState,
      hasLivingCompanion: this.carlitos?.alive === true,
      excludedIds: eventExclusions,
    });
  }

  private openDayEventAfterDawn(): void {
    const balance = SURVIVAL_BALANCE.dayEvents;
    if (this.day < balance.firstDay || this.random.next() >= balance.chance) return;
    const event = this.drawEvent('day');
    if (event.id === 'day-calm-fallback') return;
    this.openEvent(event);
  }

  private driftingItemRewardSummary(
    eventId: string,
    choiceId: string,
    resolved: WeightedEventOutcome,
    fallbackFoodGranted: boolean,
  ): RewardSummary | undefined {
    if (!isDriftingItemEventId(eventId)
      || (choiceId !== 'retrieve' && choiceId !== 'delegate-carlitos')) return undefined;
    if (fallbackFoodGranted) return Object.freeze({ kind: 'resource', id: 'food', quantity: 1 });
    if (eventId === 'drifting-bottle') {
      return Object.freeze({ kind: 'item', id: 'bottledPaper', quantity: 1 });
    }
    const added = resolved.effects.resources?.find(
      ({ operation, resource }) => operation === 'add'
        && (resource === 'food' || resource === 'bait' || resource === 'repairMaterial'),
    );
    if (added !== undefined && typeof added.value === 'number') {
      const id = added.resource;
      if (id === 'food' || id === 'bait' || id === 'repairMaterial') {
        return Object.freeze({ kind: 'resource', id, quantity: added.value });
      }
    }
    return Object.freeze({ kind: 'item', id: 'energyBar', quantity: 1 });
  }

  private recordJournalEvent(
    event: SurvivalEventDefinition,
    attemptedChoiceId: string | null,
    choiceLabel: string,
    attemptedItemId: ItemId | null,
    outcome: ActionOutcome,
    inventoryMutations: readonly JournalInventoryMutation[],
  ): void {
    const record: JournalEventRecord = {
      phase: event.phase,
      eventId: event.id,
      title: event.title,
      prompt: event.prompt,
      attemptedChoiceId,
      choiceLabel,
      attemptedItemId,
      outcomeCode: outcome.code,
      outcomeMessage: outcome.message,
      ...(outcome.eventPresentationKey === undefined
        ? {}
        : { eventPresentationKey: outcome.eventPresentationKey }),
      inventoryMutations: cloneJournalInventoryMutations(inventoryMutations),
    };
    if (event.phase === 'day') {
      this.pendingJournalDaytime = record;
      return;
    }
    this.pendingJournalNighttime = { kind: 'event', event: record };
    this.finalizeJournalDay();
  }

  private finalizeJournalDay(): void {
    if (this.pendingJournalNighttime === null) return;
    if (this.journalEntries.some((entry) => entry.day === this.day)) return;
    this.journalEntries.push({
      day: this.day,
      weather: this.weather,
      actions: cloneJournalActions(this.pendingJournalActions),
      daytime: this.pendingJournalDaytime,
      nighttime: this.pendingJournalNighttime,
    });
  }

  private openEvent(event: SurvivalEventDefinition): void {
    this.pendingEvent = event;
    this.pendingEventId = event.id;
    this.pendingEventTargetId = event.targetItemIds === undefined ? null : this.drawEventTarget(event);
    this.state = event.phase === 'day' ? 'dayEvent' : 'nightEvent';
  }

  private clearPendingEvent(): void {
    this.pendingEvent = null;
    this.pendingEventId = null;
    this.pendingEventTargetId = null;
  }

  private cloneOutcome(outcome: ActionOutcome): ActionOutcome {
    return {
      ...outcome,
      deltas: { ...outcome.deltas },
      ...(outcome.rewardSummary === undefined
        ? {}
        : { rewardSummary: Object.freeze({ ...outcome.rewardSummary }) as RewardSummary }),
      ...(outcome.eventResult === undefined
        ? {}
        : { eventResult: Object.freeze({ ...outcome.eventResult }) }),
    };
  }

  private targetableItemIds(): ReadonlySet<ItemId> {
    return new Set(Object.values(this.inventory.snapshot())
      .filter((item) => item?.condition === 'usable' || item?.condition === 'broken')
      .map((item) => item!.type));
  }

  private drawEventTarget(event: SurvivalEventDefinition): ItemInstanceId | null {
    const targetItemIds = new Set(event.targetItemIds ?? []);
    const candidates = Object.values(this.inventory.snapshot())
      .filter((item) => (item?.condition === 'usable' || item?.condition === 'broken')
        && targetItemIds.has(item.type))
      .map((item) => item!.instanceId)
      .sort();
    if (candidates.length === 0) return null;
    const roll = this.random.next();
    const index = Number.isFinite(roll)
      ? Math.min(candidates.length - 1, Math.max(0, Math.floor(roll * candidates.length)))
      : 0;
    return candidates[index] ?? null;
  }

  private canUseEventItem(id: ItemId): boolean {
    return this.usableEventItemInstanceId(id) !== null;
  }

  private hasUsableEventChoice(event: SurvivalEventDefinition): boolean {
    return event.choices.some((choice) => (
      choice.itemId !== undefined
      && (choice.requiredChestState === undefined || choice.requiredChestState === this.chestState)
      && this.canUseEventItem(choice.itemId)
    ));
  }

  private meetsChoiceRequirements(
    requirements: SurvivalEventDefinition['choices'][number]['requirements'],
  ): boolean {
    return requirements?.every(({ resource, minimum }) => this.resourceValues()[resource] >= minimum) ?? true;
  }

  private usableEventItemInstanceId(id: ItemId): ItemInstanceId | null {
    return Object.values(this.inventory.snapshot())
      .filter((item) => item?.type === id && item.condition === 'usable')
      .map((item) => item!.instanceId)
      .sort()[0] ?? null;
  }

  private reject(code: string, message: string): ActionOutcome {
    return { accepted: false, code, message, deltas: {}, cue: 'none' };
  }

  private fishingInProgress(): ActionOutcome {
    return this.reject('fishing-in-progress', 'Finish the active fishing attempt first.');
  }

  private commit(
    code: string,
    message: string,
    deltas: ResourceDelta,
    cue: PresentationCue,
    rewardSummary?: RewardSummary,
  ): ActionOutcome {
    const before = this.resourceValues();
    this.applyDeltas(deltas);
    this.resolveTerminal();
    const after = this.resourceValues();
    const applied = Object.fromEntries(Object.keys(deltas).map((key) => {
      const resource = key as keyof ResourceDelta;
      return [resource, after[resource] - before[resource]];
    })) as ResourceDelta;
    const terminalCue = this.state === 'dead' ? 'death' : this.state === 'sunk' ? 'sinking' : this.state === 'rescued' ? 'rescue' : cue;
    const outcome: ActionOutcome = {
      accepted: true,
      code,
      message,
      deltas: applied,
      cue: terminalCue,
      ...(rewardSummary === undefined ? {} : { rewardSummary }),
    };
    this.lastOutcome = outcome;
    this.changed();
    return { ...outcome, deltas: { ...outcome.deltas } };
  }

  private changed(): void {
    this.cachedSnapshot = null;
  }

  private resourceValues(): Required<ResourceDelta> {
    return {
      pressure: this.pressure,
      health: this.health, hunger: this.hunger, energy: this.energy, hull: this.hull,
      food: this.food, bait: this.bait, repairMaterial: this.repairMaterial,
      rescueProgress: this.rescueProgress,
    };
  }

  private presentationCue(cue: PresentationCue): PresentationCue {
    if (this.state === 'dead') return 'death';
    if (this.state === 'sunk') return 'sinking';
    if (this.state === 'rescued') return 'rescue';
    return cue;
  }

  private applyEventResource(
    effect: ResourceEffect,
    excludedInstanceIds: ReadonlySet<ItemInstanceId>,
    selectedInstanceId: ItemInstanceId | null,
    phase: SurvivalEventDefinition['phase'],
  ): JournalInventoryMutation[] {
    const value = effect.value;
    if (typeof value !== 'number') {
      throw new Error(`Event resource ${effect.resource} was not resolved to a concrete value.`);
    }
    const current = this.resourceValues()[effect.resource];
    const delta = eventResourceDelta({ ...effect, value }, current, phase, this.day);
    return this.applyDeltas(
      { [effect.resource]: delta },
      excludedInstanceIds,
      selectedInstanceId,
    );
  }

  private applyEventMutation(
    mutation: EventInventoryMutation,
    excludedInstanceIds: ReadonlySet<ItemInstanceId>,
    selectedInstanceId: ItemInstanceId | null,
    attemptedItemId: ItemId | null,
  ): { readonly mutation: JournalInventoryMutation | null; readonly fallbackFoodGranted: boolean } {
    let kind: JournalInventoryMutation['kind'];
    let instanceIds: ItemInstanceId[];
    let fallbackFoodGranted = false;
    const preferredInstanceId = 'itemId' in mutation
      && mutation.itemId === attemptedItemId
      ? selectedInstanceId
      : null;
    switch (mutation.kind) {
      case 'gain': {
        kind = 'gain';
        const gained = this.inventory.gain(mutation.itemId);
        instanceIds = gained === null ? [] : [gained];
        if (gained === null) {
          this.applyDeltas({ food: mutation.fallbackFood });
          fallbackFoodGranted = true;
        }
        break;
      }
      case 'gainChest': {
        kind = 'gain';
        instanceIds = [];
        fallbackFoodGranted = this.applyChestGain(mutation.fallbackFood);
        break;
      }
      case 'consume':
        kind = 'consume';
        instanceIds = this.inventory.consumePreferred(
          mutation.itemId,
          mutation.quantity,
          preferredInstanceId,
          excludedInstanceIds,
        );
        break;
      case 'break':
        kind = 'break';
        instanceIds = this.mutateMatchingInstances(
          mutation.itemId,
          mutation.quantity,
          excludedInstanceIds,
          preferredInstanceId,
          (instanceId) => this.inventory.break(instanceId),
        );
        break;
      case 'lose':
        kind = 'lose';
        instanceIds = this.mutateMatchingInstances(
          mutation.itemId,
          mutation.quantity,
          excludedInstanceIds,
          preferredInstanceId,
          (instanceId) => this.inventory.lose(instanceId),
        );
        break;
      case 'breakRandom':
        kind = 'break';
        instanceIds = this.inventory.breakRandom(mutation.quantity, this.random, excludedInstanceIds);
        break;
      case 'loseRandom':
        kind = 'lose';
        instanceIds = this.inventory.loseRandom(mutation.quantity, this.random, excludedInstanceIds);
        break;
      case 'loseEventTarget':
        kind = 'lose';
        instanceIds = this.pendingEventTargetId !== null
          && !excludedInstanceIds.has(this.pendingEventTargetId)
          && this.inventory.lose(this.pendingEventTargetId)
          ? [this.pendingEventTargetId]
          : [];
        break;
    }
    if (instanceIds.length === 0) return { mutation: null, fallbackFoodGranted };
    this.synchronizeRemovedResources(kind, instanceIds);
    return { mutation: { kind, instanceIds }, fallbackFoodGranted };
  }

  private deferNightBreak(
    phase: SurvivalEventDefinition['phase'],
    mutation: EventInventoryMutation,
    excludedInstanceIds: ReadonlySet<ItemInstanceId>,
    selectedInstanceId: ItemInstanceId | null,
    attemptedItemId: ItemId | null,
  ): JournalInventoryMutation | null {
    if (phase !== 'night' || (mutation.kind !== 'break' && mutation.kind !== 'breakRandom')) {
      return null;
    }
    let instanceIds: ItemInstanceId[];
    if (mutation.kind === 'breakRandom') {
      const exclusions = new Set(excludedInstanceIds);
      for (const instanceId of this.pendingDawnBreaks) exclusions.add(instanceId);
      instanceIds = this.inventory.selectRandomBreakable(
        mutation.quantity,
        this.random,
        exclusions,
      );
    } else {
      if (mutation.kind !== 'break') return null;
      const preferredInstanceId = mutation.itemId === attemptedItemId
        ? selectedInstanceId
        : null;
      const snapshot = this.inventory.snapshot();
      instanceIds = this.mutateMatchingInstances(
        mutation.itemId,
        mutation.quantity,
        excludedInstanceIds,
        preferredInstanceId,
        (instanceId) => (
          snapshot[instanceId]?.condition === 'usable'
          && !this.pendingDawnBreaks.has(instanceId)
        ),
      );
    }
    if (instanceIds.length === 0) return null;
    for (const instanceId of instanceIds) this.pendingDawnBreaks.add(instanceId);
    return { kind: 'break', instanceIds };
  }

  private applyPendingDawnBreaks(): void {
    for (const instanceId of [...this.pendingDawnBreaks].sort()) {
      this.inventory.break(instanceId);
    }
    this.pendingDawnBreaks.clear();
  }

  private advanceCarlitosDawn(): void {
    if (this.carlitos === null) return;
    const before = this.carlitosDawnState();
    advanceCarlitosDawn(this.carlitos, this.random);
    const after = this.carlitosDawnState();
    if (!this.carlitosDawnChanged(before, after)) return;
    const entryIndex = this.journalEntries.findIndex((entry) => entry.day === this.day - 1);
    if (entryIndex < 0) return;
    const entry = this.journalEntries[entryIndex]!;
    this.journalEntries[entryIndex] = {
      ...entry,
      actions: cloneJournalActions([
        ...entry.actions,
        Object.freeze({
          kind: 'carlitosDawn',
          before,
          after,
        }),
      ]),
    };
  }

  private carlitosDawnState(): JournalCarlitosDawnRecord['before'] {
    if (this.carlitos === null) throw new Error('Carlitos is not aboard.');
    return Object.freeze({
      alive: this.carlitos.alive,
      energy: this.carlitos.energy,
      hunger: this.carlitos.hunger,
      sickness: this.carlitos.sickness,
      unhappiness: this.carlitos.unhappiness,
      pettedToday: this.carlitos.pettedToday,
      deathCause: this.carlitos.deathCause,
    });
  }

  private carlitosDawnChanged(
    before: JournalCarlitosDawnRecord['before'],
    after: JournalCarlitosDawnRecord['after'],
  ): boolean {
    return before.hunger !== after.hunger
      || before.energy !== after.energy
      || before.sickness !== after.sickness
      || before.unhappiness !== after.unhappiness
      || before.alive !== after.alive
      || before.deathCause !== after.deathCause;
  }

  private applyChestGain(fallbackFood: 1): boolean {
    if (this.chestState === 'none') {
      this.chestState = 'closed';
      this.chestAcquiredDay = this.day;
      return false;
    }
    this.applyDeltas({ food: fallbackFood });
    return true;
  }

  private applyChestEffect(effect: WeightedEventOutcome['effects']['chest']): void {
    if (effect === undefined) return;
    if (effect === 'acquire' || effect === 'close') {
      this.chestState = 'closed';
      this.chestAcquiredDay = this.day;
      return;
    }
    this.chestState = 'none';
    this.chestAcquiredDay = null;
  }

  private mutateMatchingInstances(
    itemId: ItemId,
    quantity: number,
    excludedInstanceIds: ReadonlySet<ItemInstanceId>,
    preferredInstanceId: ItemInstanceId | null,
    mutate: (instanceId: ItemInstanceId) => boolean,
  ): ItemInstanceId[] {
    const matching = Object.values(this.inventory.snapshot())
      .filter((item) => item?.type === itemId)
      .map((item) => item!.instanceId)
      .filter((instanceId) => !excludedInstanceIds.has(instanceId))
      .sort();
    const candidates = preferredInstanceId !== null && matching.includes(preferredInstanceId)
      ? [preferredInstanceId, ...matching.filter((instanceId) => instanceId !== preferredInstanceId)]
      : matching;
    const mutated: ItemInstanceId[] = [];
    for (const instanceId of candidates) {
      if (mutated.length >= quantity) break;
      if (mutate(instanceId)) mutated.push(instanceId);
    }
    return mutated;
  }

  private synchronizeRemovedResources(
    kind: JournalInventoryMutation['kind'],
    instanceIds: readonly ItemInstanceId[],
  ): void {
    if (kind !== 'consume' && kind !== 'lose') return;
    const snapshot = this.inventory.snapshot();
    const food = instanceIds.filter((id) => snapshot[id]?.type === 'cannedFood').length;
    const bait = instanceIds.filter((id) => snapshot[id]?.type === 'baitTin').length;
    if (food > 0) {
      this.recoveredFood = Math.max(0, this.recoveredFood - food);
      this.food = Math.max(0, this.food - food);
    }
    if (bait > 0) {
      this.recoveredBait = Math.max(0, this.recoveredBait - bait);
      this.bait = Math.max(0, this.bait - bait);
    }
  }

  private appliedResourceDelta(
    before: Required<ResourceDelta>,
    after: Required<ResourceDelta>,
  ): ResourceDelta {
    const applied: ResourceDelta = {};
    for (const key of Object.keys(before) as Array<keyof ResourceDelta>) {
      const delta = after[key] - before[key];
      if (delta !== 0) applied[key] = delta;
    }
    return applied;
  }

  private applyDeltas(
    deltas: ResourceDelta,
    excludedInstanceIds: ReadonlySet<ItemInstanceId> = new Set(),
    selectedInstanceId: ItemInstanceId | null = null,
  ): JournalInventoryMutation[] {
    const adjustedDeltas = { ...deltas };
    if (adjustedDeltas.food !== undefined && adjustedDeltas.food < 0) {
      const protectedFood = this.protectedUsableCount('cannedFood', excludedInstanceIds);
      adjustedDeltas.food = Math.max(adjustedDeltas.food, protectedFood - this.food);
    }
    if (adjustedDeltas.bait !== undefined && adjustedDeltas.bait < 0) {
      const protectedBait = this.protectedUsableCount('baitTin', excludedInstanceIds);
      adjustedDeltas.bait = Math.max(adjustedDeltas.bait, protectedBait - this.bait);
    }
    const spentRecoveredFood = this.spentRecoveredUses(this.recoveredFood, this.food, adjustedDeltas.food);
    const spentRecoveredBait = this.spentRecoveredUses(this.recoveredBait, this.bait, adjustedDeltas.bait);
    this.health += adjustedDeltas.health ?? 0;
    this.hunger += adjustedDeltas.hunger ?? 0;
    this.energy += adjustedDeltas.energy ?? 0;
    this.hull += adjustedDeltas.hull ?? 0;
    this.food += adjustedDeltas.food ?? 0;
    this.bait += adjustedDeltas.bait ?? 0;
    this.repairMaterial += adjustedDeltas.repairMaterial ?? 0;
    this.rescueProgress += adjustedDeltas.rescueProgress ?? 0;
    this.pressure += adjustedDeltas.pressure ?? 0;
    this.clampMeters();
    const consumedFood = spentRecoveredFood > 0
      ? this.inventory.consumePreferred(
        'cannedFood',
        spentRecoveredFood,
        selectedInstanceId,
        excludedInstanceIds,
      )
      : [];
    const consumedBait = spentRecoveredBait > 0
      ? this.inventory.consumePreferred(
        'baitTin',
        spentRecoveredBait,
        selectedInstanceId,
        excludedInstanceIds,
      )
      : [];
    this.recoveredFood -= consumedFood.length;
    this.recoveredBait -= consumedBait.length;
    const consumed = [...consumedFood, ...consumedBait];
    return consumed.length === 0 ? [] : [{ kind: 'consume', instanceIds: consumed }];
  }

  private spentRecoveredUses(recovered: number, aggregate: number, delta?: number): number {
    if (delta === undefined || delta >= 0) return 0;
    return Math.min(recovered, aggregate, -delta);
  }

  private consumeCharge(id: ItemId): boolean {
    return this.inventory.consume(id).length > 0;
  }

  private protectedUsableCount(
    type: ItemId,
    excludedInstanceIds: ReadonlySet<ItemInstanceId>,
  ): number {
    return Object.values(this.inventory.snapshot()).filter((item) => (
      item?.type === type
      && item.condition === 'usable'
      && excludedInstanceIds.has(item.instanceId)
    )).length;
  }

  private resolveTerminal(): void {
    if (this.isTerminal()) return;
    if (this.health <= 0) this.state = 'dead';
    else if (this.hull <= 0) this.state = 'sunk';
    if (this.isTerminal()) this.clearPendingEvent();
  }

  private isTerminal(): boolean {
    return this.state === 'rescued' || this.state === 'dead' || this.state === 'sunk';
  }

  private clampMeters(): void {
    const resources = clampSurvivalResources({
      health: this.health,
      hunger: this.hunger,
      energy: this.energy,
      hull: this.hull,
    });
    this.health = resources.health;
    this.hunger = resources.hunger;
    this.energy = resources.energy;
    this.hull = resources.hull;
    this.food = Math.max(0, this.food);
    this.bait = Math.max(0, this.bait);
    this.repairMaterial = Math.max(0, this.repairMaterial);
    this.rescueProgress = Math.max(0, this.rescueProgress);
    this.pressure = Math.min(4, Math.max(0, this.pressure));
  }

  private applyInitialConditions(
    initialConditions: Partial<Record<ItemInstanceId, ItemCondition>> | undefined,
  ): void {
    if (initialConditions === undefined) return;
    for (const [rawInstanceId, condition] of Object.entries(initialConditions)) {
      if (condition === undefined) continue;
      const instanceId = rawInstanceId as ItemInstanceId;
      const item = this.inventory.snapshot()[instanceId];
      if (item === undefined) throw new Error(`Unknown instance: ${instanceId}`);
      const applied = condition === 'usable'
        || (condition === 'broken' && this.inventory.break(instanceId))
        || (condition === 'lost' && this.inventory.lose(instanceId))
        || (condition === 'consumed' && this.inventory.consumeInstance(instanceId));
      if (!applied) throw new Error(`Illegal condition for ${instanceId}: ${condition}`);
    }
  }
}

import {
  ITEM_DEFINITIONS,
  type ItemId,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import type { DeathCause, EndingRecord } from '../game/ending';
import {
  SURVIVAL_EVENTS,
  drawWeightedEvent,
  eligibleEvents,
  isDriftingItemEventId,
  survivalEventById,
} from './events';
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
import { mulberry32 } from './random';
import {
  CHEST_OPEN_ENERGY,
  drawChestReward,
  shouldBecomeMimic,
} from './chest';
import {
  pressureForDay,
  pressureIncreaseForDay,
} from './RunPressure';
import {
  clampRescueLead,
  quietNightChance,
  repairEnergyCost,
  rescueChanceForDay,
  type RescueLead,
  SURVIVAL_BALANCE,
} from './survivalBalance';
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
    | 'rescueLead'
    | 'food'
    | 'bait'
  >>;
  initialConditions?: Partial<Record<ItemInstanceId, ItemCondition>>;
  initialEventId?: string;
  initialChest?: ChestSnapshot;
  initialAppearanceCounts?: Readonly<Record<string, number>>;
  initialCarlitos?: Partial<CarlitosSnapshot>;
  readonly initialRescueTraceFinds?: number;
}

export type { DayActionOption } from './survivalTypes';
export type { BeginFishingResult } from './survivalTypes';

interface Rejection {
  code: string;
  message: string;
}

interface ActiveFishingTransaction {
  readonly attempt: FishingSession;
  readonly capturedBait: boolean;
  readonly previousActedToday: boolean;
}

export class SurvivalSession {
  private state: SurvivalState = 'day';
  private readonly savedPickupCount: number;
  private ending: EndingRecord | null = null;
  private lastHealthCause: DeathCause = { kind: 'other' };
  private lastHullEventId: string | null = null;
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
  private rescueLead: RescueLead;
  private rescueTraceFinds: 0 | 1 | 2;
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
    this.rescueLead = clampRescueLead(options.initial?.rescueLead ?? 0);
    this.rescueTraceFinds = Math.min(
      2,
      Math.max(0, Math.trunc(options.initialRescueTraceFinds ?? 0)),
    ) as 0 | 1 | 2;
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
    this.savedPickupCount = savedItems.length;
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
      ending: this.ending,
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
      rescueLead: this.rescueLead,
      rescueTraceFinds: this.rescueTraceFinds,
      chest: Object.freeze({
        state: this.chestState,
        acquiredDay: this.chestAcquiredDay,
      }),
      weather: this.weather,
      actedToday: this.actedToday,
      journalEntries: this.journalSnapshot(),
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
    return this.unavailable(action, option)?.message ?? null;
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
    let rejection: ActionOutcome | null = null;
    if (this.activeFishing !== null) {
      rejection = this.fishingInProgress();
    } else if (this.isTerminal()) {
      rejection = this.reject('terminal', 'The survival journey has already ended.');
    } else if (this.state !== 'day') {
      rejection = this.reject('not-daytime', 'Fishing is only available during the day.');
    } else if (this.energy < SURVIVAL_BALANCE.actions.fishEnergy) {
      rejection = this.reject('not-enough-energy', 'Fishing requires two energy.');
    }
    if (rejection !== null) return { accepted: false, outcome: rejection };

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
    if (this.activeFishing !== null) return this.fishingInProgress();
    if (this.isTerminal()) return this.reject('terminal', 'The survival journey has already ended.');
    if (this.state !== 'day') return this.reject('not-daytime', 'The day cannot end while an event is unresolved.');

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

    if (this.random.next() < quietNightChance(this.pressure)) {
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
        event.id,
        mutationExclusions,
        selectedInstanceId,
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
    if (resolved.effects.ending === 'taken') {
      this.ending = Object.freeze({
        id: 'taken',
        day: this.day,
        savedPickupCount: this.savedPickupCount,
      });
      this.state = 'dead';
    }

    this.resolveTerminal();
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
      this.lastHealthCause = { kind: 'starvation' };
      deltas.health = -SURVIVAL_BALANCE.dawn.starvationDamage;
    }

    const dawn = this.commit('dawn', 'Another dawn breaks over the lifeboat.', deltas, 'dawn');
    if (this.isTerminal()) return dawn;

    const rescueChance = rescueChanceForDay(this.day, this.rescueLead);
    if (rescueChance > 0 && this.random.next() < rescueChance) {
      this.ending = Object.freeze({
        id: 'rescue',
        day: this.day,
        savedPickupCount: this.savedPickupCount,
        signalAssisted: this.rescueLead > 0,
      });
      this.state = 'rescued';
      this.clearPendingEvent();
      return this.commit(
        'rescued',
        'A rescue vessel finds the lifeboat at dawn.',
        {},
        'rescue',
      );
    }

    this.openDayEventAfterDawn();
    return dawn;
  }

  private unavailable(action: DayActionId, option?: DayActionOption): Rejection | null {
    if (this.activeFishing !== null) {
      return { code: 'fishing-in-progress', message: 'Finish the active fishing attempt first.' };
    }
    const invalidOption = this.invalidOption(action, option);
    if (invalidOption !== null) return invalidOption;
    if (this.isTerminal()) return { code: 'terminal', message: 'The survival journey has already ended.' };
    if (this.state !== 'day') return { code: 'not-daytime', message: 'That action is only available during the day.' };
    switch (action) {
      case 'fish':
        if (this.energy < SURVIVAL_BALANCE.actions.fishEnergy) {
          return { code: 'not-enough-energy', message: 'Fishing requires two energy.' };
        }
        return null;
      case 'dive':
        if (!this.inventory.hasUsable('scubaSet')) {
          return { code: 'no-scuba-set', message: 'Diving requires a recovered scuba set.' };
        }
        if (this.weather === 'squall') {
          return { code: 'weather-blocked', message: 'Diving is too dangerous during a squall.' };
        }
        if (this.energy < SURVIVAL_BALANCE.actions.diveEnergy) {
          return { code: 'not-enough-energy', message: 'Diving requires three energy.' };
        }
        return null;
      case 'eat':
        if (this.food < 1) return { code: 'no-food', message: 'No food remains.' };
        if (this.hunger <= 0) return { code: 'not-hungry', message: 'You are not hungry.' };
        return null;
      case 'repair':
        if (this.hull >= SURVIVAL_BALANCE.thresholds.maximum) {
          return { code: 'hull-full', message: 'The hull needs no repair.' };
        }
        {
          const energyCost = repairEnergyCost(this.hull);
          if (this.energy < energyCost) {
            const energyWord = ['', 'one', 'two', 'three'][energyCost];
            return {
              code: 'not-enough-energy',
              message: `Repairing requires ${energyWord} energy.`,
            };
          }
        }
        if (option?.kind === 'hullRepair' && option.material === 'ductTape') {
          if (!this.inventory.hasUsable('ductTape')) {
            return { code: 'no-duct-tape', message: 'No duct tape remains.' };
          }
          return null;
        }
        if (this.repairMaterial < 1) {
          return { code: 'no-repair-material', message: 'No repair material remains.' };
        }
        return null;
      case 'repairItem': {
        if (!this.inventory.hasUsable('ductTape')) {
          return { code: 'no-duct-tape', message: 'No duct tape remains.' };
        }
        if (option?.kind !== 'itemRepair') {
          return { code: 'no-repair-target', message: 'Choose a broken item to repair.' };
        }
        const target = this.inventory.snapshot()[option.target];
        if (target === undefined || target.condition !== 'broken' || !ITEM_DEFINITIONS[target.type].breakable) {
          return { code: 'item-not-repairable', message: 'That item cannot be repaired.' };
        }
        return null;
      }
      case 'treat':
        if (this.health >= SURVIVAL_BALANCE.thresholds.maximum) {
          return { code: 'health-full', message: 'No treatment is needed.' };
        }
        if (!this.inventory.hasUsable('medicalKit')) {
          return { code: 'no-medical-kit', message: 'No medical-kit charges remain.' };
        }
        return null;
      case 'sendMessage':
        if (this.rescueMessageSent) {
          return { code: 'message-already-sent', message: 'You already sent the rescue message.' };
        }
        if (!this.inventory.hasUsable('bottledPaper')) {
          return { code: 'no-bottled-paper', message: 'No bottled paper remains.' };
        }
        if (this.energy < SURVIVAL_BALANCE.actions.bottledPaperEnergy) {
          return { code: 'not-enough-energy', message: 'Sending the message requires one energy.' };
        }
        return null;
      case 'useEnergyBar':
        if (!this.inventory.hasUsable('energyBar')) {
          return { code: 'no-energy-bar', message: 'No energy bar remains.' };
        }
        if (this.energy >= SURVIVAL_BALANCE.actions.maximumEnergy) {
          return { code: 'energy-full', message: 'Your energy is already full.' };
        }
        return null;
      case 'openChest':
        if (this.chestState !== 'closed') {
          return { code: 'no-closed-chest', message: 'There is no closed chest to open.' };
        }
        if (this.energy < CHEST_OPEN_ENERGY) {
          return { code: 'not-enough-energy', message: 'Opening the chest requires three energy.' };
        }
        return null;
      case 'petCarlitos':
        return this.unavailableCarlitosCare('pet');
      case 'feedCarlitos':
        return this.unavailableCarlitosCare('feed');
      case 'treatCarlitos':
        return this.unavailableCarlitosCare('treat');
      case 'endDay':
        return null;
    }
  }

  private invalidOption(action: DayActionId, option?: DayActionOption): Rejection | null {
    const valid = action === 'fish'
      ? option === undefined
      : action === 'repair'
        ? option?.kind === 'hullRepair'
        : action === 'repairItem'
          ? option?.kind === 'itemRepair'
          : option === undefined;
    return valid ? null : { code: 'invalid-option', message: 'That option cannot be used for this action.' };
  }

  private unavailableCarlitosCare(action: 'pet' | 'feed' | 'treat'): Rejection | null {
    if (this.carlitos === null) {
      return { code: 'no-carlitos', message: 'Carlitos is not aboard.' };
    }
    if (!this.carlitos.alive) {
      return { code: 'carlitos-dead', message: 'Carlitos cannot respond.' };
    }
    if (action === 'pet' && this.carlitos.pettedToday) {
      return { code: 'already-petted', message: 'Carlitos has already been petted today.' };
    }
    if (action === 'feed') {
      if (this.carlitos.hunger >= 5) {
        return { code: 'carlitos-not-hungry', message: 'Carlitos is already satiated.' };
      }
      if (this.food < 1) return { code: 'no-food', message: 'No food remains.' };
    }
    if (action === 'treat') {
      if (this.carlitos.sickness <= 0) {
        return { code: 'carlitos-healthy', message: 'Carlitos needs no treatment.' };
      }
      if (!this.inventory.hasUsable('medicalKit')) {
        return { code: 'no-medical-kit', message: 'No medical kit remains.' };
      }
    }
    return null;
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
    if (injured) {
      this.lastHealthCause = { kind: 'diving' };
      deltas.health = -SURVIVAL_BALANCE.diving.injuryDamage;
    }

    if (recovered) {
      const rewardRoll = this.random.next();
      if (rewardRoll < 0.25) deltas.food = 1;
      else if (rewardRoll < 0.5) deltas.bait = 1;
      else if (rewardRoll < 0.75) deltas.repairMaterial = 1;
      else if (this.rescueTraceFinds < 2) {
        this.rescueTraceFinds = (this.rescueTraceFinds + 1) as 1 | 2;
        deltas.rescueLead = 1;
      }
    }

    return this.commit(
      recovered ? 'dive-recovered' : 'dive-empty',
      recovered ? 'You surfaced with useful salvage.' : 'You found nothing beneath the boat.',
      deltas,
      'dive',
    );
  }

  private eat(): ActionOutcome {
    return this.commit(
      'ate',
      'The food takes the edge off your hunger.',
      {
        hunger: SURVIVAL_BALANCE.actions.foodHunger,
        food: -1,
      },
      'none',
    );
  }

  private repair(option?: DayActionOption): ActionOutcome {
    const energyCost = repairEnergyCost(this.hull);
    if (option?.kind === 'hullRepair' && option.material === 'ductTape') {
      this.inventory.consume('ductTape', 1);
      return this.commit(
        'repaired-with-duct-tape',
        'The emergency patch holds for now.',
        { energy: -energyCost, hull: SURVIVAL_BALANCE.actions.tapeHull },
        'repair',
      );
    }

    return this.commit(
      'repaired',
      'You reinforce the damaged hull.',
      {
        energy: -energyCost,
        hull: SURVIVAL_BALANCE.actions.repairHull,
        repairMaterial: -1,
      },
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
    this.inventory.consume('medicalKit', 1);
    return this.commit(
      'treated',
      'You clean and dress your wounds.',
      { health: SURVIVAL_BALANCE.actions.treatmentHealth },
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
    this.inventory.consume('bottledPaper', 1);
    this.rescueMessageSent = true;
    return this.commit('message-sent', 'You cast the message into the current.', {
      energy: -SURVIVAL_BALANCE.actions.bottledPaperEnergy,
      rescueLead: 2,
    }, 'sighting');
  }

  private useEnergyBar(): ActionOutcome {
    this.inventory.consume('energyBar', 1);
    return this.commit('energy-bar-used', 'The ration restores your strength.', {
      energy: SURVIVAL_BALANCE.actions.maximumEnergy - this.energy,
    }, 'none');
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
    const pool = eligibleEvents(SURVIVAL_EVENTS, {
      phase,
      day: this.day,
      weather: this.weather,
      lastEventId: this.lastEventId,
      lastSeenDay: this.lastSeenDay,
      targetableItemIds: this.targetableItemIds(),
      appearanceCounts: this.appearanceCounts,
      inventoryItemIds: this.targetableItemIds(),
      rescueLead: this.rescueLead,
      pressure: this.pressure,
      chestState: this.chestState,
      hasLivingCompanion: this.carlitos?.alive === true,
    }).filter(({ id }) => (
      !excludedIds.has(id)
      && !(id === 'drifting-bottle' && this.rescueMessageSent)
    ));
    return drawWeightedEvent(pool, this.random, phase, this.pressure);
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
      inventoryMutations: this.cloneInventoryMutations(inventoryMutations),
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
      actions: this.cloneJournalActions(this.pendingJournalActions),
      daytime: this.pendingJournalDaytime,
      nighttime: this.pendingJournalNighttime,
    });
  }

  private cloneJournalNight(record: JournalNightRecord): JournalNightRecord {
    return record.kind === 'quiet'
      ? { kind: 'quiet' }
      : { kind: 'event', event: this.cloneJournalRecord(record.event) };
  }

  private journalSnapshot(): readonly JournalEntry[] {
    return Object.freeze(this.journalEntries.map((entry) => Object.freeze({
      ...entry,
      actions: this.cloneJournalActions(entry.actions),
      daytime: entry.daytime === null
        ? null
        : this.cloneJournalDaytime(entry.daytime),
      nighttime: Object.freeze(this.cloneJournalNight(entry.nighttime)),
    })));
  }

  private cloneJournalRecord(record: JournalEventRecord): JournalEventRecord {
    return Object.freeze({
      ...record,
      inventoryMutations: this.cloneInventoryMutations(record.inventoryMutations),
    });
  }

  private cloneJournalActions(
    actions: readonly JournalDayActionRecord[],
  ): readonly JournalDayActionRecord[] {
    return Object.freeze(actions.map((action) => Object.freeze({ ...action })));
  }

  private cloneInventoryMutations(
    mutations: readonly JournalInventoryMutation[],
  ): readonly JournalInventoryMutation[] {
    return Object.freeze(mutations.map((mutation) => Object.freeze({
      kind: mutation.kind,
      instanceIds: Object.freeze([...mutation.instanceIds]),
    })));
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
      rescueLead: this.rescueLead,
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
    eventId: string,
    excludedInstanceIds: ReadonlySet<ItemInstanceId>,
    selectedInstanceId: ItemInstanceId | null,
  ): JournalInventoryMutation[] {
    if (typeof effect.value !== 'number') {
      throw new Error(`Event resource ${effect.resource} was not resolved to a concrete value.`);
    }
    if (effect.operation === 'subtract' && effect.resource === 'health') {
      this.lastHealthCause = { kind: 'event', eventId };
    }
    if (effect.operation === 'subtract' && effect.resource === 'hull') {
      this.lastHullEventId = eventId;
    }
    const current = this.resourceValues()[effect.resource];
    const delta = effect.operation === 'set'
      ? effect.value - current
      : effect.operation === 'add' ? effect.value : -effect.value;
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
      actions: this.cloneJournalActions([
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

  private cloneJournalDaytime(record: JournalDaytimeRecord): JournalDaytimeRecord {
    return 'kind' in record
      ? Object.freeze({ kind: 'sinkingShip' })
      : this.cloneJournalRecord(record);
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
    this.rescueLead = clampRescueLead(
      this.rescueLead + (adjustedDeltas.rescueLead ?? 0),
    );
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
    if (this.ending !== null) return;
    if (this.health <= 0) {
      this.state = 'dead';
      this.ending = Object.freeze({
        id: 'death', day: this.day, savedPickupCount: this.savedPickupCount,
        cause: Object.freeze({ ...this.lastHealthCause }),
      });
    } else if (this.hull <= 0) {
      this.state = 'sunk';
      this.ending = Object.freeze({
        id: 'sinking', day: this.day, savedPickupCount: this.savedPickupCount,
        cause: Object.freeze({ eventId: this.lastHullEventId }),
      });
    }
    if (this.ending !== null) this.clearPendingEvent();
  }

  private isTerminal(): boolean {
    return this.state === 'rescued' || this.state === 'dead' || this.state === 'sunk';
  }

  private clampMeters(): void {
    this.health = Math.min(100, Math.max(0, this.health));
    this.hunger = Math.min(100, Math.max(0, this.hunger));
    this.energy = Math.min(SURVIVAL_BALANCE.actions.maximumEnergy, Math.max(0, this.energy));
    this.hull = Math.min(100, Math.max(0, this.hull));
    this.food = Math.max(0, this.food);
    this.bait = Math.max(0, this.bait);
    this.repairMaterial = Math.max(0, this.repairMaterial);
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

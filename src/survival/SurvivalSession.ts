import {
  ITEM_DEFINITIONS,
  type ItemId,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import { SURVIVAL_EVENTS, drawWeightedEvent, eligibleEvents } from './events';
import { resolveWeightedOutcome } from './eventResolver';
import { FishingSession, type FishingTerminalResult } from './FishingSession';
import { SurvivalInventoryState } from './inventory';
import type {
  JournalDayActionRecord,
  JournalEntry,
  JournalEventRecord,
  JournalNightRecord,
  JournalInventoryMutation,
  JournalResolution,
} from './journal';
import { mulberry32 } from './random';
import { SURVIVAL_BALANCE } from './survivalBalance';
import type {
  ActionOutcome,
  BeginFishingResult,
  DayActionOption,
  DayActionId,
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
  WeatherId,
} from './survivalTypes';

export interface SurvivalSessionOptions {
  seed: number;
  random?: RandomSource;
  weather?: WeatherId;
  initial?: Partial<Pick<SurvivalSnapshot, 'health' | 'hunger' | 'energy' | 'hull' | 'day' | 'rescueProgress'>>;
  initialConditions?: Partial<Record<ItemInstanceId, ItemCondition>>;
  initialEventId?: string;
}

declare module './survivalTypes' {
  interface SurvivalSnapshot {
    readonly pendingEventTargetId?: ItemInstanceId | null;
  }
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
}

type DayActivity = 'none' | 'fishing' | 'other';

export class SurvivalSession {
  private state: SurvivalState = 'day';
  private day: number;
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
  private weather: WeatherId;
  private actedToday = false;
  private dayActivity: DayActivity = 'none';
  private dayEventOccurred = false;
  private readonly inventory: SurvivalInventoryState;
  private readonly savedItems: readonly ItemInstance[];
  private pendingEventId: string | null;
  private pendingEvent: SurvivalEventDefinition | null = null;
  private pendingEventTargetId: ItemInstanceId | null = null;
  private lastEventId: string | null = null;
  private readonly lastSeenDay = new Map<string, number>();
  private lastOutcome: ActionOutcome | null = null;
  private pendingJournalDaytime: JournalEventRecord | null = null;
  private pendingJournalNighttime: JournalNightRecord | null = null;
  private pendingJournalActions: JournalDayActionRecord[] = [];
  private readonly journalEntries: JournalEntry[] = [];
  private readonly seed: number;
  private readonly random: RandomSource;
  private fishingCounter = 0;
  private activeFishing: ActiveFishingTransaction | null = null;

  constructor(savedItems: readonly ItemInstance[], options: SurvivalSessionOptions) {
    this.seed = options.seed;
    this.random = options.random ?? mulberry32(options.seed);
    this.weather = options.weather ?? 'calm';
    this.day = options.initial?.day ?? 1;
    this.health = options.initial?.health ?? SURVIVAL_BALANCE.start.health;
    this.hunger = options.initial?.hunger ?? SURVIVAL_BALANCE.start.hunger;
    this.energy = options.initial?.energy ?? SURVIVAL_BALANCE.start.energy;
    this.hull = options.initial?.hull ?? SURVIVAL_BALANCE.start.hull;
    this.rescueProgress = options.initial?.rescueProgress ?? 0;
    this.pendingEventId = null;
    this.savedItems = Object.freeze(savedItems.map((item) => Object.freeze({ ...item })));
    this.inventory = new SurvivalInventoryState(this.savedItems);
    this.applyInitialConditions(options.initialConditions);

    if (options.initialEventId !== undefined) {
      const initialEvent = SURVIVAL_EVENTS.find((event) => event.id === options.initialEventId);
      if (initialEvent === undefined) throw new Error(`Unknown survival event: ${options.initialEventId}`);
      this.openEvent(initialEvent);
      this.dayEventOccurred = initialEvent.phase === 'day';
    }

    this.recoveredFood = this.inventory.count('cannedFood', 'usable');
    this.recoveredBait = this.inventory.count('baitTin', 'usable');
    this.bait = this.recoveredBait;
    this.food = this.recoveredFood;

    this.clampMeters();
    this.resolveTerminal();
  }

  snapshot(): SurvivalSnapshot {
    const lastOutcome = this.lastOutcome === null
      ? null
      : { ...this.lastOutcome, deltas: { ...this.lastOutcome.deltas } };

    return {
      state: this.state,
      day: this.day,
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
      weather: this.weather,
      actedToday: this.actedToday,
      journalEntries: this.journalSnapshot(),
      inventory: this.inventory.snapshot(),
      savedItems: this.savedItems,
      pendingEventId: this.pendingEventId,
      pendingEventTargetId: this.pendingEventTargetId,
      lastOutcome,
      seed: this.seed,
    };
  }

  availableReason(action: DayActionId, option?: DayActionOption): string | null {
    return this.unavailable(action, option)?.message ?? null;
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
      case 'endDay': return this.endDay();
    }
    this.dayActivity = 'other';
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
    } else if (this.dayActivity === 'other') {
      rejection = this.reject(
        'fishing-activity-chosen',
        'Another daytime activity has already been chosen.',
      );
    } else if (this.energy < SURVIVAL_BALANCE.actions.fishEnergy) {
      rejection = this.reject('not-enough-energy', 'Fishing requires one energy.');
    }
    if (rejection !== null) return { accepted: false, outcome: rejection };

    const capturedBait = this.bait > 0;
    const attempt = new FishingSession({
      id: `fishing-${this.day}-${++this.fishingCounter}`,
      day: this.day,
      capturedBait,
      random: this.random,
    });
    const outcome = this.commit(
      'fishing-started',
      'You ready the line and look for a place to cast.',
      { energy: -SURVIVAL_BALANCE.actions.fishEnergy },
      'none',
    );
    this.actedToday = true;
    this.dayActivity = 'fishing';
    this.activeFishing = { attempt, capturedBait };
    return { accepted: true, outcome, attempt };
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

    const isCatch = result.kind === 'catch';
    const isFish = isCatch && result.catch.kind === 'fish';
    const food = isFish ? result.catch.food : 0;
    const baitConsumed = isFish && transaction.capturedBait;
    const deltas: ResourceDelta = {};
    if (food > 0) deltas.food = food;
    if (baitConsumed) deltas.bait = -1;
    const code = result.kind === 'miss' ? 'fish-missed' : isFish ? 'fish-caught' : 'junk-caught';
    const message = result.kind === 'miss'
      ? 'The fish got away.'
      : isFish
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
    if (this.activeFishing !== null) return this.fishingInProgress();
    if (this.isTerminal()) return this.reject('terminal', 'The survival journey has already ended.');
    if (this.state !== 'day') return this.reject('not-daytime', 'A day event cannot begin right now.');
    if (this.dayActivity === 'fishing') {
      return this.reject(
        'fishing-day-event-disabled',
        'Fishing results replace today\'s daytime event.',
      );
    }
    if (!this.actedToday) return this.reject('act-first', 'Take a survival action before looking beyond the boat.');
    if (this.dayEventOccurred) return this.reject('day-event-used', 'Today\'s event has already passed.');

    const event = this.drawEvent('day');
    this.dayEventOccurred = true;
    this.openEvent(event);
    return this.commit('event-opened', event.prompt, {}, event.cue);
  }

  endDay(): ActionOutcome {
    if (this.activeFishing !== null) return this.fishingInProgress();
    if (this.isTerminal()) return this.reject('terminal', 'The survival journey has already ended.');
    if (this.state !== 'day') return this.reject('not-daytime', 'The day cannot end while an event is unresolved.');

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

  resolveEvent(response: EventResponse | EventResponseId | null): ActionOutcome {
    if (this.activeFishing !== null) return this.fishingInProgress();
    if (this.isTerminal()) return this.reject('terminal', 'The survival journey has already ended.');
    if ((this.state !== 'dayEvent' && this.state !== 'nightEvent') || this.pendingEvent === null) {
      return this.reject('no-event', 'There is no unresolved event.');
    }

    const event = this.pendingEvent;
    const physicalResponse = typeof response === 'object' && response !== null ? response : null;
    const choiceId: EventResponseId | null = physicalResponse?.kind === 'item'
      ? physicalResponse.choiceId
      : physicalResponse?.kind === 'endure'
        ? null
        : typeof response === 'string' ? response : null;
    let selectedInstanceId: ItemInstanceId | null = null;
    let choice = event.choices.find((candidate) => candidate.id === (choiceId ?? 'sleep'));
    let attemptedItemId: ItemId | null = choice?.itemId ?? null;
    const mutationExclusions = new Set<ItemInstanceId>();
    let resolution: JournalResolution = choice?.itemId === undefined ? 'endure' : 'suitableItem';

    if (physicalResponse?.kind === 'endure') {
      if (this.hasUsableEventChoice(event)) {
        return this.reject('endure-unavailable', 'Use one of the highlighted items to face this event.');
      }
      choice = event.choices.find((candidate) => candidate.itemId === undefined);
      if (choice === undefined) {
        throw new Error(`Event ${event.id} requires exactly one itemless fallback choice.`);
      }
      attemptedItemId = null;
      resolution = 'endure';
    } else if (physicalResponse?.kind === 'item') {
      const instance = this.inventory.snapshot()[physicalResponse.instanceId];
      if (
        choice?.itemId === undefined
        || instance?.type !== choice.itemId
        || instance.condition !== 'usable'
      ) {
        return this.reject('item-unavailable', 'That item was not recovered or has no uses remaining.');
      }
      selectedInstanceId = physicalResponse.instanceId;
      attemptedItemId = choice.itemId;
      resolution = 'suitableItem';
    }

    if (choice === undefined) {
      if (choiceId === null || !Object.hasOwn(ITEM_DEFINITIONS, choiceId)) {
        return this.reject('choice-unavailable', 'That response is not available for this event.');
      }
      attemptedItemId = choiceId as ItemId;
      const attemptedInstanceId = this.usableEventItemInstanceId(attemptedItemId);
      if (attemptedInstanceId === null) {
        return this.reject('item-unavailable', 'That item was not recovered or has no uses remaining.');
      }
      mutationExclusions.add(attemptedInstanceId);
      choice = event.choices.find((candidate) => candidate.itemId === undefined);
      if (choice === undefined) {
        throw new Error(`Event ${event.id} requires exactly one itemless fallback choice.`);
      }
      resolution = 'unsuitableItem';
    }
    if (choice.itemId !== undefined && !this.canUseEventItem(choice.itemId)) {
      return this.reject('item-unavailable', 'That item was not recovered or has no uses remaining.');
    }

    const phase = event.phase;
    const before = this.resourceValues();
    const resolved = resolveWeightedOutcome(choice, this.random);
    const inventoryMutations: JournalInventoryMutation[] = [];
    for (const effect of resolved.effects.resources ?? []) {
      inventoryMutations.push(...this.applyEventResource(
        effect,
        mutationExclusions,
        selectedInstanceId,
      ));
    }
    for (const mutation of resolved.effects.items ?? []) {
      const concrete = this.applyEventMutation(
        mutation,
        mutationExclusions,
        selectedInstanceId,
      );
      if (concrete !== null) inventoryMutations.push(concrete);
    }

    if (resolved.effects.rescue === true) this.state = 'rescued';
    else this.resolveTerminal();
    this.lastEventId = event.id;
    this.lastSeenDay.set(event.id, this.day);
    this.pendingEvent = null;
    this.pendingEventId = null;
    this.pendingEventTargetId = null;

    const after = this.resourceValues();
    const deltas = this.appliedResourceDelta(before, after);
    const cue = physicalResponse === null
      ? this.presentationCue(event.cue)
      : this.presentationCue('none');
    const outcome: ActionOutcome = {
      accepted: true,
      code: 'event-resolved',
      message: resolution === 'unsuitableItem'
        ? `That item cannot help. ${resolved.message}`
        : resolved.message,
      deltas,
      cue,
    };
    this.lastOutcome = outcome;
    this.recordJournalEvent(
      event,
      choiceId,
      attemptedItemId,
      resolution,
      outcome,
      inventoryMutations,
    );

    if (!this.isTerminal()) {
      if (phase === 'day') this.state = 'day';
      else this.state = 'nightEvent';
    }
    return { ...outcome, deltas: { ...outcome.deltas } };
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
    this.dayActivity = 'none';
    this.dayEventOccurred = false;
    this.pendingEvent = null;
    this.pendingEventId = null;
    this.pendingEventTargetId = null;
    this.state = 'day';

    const weatherRoll = this.random.next();
    this.weather = weatherRoll < 0.60 ? 'calm' : weatherRoll < 0.85 ? 'overcast' : 'squall';

    const hungerAfterDawn = Math.min(
      SURVIVAL_BALANCE.thresholds.maximum,
      this.hunger + SURVIVAL_BALANCE.dawn.hungerIncrease,
    );
    const morningEnergy = hungerAfterDawn >= SURVIVAL_BALANCE.thresholds.starving
      ? SURVIVAL_BALANCE.dawn.starvingEnergy
      : hungerAfterDawn >= SURVIVAL_BALANCE.thresholds.hungry
        ? SURVIVAL_BALANCE.dawn.hungryEnergy
        : SURVIVAL_BALANCE.dawn.normalEnergy;
    const deltas: ResourceDelta = {
      hunger: SURVIVAL_BALANCE.dawn.hungerIncrease,
      energy: morningEnergy - this.energy,
    };
    if (hungerAfterDawn >= SURVIVAL_BALANCE.thresholds.maximum) {
      deltas.health = -SURVIVAL_BALANCE.dawn.starvationDamage;
    }

    const dawn = this.commit('dawn', 'Another dawn breaks over the lifeboat.', deltas, 'dawn');
    if (this.isTerminal() || this.day < SURVIVAL_BALANCE.rescue.firstDay) return dawn;

    const baseChance = Math.min(
      SURVIVAL_BALANCE.rescue.chanceCap,
      SURVIVAL_BALANCE.rescue.initialChance
        + (this.day - SURVIVAL_BALANCE.rescue.firstDay) * SURVIVAL_BALANCE.rescue.dailyIncrease,
    );
    const progressChance = Math.min(SURVIVAL_BALANCE.rescue.progressCap, this.rescueProgress) / 100;
    if (this.random.next() >= Math.min(0.85, baseChance + progressChance)) return dawn;

    this.state = 'rescued';
    return this.commit('rescued', 'A rescue vessel finds the lifeboat at dawn.', {}, 'rescue');
  }

  private unavailable(action: DayActionId, option?: DayActionOption): Rejection | null {
    if (this.activeFishing !== null) {
      return { code: 'fishing-in-progress', message: 'Finish the active fishing attempt first.' };
    }
    const invalidOption = this.invalidOption(action, option);
    if (invalidOption !== null) return invalidOption;
    if (this.isTerminal()) return { code: 'terminal', message: 'The survival journey has already ended.' };
    if (this.state !== 'day') return { code: 'not-daytime', message: 'That action is only available during the day.' };
    if (action !== 'fish' && action !== 'endDay' && this.dayActivity === 'fishing') {
      return {
        code: 'fishing-activity-chosen',
        message: 'Fishing is today\'s chosen activity.',
      };
    }

    switch (action) {
      case 'fish':
        if (this.dayActivity === 'other') {
          return {
            code: 'fishing-activity-chosen',
            message: 'Another daytime activity has already been chosen.',
          };
        }
        if (this.energy < SURVIVAL_BALANCE.actions.fishEnergy) {
          return { code: 'not-enough-energy', message: 'Fishing requires one energy.' };
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
        if (this.energy < SURVIVAL_BALANCE.actions.repairEnergy) {
          return { code: 'not-enough-energy', message: 'Repairing requires two energy.' };
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
    return this.commit(
      'ate',
      'The food takes the edge off your hunger.',
      { hunger: SURVIVAL_BALANCE.actions.foodHunger, food: -1 },
      'none',
    );
  }

  private repair(option?: DayActionOption): ActionOutcome {
    if (option?.kind === 'hullRepair' && option.material === 'ductTape') {
      this.inventory.consume('ductTape', 1);
      return this.commit(
        'repaired-with-duct-tape',
        'The emergency patch holds for now.',
        { energy: -SURVIVAL_BALANCE.actions.repairEnergy, hull: SURVIVAL_BALANCE.actions.tapeHull },
        'repair',
      );
    }

    return this.commit(
      'repaired',
      'You reinforce the damaged hull.',
      {
        energy: -SURVIVAL_BALANCE.actions.repairEnergy,
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

  private sendMessage(): ActionOutcome {
    this.inventory.consume('bottledPaper', 1);
    return this.commit('message-sent', 'You cast the message into the current.', {
      energy: -SURVIVAL_BALANCE.actions.bottledPaperEnergy,
      rescueProgress: SURVIVAL_BALANCE.actions.bottledPaperRescueProgress,
    }, 'sighting');
  }

  private useEnergyBar(): ActionOutcome {
    this.inventory.consume('energyBar', 1);
    return this.commit('energy-bar-used', 'The ration restores your strength.', {
      energy: SURVIVAL_BALANCE.actions.maximumEnergy - this.energy,
    }, 'none');
  }

  private drawEvent(phase: 'day' | 'night'): SurvivalEventDefinition {
    const pool = eligibleEvents(SURVIVAL_EVENTS, {
      phase,
      day: this.day,
      weather: this.weather,
      lastEventId: this.lastEventId,
      lastSeenDay: this.lastSeenDay,
      targetableItemIds: this.targetableItemIds(),
    });
    return drawWeightedEvent(pool, this.random, phase);
  }

  private recordJournalEvent(
    event: SurvivalEventDefinition,
    attemptedChoiceId: string | null,
    attemptedItemId: ItemId | null,
    resolution: JournalResolution,
    outcome: ActionOutcome,
    inventoryMutations: readonly JournalInventoryMutation[],
  ): void {
    const record: JournalEventRecord = {
      phase: event.phase,
      eventId: event.id,
      title: event.title,
      prompt: event.prompt,
      attemptedChoiceId,
      attemptedItemId,
      resolution,
      outcomeCode: outcome.code,
      outcomeMessage: outcome.message,
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
    return this.journalEntries.map((entry) => ({
      ...entry,
      actions: this.cloneJournalActions(entry.actions),
      daytime: entry.daytime === null ? null : this.cloneJournalRecord(entry.daytime),
      nighttime: this.cloneJournalNight(entry.nighttime),
    }));
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
      choice.itemId !== undefined && this.canUseEventItem(choice.itemId)
    ));
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

  private commit(code: string, message: string, deltas: ResourceDelta, cue: PresentationCue): ActionOutcome {
    const before = this.resourceValues();
    this.applyDeltas(deltas);
    this.resolveTerminal();
    const after = this.resourceValues();
    const applied = Object.fromEntries(Object.keys(deltas).map((key) => {
      const resource = key as keyof ResourceDelta;
      return [resource, after[resource] - before[resource]];
    })) as ResourceDelta;
    const terminalCue = this.state === 'dead' ? 'death' : this.state === 'sunk' ? 'sinking' : this.state === 'rescued' ? 'rescue' : cue;
    const outcome: ActionOutcome = { accepted: true, code, message, deltas: applied, cue: terminalCue };
    this.lastOutcome = outcome;
    return { ...outcome, deltas: { ...outcome.deltas } };
  }

  private resourceValues(): Required<ResourceDelta> {
    return {
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
    preferredInstanceId: ItemInstanceId | null,
  ): JournalInventoryMutation[] {
    if (typeof effect.value !== 'number') {
      throw new Error(`Event resource ${effect.resource} was not resolved to a concrete value.`);
    }
    const current = this.resourceValues()[effect.resource];
    const delta = effect.operation === 'set'
      ? effect.value - current
      : effect.operation === 'add' ? effect.value : -effect.value;
    return this.applyDeltas(
      { [effect.resource]: delta },
      excludedInstanceIds,
      preferredInstanceId,
    );
  }

  private applyEventMutation(
    mutation: EventInventoryMutation,
    excludedInstanceIds: ReadonlySet<ItemInstanceId>,
    preferredInstanceId: ItemInstanceId | null,
  ): JournalInventoryMutation | null {
    let kind: JournalInventoryMutation['kind'];
    let instanceIds: ItemInstanceId[];
    switch (mutation.kind) {
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
    if (instanceIds.length === 0) return null;
    this.synchronizeRemovedResources(kind, instanceIds);
    return { kind, instanceIds };
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
    preferredInstanceId: ItemInstanceId | null = null,
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
    this.clampMeters();
    const consumedFood = spentRecoveredFood > 0
      ? this.inventory.consumePreferred(
        'cannedFood',
        spentRecoveredFood,
        preferredInstanceId,
        excludedInstanceIds,
      )
      : [];
    const consumedBait = spentRecoveredBait > 0
      ? this.inventory.consumePreferred(
        'baitTin',
        spentRecoveredBait,
        preferredInstanceId,
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
    this.rescueProgress = Math.max(0, this.rescueProgress);
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

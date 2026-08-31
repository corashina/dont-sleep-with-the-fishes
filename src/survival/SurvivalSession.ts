import {
  ITEM_DEFINITIONS,
  type ItemId,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import type { DeathCause, EndingRecord, SurvivalEndingId } from '../game/ending';
import type { SurvivalReading } from '../game/runStatistics';
import {
  SURVIVAL_EVENTS,
  isDriftingItemEventId,
  isSignalSightingEventId,
  survivalEventById,
} from './eventCatalog';
import { drawWeightedEvent } from './eventSelection';
import { resolveWeightedOutcome } from './eventResolver';
import {
  driftingSupplyKindFromSeed,
  isDriftingSupplyResult,
} from './driftingSupplies';
import { deriveEventVariantSeed } from './eventPresentationOutcome';
import {
  FishingSession,
  type BeginFishingResult,
  type FishingTerminalResult,
} from './FishingSession';
import { fishingSettlement } from './fishingSettlementRules';
import { SurvivalInventoryState } from './inventory';
import {
  cloneJournalActions,
  cloneJournalNight,
  createJournalCarlitosCareRecord,
  createJournalCarlitosDawnRecord,
  createJournalCarlitosDawnState,
  createJournalEntry,
  createJournalEventRecord,
  createJournalFishingRecord,
  createJournalNightEventRecord,
  createJournalSinkingShipRecord,
  createQuietJournalNightRecord,
  journalSnapshot,
  type JournalCarlitosDawnRecord,
  type JournalDayActionRecord,
  type JournalDaytimeRecord,
  type JournalEntry,
  type JournalInventoryMutation,
  type JournalNightRecord,
} from './journalRecords';
import {
  createSurvivalSessionCheckpoint,
  type SurvivalSessionCheckpoint,
} from './SurvivalCheckpoint';
import { Mulberry32Random, mulberry32, restoreMulberry32 } from './random';
import {
  CHEST_OPEN_ENERGY,
  drawChestReward,
  shouldBecomeMimic,
} from './chest';
import { clampSurvivalResources, eventResourceDelta } from './eventOutcomeRules';
import {
  pressureForDay,
  pressureIncreaseForDay,
} from './RunPressure';
import {
  clampRescueLead,
  nightlyHullWearDamage,
  quietNightChance,
  rescueChanceForDay,
  type RescueLead,
  SURVIVAL_BALANCE,
} from './survivalBalance';
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
  DayActionOption,
  DayActionId,
  DawnEnergy,
  EventResponse,
  EventResponseId,
  EventChoiceDefinition,
  EventInventoryMutation,
  ItemCondition,
  PresentationCue,
  RandomSource,
  ResourceDelta,
  SurvivalEventDefinition,
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
import type { SurvivalSnapshot } from './survivalSnapshot';

const NO_EVENT_EXCLUSIONS: ReadonlySet<string> = new Set();
const NO_ITEM_EXCLUSIONS: ReadonlySet<ItemInstanceId> = new Set();

function choiceForDriftingSupplyVariant(
  choice: EventChoiceDefinition,
  seed: number,
  day: number,
): EventChoiceDefinition {
  if (choice.id === 'sleep') return choice;
  const kind = driftingSupplyKindFromSeed(
    deriveEventVariantSeed(seed, day, 'drifting-supplies'),
  );
  const outcomes = choice.outcomes.filter(({ resultId }) => (
    isDriftingSupplyResult(resultId, kind)
  ));
  if (outcomes.length === 0) {
    throw new Error(`Drifting supplies have no ${kind} outcomes for ${choice.id}.`);
  }
  return {
    ...choice,
    outcomes: outcomes as [WeightedEventOutcome, ...WeightedEventOutcome[]],
  };
}

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
  readonly radioSignalsEnabled?: boolean;
}

export type { DayActionOption } from './survivalTypes';
interface Rejection {
  code: string;
  message: string;
}

interface EventMutationApplication {
  readonly kind: JournalInventoryMutation['kind'];
  readonly instanceIds: ItemInstanceId[];
  readonly fallbackFoodGranted: boolean;
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
  'The radio has no active signal.': 'no-radio-signal',
  'No working radio remains.': 'no-radio',
  'Answering the radio requires one energy.': 'not-enough-energy',
  'No energy bar remains.': 'no-energy-bar',
  'Your energy is already full.': 'energy-full',
  'There is no closed chest to open.': 'no-closed-chest',
  'Opening the chest requires three energy.': 'not-enough-energy',
  'Carlitos is not aboard.': 'no-carlitos',
  'Carlitos cannot respond.': 'carlitos-dead',
  'Carlitos has already been petted today.': 'already-petted',
  'Carlitos is already happy.': 'carlitos-happy',
  'Carlitos is already satiated.': 'carlitos-not-hungry',
  'Carlitos needs no treatment.': 'carlitos-healthy',
  'No medical kit remains.': 'no-medical-kit',
});

interface ActiveFishingTransaction {
  readonly attempt: FishingSession;
  readonly capturedBait: boolean;
  readonly previousActedToday: boolean;
}

interface SurvivalSessionCheckpointSource {
  readonly kind: 'checkpoint';
  readonly checkpoint: SurvivalSessionCheckpoint;
}

function isCheckpointSource(
  source: readonly ItemInstance[] | SurvivalSessionCheckpointSource,
): source is SurvivalSessionCheckpointSource {
  return !Array.isArray(source);
}

interface SessionInitialization {
  readonly kind: 'checkpoint' | 'new';
  readonly checkpoint: SurvivalSessionCheckpoint | null;
  readonly options: SurvivalSessionOptions | null;
  readonly state: SurvivalState;
  readonly seed: number;
  readonly random: RandomSource | Mulberry32Random;
  readonly radioSignalsEnabled: boolean;
  readonly weather: WeatherId;
  readonly day: number;
  readonly pressure: number;
  readonly health: number;
  readonly hunger: number;
  readonly energy: number;
  readonly hull: number;
  readonly rescueLead: RescueLead;
  readonly rescueTraceFinds: 0 | 1 | 2;
  readonly chestState: ChestState;
  readonly chestAcquiredDay: number | null;
  readonly inventory: SurvivalInventoryState;
  readonly savedItems: readonly ItemInstance[];
  readonly savedPickupCount: number;
  readonly carlitos: CarlitosState | null;
  readonly pendingEventId: string | null;
  readonly pendingJournalDaytime: JournalDaytimeRecord | null;
}

function checkpointInitialization(
  source: SurvivalSessionCheckpointSource,
): SessionInitialization {
  const checkpoint = createSurvivalSessionCheckpoint(source.checkpoint);
  return {
    kind: 'checkpoint',
    checkpoint,
    options: null,
    state: checkpoint.state,
    seed: checkpoint.seed,
    random: restoreMulberry32(checkpoint.randomState),
    radioSignalsEnabled: checkpoint.radioSignalsEnabled,
    weather: checkpoint.weather,
    day: checkpoint.day,
    pressure: checkpoint.pressure,
    health: checkpoint.health,
    hunger: checkpoint.hunger,
    energy: checkpoint.energy,
    hull: checkpoint.hull,
    rescueLead: checkpoint.rescueLead,
    rescueTraceFinds: checkpoint.rescueTraceFinds,
    chestState: checkpoint.chest.state,
    chestAcquiredDay: checkpoint.chest.acquiredDay,
    inventory: SurvivalInventoryState.restore(checkpoint.inventory),
    savedItems: Object.freeze(checkpoint.savedItems.map((item) => Object.freeze({ ...item }))),
    savedPickupCount: checkpoint.savedPickupCount,
    carlitos: checkpoint.carlitos === null ? null : { ...checkpoint.carlitos },
    pendingEventId: checkpoint.pendingEventId,
    pendingJournalDaytime: null,
  };
}

function initialResources(options: SurvivalSessionOptions): {
  readonly day: number;
  readonly pressure: number;
  readonly health: number;
  readonly hunger: number;
  readonly energy: number;
  readonly hull: number;
  readonly rescueLead: RescueLead;
} {
  const initial = options.initial ?? {};
  const day = initial.day ?? 1;
  return {
    day,
    pressure: initial.pressure ?? pressureForDay(day),
    health: initial.health ?? SURVIVAL_BALANCE.start.health,
    hunger: initial.hunger ?? SURVIVAL_BALANCE.start.hunger,
    energy: initial.energy ?? SURVIVAL_BALANCE.start.energy,
    hull: initial.hull ?? SURVIVAL_BALANCE.start.hull,
    rescueLead: clampRescueLead(initial.rescueLead ?? 0),
  };
}

function initialRescueTraceFinds(options: SurvivalSessionOptions): 0 | 1 | 2 {
  return Math.min(
    2,
    Math.max(0, Math.trunc(options.initialRescueTraceFinds ?? 0)),
  ) as 0 | 1 | 2;
}

function initialChest(options: SurvivalSessionOptions, day: number): {
  readonly state: ChestState;
  readonly acquiredDay: number | null;
} {
  const chest = options.initialChest;
  const state = chest?.state ?? 'none';
  const acquiredDay = state === 'none' ? null : chest?.acquiredDay ?? day;
  return { state, acquiredDay };
}

function newSessionInitialization(
  savedItems: readonly ItemInstance[],
  options: SurvivalSessionOptions,
): SessionInitialization {
  const resources = initialResources(options);
  const chest = initialChest(options, resources.day);
  const hasCarlitos = savedItems.some(({ type }) => type === 'carlitos');
  const inventoryItems = Object.freeze(savedItems
    .filter(({ type }) => type !== 'carlitos')
    .map((item) => Object.freeze({ ...item })));
  return {
    kind: 'new',
    checkpoint: null,
    options,
    state: 'day',
    seed: options.seed,
    random: options.random ?? mulberry32(options.seed),
    radioSignalsEnabled: options.radioSignalsEnabled ?? true,
    weather: options.weather ?? 'calm',
    ...resources,
    rescueTraceFinds: initialRescueTraceFinds(options),
    chestState: chest.state,
    chestAcquiredDay: chest.acquiredDay,
    inventory: new SurvivalInventoryState(inventoryItems),
    savedItems: inventoryItems,
    savedPickupCount: savedItems.length,
    carlitos: hasCarlitos ? createCarlitosState(options.initialCarlitos) : null,
    pendingEventId: null,
    pendingJournalDaytime: resources.day === 1 ? createJournalSinkingShipRecord() : null,
  };
}

function sessionInitialization(
  source: readonly ItemInstance[] | SurvivalSessionCheckpointSource,
  options: SurvivalSessionOptions | undefined,
): SessionInitialization {
  if (isCheckpointSource(source)) return checkpointInitialization(source);
  if (options === undefined) throw new Error('Survival session options are required.');
  return newSessionInitialization(source, options);
}

export class SurvivalSession {
  private state: SurvivalState = 'day';
  private readonly savedPickupCount: number;
  private ending: EndingRecord | null = null;
  private history: readonly SurvivalReading[] = Object.freeze([]);
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
  private radioSignalAvailable = false;
  private radioSignalsSent = 0;
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
  private nextDawnEnergyOverride: DawnEnergy | null = null;
  private lastEventId: string | null = null;
  private readonly lastSeenDay = new Map<string, number>();
  private readonly appearanceCounts = new Map<string, number>();
  private lastOutcome: ActionOutcome | null = null;
  private pendingJournalDaytime: JournalDaytimeRecord | null;
  private pendingJournalNighttime: JournalNightRecord | null = null;
  private pendingJournalActions: JournalDayActionRecord[] = [];
  private readonly journalEntries: JournalEntry[] = [];
  private readonly seed: number;
  private readonly random: RandomSource | Mulberry32Random;
  private readonly radioSignalsEnabled: boolean;
  private fishingCounter = 0;
  private activeFishing: ActiveFishingTransaction | null = null;
  private cachedSnapshot: Readonly<SurvivalSnapshot> | null = null;

  constructor(savedItems: readonly ItemInstance[], options: SurvivalSessionOptions);
  constructor(source: SurvivalSessionCheckpointSource);
  constructor(
    savedItemsOrSource: readonly ItemInstance[] | SurvivalSessionCheckpointSource,
    options?: SurvivalSessionOptions,
  ) {
    const initialization = sessionInitialization(savedItemsOrSource, options);
    this.state = initialization.state;
    this.seed = initialization.seed;
    this.random = initialization.random;
    this.radioSignalsEnabled = initialization.radioSignalsEnabled;
    this.weather = initialization.weather;
    this.day = initialization.day;
    this.pressure = initialization.pressure;
    this.health = initialization.health;
    this.hunger = initialization.hunger;
    this.energy = initialization.energy;
    this.hull = initialization.hull;
    this.rescueLead = initialization.rescueLead;
    this.rescueTraceFinds = initialization.rescueTraceFinds;
    this.chestState = initialization.chestState;
    this.chestAcquiredDay = initialization.chestAcquiredDay;
    this.inventory = initialization.inventory;
    this.savedItems = initialization.savedItems;
    this.savedPickupCount = initialization.savedPickupCount;
    this.carlitos = initialization.carlitos;
    this.pendingEventId = initialization.pendingEventId;
    this.pendingJournalDaytime = initialization.pendingJournalDaytime;
    if (initialization.kind === 'checkpoint') {
      this.restoreCheckpointState(initialization.checkpoint!);
    } else {
      this.initializeNewSession(initialization.options!);
    }
    this.recordHistory();
  }

  static createEndingPreview(
    savedItems: readonly ItemInstance[],
    seed: number,
    endingId: SurvivalEndingId,
  ): SurvivalSession {
    const session = new SurvivalSession(savedItems, {
      seed,
      radioSignalsEnabled: false,
      initial: {
        ...(endingId === 'death' ? { health: 0 } : {}),
        ...(endingId === 'sinking' ? { hull: 0 } : {}),
      },
    });
    if (endingId === 'rescue') {
      session.ending = Object.freeze({
        id: endingId,
        day: session.day,
        savedPickupCount: session.savedPickupCount,
        signalAssisted: false,
      });
      session.state = 'rescued';
    }
    return session;
  }

  private restoreCheckpointState(checkpoint: SurvivalSessionCheckpoint): void {
    this.history = Object.freeze(checkpoint.history.map((reading) => Object.freeze({ ...reading })));
    this.food = checkpoint.food;
    this.bait = checkpoint.bait;
    this.recoveredFood = checkpoint.recoveredFood;
    this.recoveredBait = checkpoint.recoveredBait;
    this.repairMaterial = checkpoint.repairMaterial;
    this.radioSignalAvailable = checkpoint.radioSignalAvailable;
    this.radioSignalsSent = checkpoint.radioSignalsSent;
    this.actedToday = checkpoint.actedToday;
    this.restorePendingCheckpointEvent(checkpoint);
    this.restoreEventHistory(checkpoint);
    this.lastOutcome = checkpoint.lastOutcome === null
      ? null
      : this.cloneOutcome(checkpoint.lastOutcome);
    this.lastHealthCause = { ...checkpoint.lastHealthCause };
    this.lastHullEventId = checkpoint.lastHullEventId;
    this.restoreCheckpointJournal(checkpoint);
    this.fishingCounter = checkpoint.fishingCounter;
    this.activeFishing = null;
    this.ending = null;
    this.cachedSnapshot = null;
  }

  private restorePendingCheckpointEvent(checkpoint: SurvivalSessionCheckpoint): void {
    this.pendingEvent = checkpoint.pendingEventId === null
      ? null
      : survivalEventById(checkpoint.pendingEventId) ?? null;
    this.pendingEventTargetId = checkpoint.pendingEventTargetId;
    this.nextDawnEnergyOverride = checkpoint.nextDawnEnergyOverride;
    this.lastEventId = checkpoint.lastEventId;
  }

  private restoreEventHistory(checkpoint: SurvivalSessionCheckpoint): void {
    for (const [eventId, day] of Object.entries(checkpoint.lastSeenDays)) {
      this.lastSeenDay.set(eventId, day);
    }
    for (const [eventId, count] of Object.entries(checkpoint.appearanceCounts)) {
      this.appearanceCounts.set(eventId, count);
    }
  }

  private restoreCheckpointJournal(checkpoint: SurvivalSessionCheckpoint): void {
    this.pendingJournalDaytime = this.restorePendingJournalDaytime(
      checkpoint.pendingJournalDaytime,
    );
    this.pendingJournalNighttime = checkpoint.pendingJournalNighttime === null
      ? null
      : cloneJournalNight(checkpoint.pendingJournalNighttime);
    this.pendingJournalActions = [...cloneJournalActions(checkpoint.pendingJournalActions)];
    for (const entry of checkpoint.journalEntries) this.journalEntries.push(createJournalEntry(
      entry.day,
      entry.weather,
      entry.actions,
      entry.daytime,
      entry.nighttime,
    ));
  }

  private restorePendingJournalDaytime(
    daytime: SurvivalSessionCheckpoint['pendingJournalDaytime'],
  ): JournalDaytimeRecord | null {
    if (daytime === null) return null;
    if ('kind' in daytime) return createJournalSinkingShipRecord();
    const clonedNight = createJournalNightEventRecord(daytime);
    return clonedNight.kind === 'event'
      ? clonedNight.event
      : createJournalSinkingShipRecord();
  }

  private initializeNewSession(options: SurvivalSessionOptions): void {
    this.restoreInitialAppearanceCounts(options.initialAppearanceCounts);
    this.applyInitialConditions(options.initialConditions);
    this.openInitialEvent(options.initialEventId);
    this.recoveredFood = this.inventory.count('cannedFood', 'usable');
    this.recoveredBait = this.inventory.count('baitTin', 'usable');
    const initial = options.initial ?? {};
    this.bait = initial.bait ?? this.recoveredBait;
    this.food = initial.food ?? this.recoveredFood;
    this.clampMeters();
    this.resolveTerminal();
  }

  private restoreInitialAppearanceCounts(counts: Readonly<Record<string, number>> | undefined): void {
    for (const [eventId, count] of Object.entries(counts ?? {})) {
      if (!Number.isInteger(count) || count < 0) {
        throw new Error(`Invalid initial appearance count for ${eventId}.`);
      }
      this.appearanceCounts.set(eventId, count);
    }
  }

  private openInitialEvent(eventId: string | undefined): void {
    if (eventId === undefined) return;
    const initialEvent = survivalEventById(eventId);
    if (initialEvent === undefined) throw new Error(`Unknown survival event: ${eventId}`);
    this.openEvent(initialEvent);
  }

  exportCheckpoint(): SurvivalSessionCheckpoint {
    if (this.activeFishing !== null) throw new Error('Cannot checkpoint active fishing.');
    if (this.isTerminal()) throw new Error('Cannot checkpoint terminal state.');
    if (!(this.random instanceof Mulberry32Random)) {
      throw new Error('Cannot checkpoint a non-restorable random source.');
    }
    return createSurvivalSessionCheckpoint({
      history: this.history,
      state: this.state as SurvivalSessionCheckpoint['state'],
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
      radioSignalAvailable: this.radioSignalAvailable,
      radioSignalsSent: this.radioSignalsSent,
      radioSignalsEnabled: this.radioSignalsEnabled,
      chest: { state: this.chestState, acquiredDay: this.chestAcquiredDay },
      weather: this.weather,
      actedToday: this.actedToday,
      inventory: this.inventory.snapshot(),
      savedItems: this.savedItems,
      savedPickupCount: this.savedPickupCount,
      carlitos: this.carlitos,
      pendingEventId: this.pendingEventId,
      pendingEventTargetId: this.pendingEventTargetId,
      nextDawnEnergyOverride: this.nextDawnEnergyOverride,
      lastEventId: this.lastEventId,
      lastSeenDays: Object.fromEntries([...this.lastSeenDay].sort()),
      appearanceCounts: Object.fromEntries([...this.appearanceCounts].sort()),
      lastOutcome: this.lastOutcome,
      lastHealthCause: this.lastHealthCause,
      lastHullEventId: this.lastHullEventId,
      pendingJournalDaytime: this.pendingJournalDaytime,
      pendingJournalNighttime: this.pendingJournalNighttime,
      pendingJournalActions: this.pendingJournalActions,
      journalEntries: this.journalEntries,
      fishingCounter: this.fishingCounter,
      seed: this.seed,
      randomState: this.random.exportState(),
    });
  }

  static restore(checkpoint: SurvivalSessionCheckpoint): SurvivalSession {
    return new SurvivalSession({ kind: 'checkpoint', checkpoint });
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
      history: this.history,
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
      radioSignalAvailable: this.radioSignalAvailable,
      radioSignalsSent: this.radioSignalsSent,
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

  setItemConditionForLab(
    instanceId: ItemInstanceId,
    condition: Extract<ItemCondition, 'usable' | 'broken'>,
  ): boolean {
    if (this.activeFishing !== null || this.isTerminal()) return false;
    const item = this.snapshot().inventory[instanceId];
    if (item === undefined || !ITEM_DEFINITIONS[item.type].breakable) return false;
    const changed = condition === 'broken'
      ? this.inventory.break(instanceId)
      : this.inventory.repair(instanceId);
    if (changed) this.changed();
    return changed;
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
    if (action === 'endDay') return this.endDay();
    const outcome = this.performDayAction(action, option);
    this.actedToday = true;
    return outcome;
  }

  private performDayAction(
    action: Exclude<DayActionId, 'fish' | 'endDay'>,
    option?: DayActionOption,
  ): ActionOutcome {
    switch (action) {
      case 'dive': return this.dive();
      case 'eat': return this.eat();
      case 'repair': return this.repair(option);
      case 'repairItem': return this.repairItem(option);
      case 'treat': return this.treat();
      case 'answerRadio': return this.answerRadio();
      case 'useEnergyBar': return this.useEnergyBar();
      case 'openChest': return this.openChest();
      case 'petCarlitos': return this.petCarlitos();
      case 'feedCarlitos': return this.feedCarlitos();
      case 'treatCarlitos': return this.treatCarlitos();
    }
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

    const settlement = fishingSettlement(result, transaction.capturedBait);
    if (settlement.itemReward !== null) {
      const gained = this.inventory.gain(
        settlement.itemReward.itemId,
        settlement.itemReward.condition,
      );
      if (gained === null) {
        throw new Error(`Fishing reward would duplicate active ${settlement.itemReward.itemId}`);
      }
    }
    const outcome = this.commit(settlement.code, settlement.message, settlement.deltas, 'none');
    this.pendingJournalActions.push(createJournalFishingRecord(
      attemptId,
      result,
      settlement.food,
      settlement.baitConsumed,
    ));
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

    this.radioSignalAvailable = false;

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
      return this.beginQuietNight();
    }

    const event = this.drawEvent('night');
    if (event.id === 'night-calm-fallback') return this.beginQuietNight();
    this.openEvent(event);
    return this.commit('event-opened', event.prompt, {}, 'nightfall');
  }

  resolveEvent(response: EventResponse): ActionOutcome {
    const rejection = this.eventResolutionRejection();
    if (rejection !== null) return rejection;
    if (response.kind === 'endure') return this.resolveEndureResponse();
    if (response.kind === 'choice') return this.resolveChoiceResponse(response);
    return this.resolveItemResponse(response);
  }

  private eventResolutionRejection(): ActionOutcome | null {
    if (this.activeFishing !== null) return this.fishingInProgress();
    if (this.isTerminal()) {
      return this.reject('terminal', 'The survival journey has already ended.');
    }
    if ((this.state === 'dayEvent' || this.state === 'nightEvent') && this.pendingEvent !== null) {
      return null;
    }
    return this.reject('no-event', 'There is no unresolved event.');
  }

  private resolveEndureResponse(): ActionOutcome {
    const event = this.pendingEvent!;
    if (!isSignalSightingEventId(event.id) && this.hasUsableEventChoice(event)) {
      return this.reject('endure-unavailable', 'Use one of the highlighted items to face this event.');
    }
    return this.resolveEventChoice('sleep', null, null, undefined);
  }

  private resolveChoiceResponse(
    response: Extract<EventResponse, { readonly kind: 'choice' }>,
  ): ActionOutcome {
    const choice = this.pendingEvent!.choices.find(({ id }) => id === response.choiceId);
    if (choice?.itemId !== undefined) {
      return this.reject('choice-unavailable', 'That response is not available for this event.');
    }
    return this.resolveEventChoice(response.choiceId, null, null, response.resultId);
  }

  private resolveItemResponse(
    response: Extract<EventResponse, { readonly kind: 'item' }>,
  ): ActionOutcome {
    const item = this.inventory.snapshot()[response.instanceId];
    const choice = this.pendingEvent!.choices.find(({ id }) => id === response.choiceId);
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
    const rejection = this.eventChoiceRejection(choice);
    if (rejection !== null) return this.reject(rejection.code, rejection.message);
    const mutationExclusions = new Set<ItemInstanceId>();
    const before = this.resourceValues();
    const resolved = this.resolveChoiceOutcome(event, choice, resultId);
    const applied = this.applyResolvedEventEffects(
      event,
      resolved,
      mutationExclusions,
      selectedInstanceId,
      attemptedItemId,
    );
    this.completeResolvedEventState(event, resolved);
    const outcome = this.createResolvedEventOutcome(
      event.id,
      choiceId,
      resolved,
      applied.fallbackFoodGranted,
      this.appliedResourceDelta(before, this.resourceValues()),
    );
    this.finishResolvedEvent(
      event,
      choice,
      attemptedItemId,
      resolved,
      outcome,
      applied.inventoryMutations,
    );
    return this.cloneOutcome(outcome);
  }

  private eventChoiceRejection(choice: EventChoiceDefinition): Rejection | null {
    const companionRejection = this.unavailableCompanionEventAction(choice.companionAction);
    if (companionRejection !== null) return companionRejection;
    if (!this.meetsChoiceRequirements(choice.requirements)) {
      return { code: 'requirements-unmet', message: 'You do not have the resources for that response.' };
    }
    if (choice.requiredChestState !== undefined && choice.requiredChestState !== this.chestState) {
      return {
        code: 'chest-state-unavailable',
        message: `That response requires a ${choice.requiredChestState} chest.`,
      };
    }
    if (choice.companionAction === 'delegateCarlitos' && !spendCarlitosEnergy(this.carlitos!)) {
      return {
        code: 'companion-action-unavailable',
        message: 'Carlitos does not have enough energy.',
      };
    }
    return null;
  }

  private resolveChoiceOutcome(
    event: SurvivalEventDefinition,
    choice: EventChoiceDefinition,
    resultId: string | undefined,
  ): WeightedEventOutcome {
    const resolutionChoice = event.id === 'drifting-supplies'
      ? choiceForDriftingSupplyVariant(choice, this.seed, this.day)
      : choice;
    return resolveWeightedOutcome(
      resolutionChoice,
      this.random,
      this.appearanceCounts.get(event.id) ?? 0,
      resultId,
    );
  }

  private applyResolvedEventEffects(
    event: SurvivalEventDefinition,
    resolved: WeightedEventOutcome,
    exclusions: ReadonlySet<ItemInstanceId>,
    selectedInstanceId: ItemInstanceId | null,
    attemptedItemId: ItemId | null,
  ): {
    readonly inventoryMutations: JournalInventoryMutation[];
    readonly fallbackFoodGranted: boolean;
  } {
    const inventoryMutations: JournalInventoryMutation[] = [];
    for (const effect of resolved.effects.resources ?? []) {
      inventoryMutations.push(...this.applyEventResource(
        effect,
        event.id,
        exclusions,
        selectedInstanceId,
      ));
    }
    const fallbackFoodGranted = this.applyResolvedItemMutations(
      resolved.effects.items ?? [],
      exclusions,
      selectedInstanceId,
      attemptedItemId,
      inventoryMutations,
    );
    this.applyChestEffect(resolved.effects.chest);
    return { inventoryMutations, fallbackFoodGranted };
  }

  private applyResolvedItemMutations(
    mutations: readonly EventInventoryMutation[],
    exclusions: ReadonlySet<ItemInstanceId>,
    selectedInstanceId: ItemInstanceId | null,
    attemptedItemId: ItemId | null,
    journalMutations: JournalInventoryMutation[],
  ): boolean {
    let fallbackFoodGranted = false;
    for (const mutation of mutations) {
      const applied = this.applyEventMutation(
        mutation,
        exclusions,
        selectedInstanceId,
        attemptedItemId,
      );
      if (applied.fallbackFoodGranted) fallbackFoodGranted = true;
      if (applied.mutation !== null) journalMutations.push(applied.mutation);
    }
    return fallbackFoodGranted;
  }

  private completeResolvedEventState(
    event: SurvivalEventDefinition,
    resolved: WeightedEventOutcome,
  ): void {
    if (resolved.effects.nextDawnEnergy !== undefined) {
      this.nextDawnEnergyOverride = resolved.effects.nextDawnEnergy;
    }
    this.resolveTerminal();
    this.lastEventId = event.id;
    this.lastSeenDay.set(event.id, this.day);
    this.appearanceCounts.set(event.id, (this.appearanceCounts.get(event.id) ?? 0) + 1);
    this.clearPendingEvent();
  }

  private createResolvedEventOutcome(
    eventId: string,
    choiceId: EventResponseId,
    resolved: WeightedEventOutcome,
    fallbackFoodGranted: boolean,
    deltas: ResourceDelta,
  ): ActionOutcome {
    const rewardSummary = this.eventRewardSummary(
      eventId,
      choiceId,
      resolved,
      fallbackFoodGranted,
    );
    const resultId = fallbackFoodGranted ? fallbackResultId(eventId) : resolved.resultId;
    return {
      accepted: true,
      code: 'event-resolved',
      message: fallbackFoodGranted
        ? 'The item slot is occupied, so you receive one food instead.'
        : resolved.message,
      deltas,
      cue: this.presentationCue('none'),
      ...(resolved.effects.nextDawnEnergy === undefined
        ? {}
        : { nextDawnEnergy: resolved.effects.nextDawnEnergy }),
      ...(resolved.presentationKey === undefined
        ? {}
        : { eventPresentationKey: resolved.presentationKey }),
      ...(rewardSummary === undefined ? {} : { rewardSummary }),
      ...(resultId === undefined
        ? {}
        : { eventResult: Object.freeze({ eventId, choiceId, resultId }) }),
    };
  }

  private finishResolvedEvent(
    event: SurvivalEventDefinition,
    choice: EventChoiceDefinition,
    attemptedItemId: ItemId | null,
    resolved: WeightedEventOutcome,
    outcome: ActionOutcome,
    inventoryMutations: readonly JournalInventoryMutation[],
  ): void {
    this.lastOutcome = outcome;
    if (resolved.effects.followUpNight !== true) {
      this.recordJournalEvent(
        event,
        choice.id,
        choice.label,
        attemptedItemId,
        outcome,
        inventoryMutations,
      );
    }
    this.changed();
    this.transitionAfterEvent(event.phase, resolved.effects.followUpNight === true);
  }

  private transitionAfterEvent(
    phase: SurvivalEventDefinition['phase'],
    followUpNight: boolean,
  ): void {
    if (this.isTerminal()) return;
    if (phase === 'day') {
      this.state = 'day';
      return;
    }
    if (followUpNight) this.openEvent(this.drawEvent('night', new Set(['guarded-sleep'])));
    else this.state = 'nightEvent';
  }

  beginDawn(): ActionOutcome {
    const rejection = this.dawnRejection();
    if (rejection !== null) return rejection;
    const hullWear = this.resetForDawn();
    const deltas = this.dawnDeltas(hullWear);
    const dawn = this.commit(
      'dawn',
      hullWear > 0
        ? 'The sea wears at the hull overnight. Another dawn breaks.'
        : 'Another dawn breaks over the lifeboat.',
      deltas,
      'dawn',
    );
    if (this.isTerminal()) return dawn;
    const rescue = this.rescueAtDawn();
    if (rescue !== null) return rescue;
    if (this.receiveRadioSignalAtDawn()) return dawn;
    this.openDayEventAfterDawn();
    return dawn;
  }

  private dawnRejection(): ActionOutcome | null {
    if (this.activeFishing !== null) return this.fishingInProgress();
    if (this.isTerminal()) {
      return this.reject('terminal', 'The survival journey has already ended.');
    }
    if (this.pendingEvent !== null) {
      return this.reject('event-pending', 'Resolve the pending event before dawn.');
    }
    if (this.state !== 'nightEvent') {
      return this.reject('not-nighttime', 'Dawn cannot begin before the night is complete.');
    }
    return null;
  }

  private resetForDawn(): number {
    const hullWear = nightlyHullWearDamage(this.day);
    this.day += 1;
    this.radioSignalAvailable = false;
    this.pendingJournalDaytime = null;
    this.pendingJournalNighttime = null;
    this.pendingJournalActions = [];
    this.actedToday = false;
    this.clearPendingEvent();
    this.state = 'day';
    this.advanceCarlitosDawn();
    this.weather = 'calm';
    return hullWear;
  }

  private dawnDeltas(hullWear: number): ResourceDelta {
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
    if (hullWear > 0) {
      this.lastHullEventId = null;
      deltas.hull = -hullWear;
    }
    const pressureIncrease = pressureIncreaseForDay(this.day);
    if (pressureIncrease > 0) deltas.pressure = pressureIncrease;
    if (hungerAfterDawn >= SURVIVAL_BALANCE.thresholds.maximum) {
      this.lastHealthCause = { kind: 'starvation' };
      deltas.health = -SURVIVAL_BALANCE.dawn.starvationDamage;
    }
    return deltas;
  }

  private rescueAtDawn(): ActionOutcome | null {
    const rescueChance = rescueChanceForDay(this.day, this.rescueLead);
    if (rescueChance <= 0 || this.random.next() >= rescueChance) return null;
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

  expireRadioSignal(): boolean {
    if (!this.radioSignalAvailable) return false;
    this.radioSignalAvailable = false;
    this.changed();
    return true;
  }

  private dayActionRuleState(): DayActionRuleState {
    return Object.freeze({
      state: this.state,
      activeFishing: this.activeFishing !== null,
      actedToday: this.actedToday,
      weather: this.weather,
      radioSignalAvailable: this.radioSignalAvailable,
      radioSignalsSent: this.radioSignalsSent,
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
    const chances = this.diveChances(hasFlashlight);
    const recovered = this.random.next() < chances.success;
    const injured = this.random.next() < chances.injury;
    const deltas: ResourceDelta = { energy: -SURVIVAL_BALANCE.actions.diveEnergy };
    if (injured) {
      this.lastHealthCause = { kind: 'diving' };
      deltas.health = -SURVIVAL_BALANCE.diving.injuryDamage;
    }

    if (recovered) this.applyDiveReward(deltas);

    return this.commit(
      recovered ? 'dive-recovered' : 'dive-empty',
      recovered ? 'You surfaced with useful salvage.' : 'You found nothing beneath the boat.',
      deltas,
      'dive',
    );
  }

  private diveChances(hasFlashlight: boolean): { readonly success: number; readonly injury: number } {
    const weatherSuccess = this.weather === 'overcast'
      ? SURVIVAL_BALANCE.diving.overcastSuccessDelta
      : 0;
    const weatherInjury = this.weather === 'overcast'
      ? SURVIVAL_BALANCE.diving.overcastInjuryDelta
      : 0;
    const success = hasFlashlight
      ? SURVIVAL_BALANCE.diving.flashlightSuccess
      : SURVIVAL_BALANCE.diving.success;
    const injury = hasFlashlight
      ? SURVIVAL_BALANCE.diving.flashlightInjury
      : SURVIVAL_BALANCE.diving.injury;
    return { success: success + weatherSuccess, injury: injury + weatherInjury };
  }

  private applyDiveReward(deltas: ResourceDelta): void {
    const rewardRoll = this.random.next();
    if (rewardRoll < 0.25) deltas.food = 1;
    else if (rewardRoll < 0.5) deltas.bait = 1;
    else if (rewardRoll < 0.75) deltas.repairMaterial = 1;
    else if (this.rescueTraceFinds < 2) {
      this.rescueTraceFinds = (this.rescueTraceFinds + 1) as 1 | 2;
      deltas.rescueLead = 1;
    }
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
    this.pendingJournalActions.push(createJournalCarlitosCareRecord('pet'));
    return outcome;
  }

  private feedCarlitos(): ActionOutcome {
    if (this.carlitos === null || !feedCarlitos(this.carlitos)) {
      throw new Error('Carlitos feed action was not available.');
    }
    const outcome = this.commit('carlitos-fed', 'You feed Carlitos.', { food: -1 }, 'none');
    this.pendingJournalActions.push(createJournalCarlitosCareRecord('feed'));
    return outcome;
  }

  private treatCarlitos(): ActionOutcome {
    if (this.carlitos === null || !treatCarlitos(this.carlitos)) {
      throw new Error('Carlitos treatment was not available.');
    }
    this.inventory.consume('medicalKit', 1);
    const outcome = this.commit('carlitos-treated', 'You treat Carlitos.', {}, 'none');
    this.pendingJournalActions.push(createJournalCarlitosCareRecord('treat'));
    return outcome;
  }

  private answerRadio(): ActionOutcome {
    const deltas = dayActionResourceDelta(this.dayActionRuleState(), 'answerRadio');
    this.radioSignalAvailable = false;
    this.radioSignalsSent += 1;
    return this.commit(
      'radio-answered',
      'You answer and transmit your position.',
      deltas,
      'sighting',
    );
  }

  private receiveRadioSignalAtDawn(): boolean {
    if (
      !this.radioSignalsEnabled
      || this.day < SURVIVAL_BALANCE.radio.firstDay
      || !this.inventory.hasUsable('radio')
      || this.random.next() >= SURVIVAL_BALANCE.radio.signalChance
    ) return false;
    this.radioSignalAvailable = true;
    this.changed();
    return true;
  }

  private useEnergyBar(): ActionOutcome {
    const deltas = dayActionResourceDelta(this.dayActionRuleState(), 'useEnergyBar');
    this.inventory.consume('energyBar', 1);
    return this.commit('energy-bar-used', 'The ration restores your strength.', deltas, 'none');
  }

  private openChest(): ActionOutcome {
    const activeItemIds = this.presentItemIds();
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
    return drawWeightedEvent(this.random, SURVIVAL_EVENTS, {
      phase,
      day: this.day,
      weather: this.weather,
      lastEventId: this.lastEventId,
      lastSeenDay: this.lastSeenDay,
      targetableItemIds: this.usableItemIds(),
      appearanceCounts: this.appearanceCounts,
      inventoryItemIds: this.presentItemIds(),
      rescueLead: this.rescueLead,
      pressure: this.pressure,
      chestState: this.chestState,
      hasLivingCompanion: this.carlitos?.alive === true,
      excludedIds,
    });
  }

  private openDayEventAfterDawn(): void {
    const balance = SURVIVAL_BALANCE.dayEvents;
    if (this.day < balance.firstDay || this.random.next() >= balance.chance) return;
    const event = this.drawEvent('day');
    if (event.id === 'day-calm-fallback') return;
    this.openEvent(event);
  }

  private eventRewardSummary(
    eventId: string,
    choiceId: string,
    resolved: WeightedEventOutcome,
    fallbackFoodGranted: boolean,
  ): RewardSummary | undefined {
    const source = this.eventRewardSource(eventId, choiceId);
    if (source === null) return undefined;
    if (fallbackFoodGranted) return Object.freeze({ kind: 'resource', id: 'food', quantity: 1 });
    const resourceReward = this.eventResourceReward(resolved);
    if (resourceReward !== undefined) return resourceReward;
    if (source === 'wreckage') return this.wreckageItemReward(resolved);
    return Object.freeze({ kind: 'item', id: 'energyBar', quantity: 1 });
  }

  private eventRewardSource(
    eventId: string,
    choiceId: string,
  ): 'driftingCargo' | 'wreckage' | null {
    if (eventId === 'drifting-supplies'
      && (choiceId === 'retrieve' || choiceId === 'delegate-carlitos')) {
      return 'driftingCargo';
    }
    if (eventId === 'wreckage'
      && (choiceId === 'search' || choiceId === 'delegate-carlitos' || choiceId === 'dive')) {
      return 'wreckage';
    }
    return null;
  }

  private eventResourceReward(resolved: WeightedEventOutcome): RewardSummary | undefined {
    const added = resolved.effects.resources?.find(
      ({ operation, resource }) => operation === 'add'
        && (resource === 'food' || resource === 'bait' || resource === 'repairMaterial'),
    );
    if (added === undefined || typeof added.value !== 'number') return undefined;
    const id = added.resource;
    if (id !== 'food' && id !== 'bait' && id !== 'repairMaterial') return undefined;
    return Object.freeze({ kind: 'resource', id, quantity: added.value });
  }

  private wreckageItemReward(resolved: WeightedEventOutcome): RewardSummary | undefined {
    const gained = resolved.effects.items?.find(({ kind }) => kind === 'gain');
    if (gained?.kind !== 'gain') return undefined;
    return Object.freeze({ kind: 'item', id: gained.itemId, quantity: 1 });
  }

  private recordJournalEvent(
    event: SurvivalEventDefinition,
    attemptedChoiceId: string | null,
    choiceLabel: string,
    attemptedItemId: ItemId | null,
    outcome: ActionOutcome,
    inventoryMutations: readonly JournalInventoryMutation[],
  ): void {
    const record = createJournalEventRecord(
      event,
      attemptedChoiceId,
      choiceLabel,
      attemptedItemId,
      outcome,
      inventoryMutations,
    );
    if (event.phase === 'day') {
      this.pendingJournalDaytime = record;
      return;
    }
    this.pendingJournalNighttime = createJournalNightEventRecord(record);
    this.finalizeJournalDay();
  }

  private finalizeJournalDay(): void {
    if (this.pendingJournalNighttime === null) return;
    if (this.journalEntries.some((entry) => entry.day === this.day)) return;
    this.journalEntries.push(createJournalEntry(
      this.day,
      this.weather,
      this.pendingJournalActions,
      this.pendingJournalDaytime,
      this.pendingJournalNighttime,
    ));
  }

  private beginQuietNight(): ActionOutcome {
    this.state = 'nightEvent';
    this.pendingJournalNighttime = createQuietJournalNightRecord();
    this.finalizeJournalDay();
    return this.commit(
      'quiet-night',
      'The night passes without incident.',
      {},
      'nightfall',
    );
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

  private usableItemIds(): ReadonlySet<ItemId> {
    return new Set(Object.values(this.inventory.snapshot())
      .filter((item) => item?.condition === 'usable')
      .map((item) => item!.type));
  }

  private presentItemIds(): ReadonlySet<ItemId> {
    return new Set(Object.values(this.inventory.snapshot())
      .filter((item) => item?.condition === 'usable' || item?.condition === 'broken')
      .map((item) => item!.type));
  }

  private drawEventTarget(event: SurvivalEventDefinition): ItemInstanceId | null {
    const targetItemIds = new Set(event.targetItemIds ?? []);
    const candidates = Object.values(this.inventory.snapshot())
      .filter((item) => item?.condition === 'usable'
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
    this.recordHistory();
    this.cachedSnapshot = null;
  }

  private recordHistory(): void {
    const previous = this.history.at(-1);
    if (previous?.day === this.day && previous.health === this.health
      && previous.hunger === this.hunger && previous.hull === this.hull) return;
    const reading = Object.freeze({
      day: this.day, health: this.health, hunger: this.hunger, hull: this.hull,
    });
    // Keep the last reading of each day, including the terminal action.
    const earlier = previous?.day === this.day ? this.history.slice(0, -1) : this.history;
    this.history = Object.freeze([...earlier, reading]);
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
    const value = effect.value;
    if (typeof value !== 'number') {
      throw new Error(`Event resource ${effect.resource} was not resolved to a concrete value.`);
    }
    if (effect.operation === 'subtract' && effect.resource === 'health') {
      this.lastHealthCause = { kind: 'event', eventId };
    }
    if (effect.operation === 'subtract' && effect.resource === 'hull') {
      this.lastHullEventId = eventId;
    }
    const current = this.resourceValues()[effect.resource];
    const delta = eventResourceDelta({ ...effect, value }, current);
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
    const preferredInstanceId = this.preferredMutationInstance(
      mutation,
      selectedInstanceId,
      attemptedItemId,
    );
    const applied = this.applyEventMutationToInventory(
      mutation,
      excludedInstanceIds,
      preferredInstanceId,
    );
    if (applied.instanceIds.length === 0) {
      return { mutation: null, fallbackFoodGranted: applied.fallbackFoodGranted };
    }
    this.synchronizeRemovedResources(applied.kind, applied.instanceIds);
    return {
      mutation: { kind: applied.kind, instanceIds: applied.instanceIds },
      fallbackFoodGranted: applied.fallbackFoodGranted,
    };
  }

  private preferredMutationInstance(
    mutation: EventInventoryMutation,
    selectedInstanceId: ItemInstanceId | null,
    attemptedItemId: ItemId | null,
  ): ItemInstanceId | null {
    if (!('itemId' in mutation) || mutation.itemId !== attemptedItemId) return null;
    return selectedInstanceId;
  }

  private applyEventMutationToInventory(
    mutation: EventInventoryMutation,
    excludedInstanceIds: ReadonlySet<ItemInstanceId>,
    preferredInstanceId: ItemInstanceId | null,
  ): EventMutationApplication {
    switch (mutation.kind) {
      case 'gain': return this.applyItemGain(mutation.itemId, mutation.fallbackFood);
      case 'gainChest': return {
        kind: 'gain',
        instanceIds: [],
        fallbackFoodGranted: this.applyChestGain(mutation.fallbackFood),
      };
      case 'consume':
        return this.directMutation('consume', this.inventory.consumePreferred(
          mutation.itemId,
          mutation.quantity,
          preferredInstanceId,
          excludedInstanceIds,
        ));
      case 'break': return this.directMutation('break', this.mutateMatchingInstances(
        mutation.itemId,
        mutation.quantity,
        excludedInstanceIds,
        preferredInstanceId,
        (instanceId) => this.inventory.break(instanceId),
      ));
      case 'lose':
        return this.directMutation('lose', this.mutateMatchingInstances(
          mutation.itemId,
          mutation.quantity,
          excludedInstanceIds,
          preferredInstanceId,
          (instanceId) => this.inventory.lose(instanceId),
        ));
      case 'breakRandom':
        return this.directMutation(
          'break',
          this.inventory.breakRandom(mutation.quantity, this.random, excludedInstanceIds),
        );
      case 'loseRandom':
        return this.directMutation(
          'lose',
          this.inventory.loseRandom(mutation.quantity, this.random, excludedInstanceIds),
        );
      case 'loseEventTarget':
        return this.directMutation('lose', this.loseEventTarget(excludedInstanceIds));
    }
  }

  private applyItemGain(itemId: ItemId, fallbackFood: number): EventMutationApplication {
    const gained = this.inventory.gain(itemId);
    if (gained !== null) return this.directMutation('gain', [gained]);
    this.applyDeltas({ food: fallbackFood });
    return { kind: 'gain', instanceIds: [], fallbackFoodGranted: true };
  }

  private directMutation(
    kind: JournalInventoryMutation['kind'],
    instanceIds: ItemInstanceId[],
  ): EventMutationApplication {
    return { kind, instanceIds, fallbackFoodGranted: false };
  }

  private loseEventTarget(
    excludedInstanceIds: ReadonlySet<ItemInstanceId>,
  ): ItemInstanceId[] {
    const target = this.pendingEventTargetId;
    if (target === null || excludedInstanceIds.has(target)) return [];
    return this.inventory.lose(target) ? [target] : [];
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
        createJournalCarlitosDawnRecord(before, after),
      ]),
    };
  }

  private carlitosDawnState(): JournalCarlitosDawnRecord['before'] {
    if (this.carlitos === null) throw new Error('Carlitos is not aboard.');
    return createJournalCarlitosDawnState(this.carlitos);
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
    excludedInstanceIds: ReadonlySet<ItemInstanceId> = NO_ITEM_EXCLUSIONS,
    selectedInstanceId: ItemInstanceId | null = null,
  ): JournalInventoryMutation[] {
    const adjustedDeltas = this.adjustProtectedDeltas(deltas, excludedInstanceIds);
    const spentRecoveredFood = this.spentRecoveredUses(this.recoveredFood, this.food, adjustedDeltas.food);
    const spentRecoveredBait = this.spentRecoveredUses(this.recoveredBait, this.bait, adjustedDeltas.bait);
    this.applyResourceValues(adjustedDeltas);
    return this.consumeRecoveredResources(
      spentRecoveredFood,
      spentRecoveredBait,
      selectedInstanceId,
      excludedInstanceIds,
    );
  }

  private adjustProtectedDeltas(
    deltas: ResourceDelta,
    excludedInstanceIds: ReadonlySet<ItemInstanceId>,
  ): ResourceDelta {
    const adjustedDeltas = { ...deltas };
    if (adjustedDeltas.food !== undefined && adjustedDeltas.food < 0) {
      const protectedFood = this.protectedUsableCount('cannedFood', excludedInstanceIds);
      adjustedDeltas.food = Math.max(adjustedDeltas.food, protectedFood - this.food);
    }
    if (adjustedDeltas.bait !== undefined && adjustedDeltas.bait < 0) {
      const protectedBait = this.protectedUsableCount('baitTin', excludedInstanceIds);
      adjustedDeltas.bait = Math.max(adjustedDeltas.bait, protectedBait - this.bait);
    }
    return adjustedDeltas;
  }

  private applyResourceValues(deltas: ResourceDelta): void {
    this.health += deltas.health ?? 0;
    this.hunger += deltas.hunger ?? 0;
    this.energy += deltas.energy ?? 0;
    this.hull += deltas.hull ?? 0;
    this.food += deltas.food ?? 0;
    this.bait += deltas.bait ?? 0;
    this.repairMaterial += deltas.repairMaterial ?? 0;
    this.rescueLead = clampRescueLead(
      this.rescueLead + (deltas.rescueLead ?? 0),
    );
    this.pressure += deltas.pressure ?? 0;
    this.clampMeters();
  }

  private consumeRecoveredResources(
    spentRecoveredFood: number,
    spentRecoveredBait: number,
    selectedInstanceId: ItemInstanceId | null,
    excludedInstanceIds: ReadonlySet<ItemInstanceId>,
  ): JournalInventoryMutation[] {
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

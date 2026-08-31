import {
  ITEM_DEFINITIONS,
  ITEM_IDS,
  type ItemId,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import type { DeathCause } from '../game/ending';
import type { SurvivalReading } from '../game/runStatistics';
import { SURVIVAL_EVENTS } from './eventCatalog';
import { FISHING_CATCHES } from './fishingCatalog';
import type { CarlitosSnapshot } from './CarlitosState';
import {
  createSurvivalSessionCheckpoint,
  type SurvivalRunCheckpoint,
  type SurvivalSessionCheckpoint,
} from './SurvivalCheckpoint';
import type {
  JournalDayActionRecord,
  JournalDaytimeRecord,
  JournalEntry,
  JournalInventoryMutation,
  JournalNightRecord,
} from './journalRecords';
import type { RescueLead } from './survivalBalance';
import type {
  ActionOutcome,
  ChestSnapshot,
  DawnEnergy,
  EventPresentationKey,
  ItemCondition,
  SurvivalInventorySnapshot,
  SurvivalItemState,
  WeatherId,
} from './survivalTypes';
import type { FishingCatchId } from './fishingCatalog';

export const SURVIVAL_SAVE_VERSION = 2 as const;

export interface SurvivalSaveDocument {
  readonly version: typeof SURVIVAL_SAVE_VERSION;
  readonly checkpoint: SurvivalRunCheckpoint;
}

const MAX_UINT32 = 0xffff_ffff;
const MAX_COUNTER = Number.MAX_SAFE_INTEGER;
const ITEM_ID_SET = new Set<string>(ITEM_IDS);
const EVENT_ID_SET = new Set(SURVIVAL_EVENTS.map(({ id }) => id));
const FISHING_CATCH_ID_SET = new Set(FISHING_CATCHES.map(({ id }) => id));
const WEATHER_ID_SET = new Set<WeatherId>(['calm', 'overcast', 'squall']);
const ITEM_CONDITION_SET = new Set<ItemCondition>(['usable', 'broken', 'consumed', 'lost']);
const PRESENTATION_CUE_SET = new Set([
  'none', 'fish', 'dive', 'repair', 'treat', 'storm', 'impact', 'darkness', 'sighting',
  'nightfall', 'dawn', 'rescue', 'death', 'sinking',
]);
const ACTION_OUTCOME_DELTA_SET = new Set([
  'pressure', 'health', 'hunger', 'energy', 'hull', 'food', 'bait', 'repairMaterial', 'rescueLead',
]);
const EVENT_PRESENTATION_KEY_SET = new Set(
  SURVIVAL_EVENTS.flatMap((event) => event.choices.flatMap((choice) => (
    choice.outcomes.flatMap((outcome) => (
      outcome.presentationKey === undefined ? [] : [outcome.presentationKey]
    ))
  ))),
);

function isItemCondition(value: string): value is ItemCondition {
  return ITEM_CONDITION_SET.has(value as ItemCondition);
}

function isEventPresentationKey(value: string): value is EventPresentationKey {
  return EVENT_PRESENTATION_KEY_SET.has(value as EventPresentationKey);
}

function isFishingCatchId(value: string): value is FishingCatchId {
  return FISHING_CATCH_ID_SET.has(value as FishingCatchId);
}

export function createSurvivalSaveDocument(
  checkpoint: SurvivalRunCheckpoint,
): SurvivalSaveDocument {
  return Object.freeze({
    version: SURVIVAL_SAVE_VERSION,
    checkpoint: cloneSurvivalRunCheckpoint(checkpoint),
  });
}

export function parseSurvivalSaveDocument(value: unknown): SurvivalSaveDocument | null {
  if (!isRecord(value) || value.version !== SURVIVAL_SAVE_VERSION) return null;
  const checkpoint = parseSurvivalRunCheckpoint(value.checkpoint);
  return checkpoint === null ? null : createSurvivalSaveDocument(checkpoint);
}

function cloneSurvivalRunCheckpoint(checkpoint: SurvivalRunCheckpoint): SurvivalRunCheckpoint {
  return Object.freeze({
    scavengeElapsedSeconds: checkpoint.scavengeElapsedSeconds,
    session: createSurvivalSessionCheckpoint(checkpoint.session),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFiniteNumber(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

function parseInteger(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

function parseItem(value: unknown): ItemInstance | null {
  if (!isRecord(value) || typeof value.instanceId !== 'string' || typeof value.type !== 'string') {
    return null;
  }
  if (!ITEM_ID_SET.has(value.type)) return null;
  const type = value.type as ItemId;
  const match = new RegExp(`^${type}-(\\d+)$`).exec(value.instanceId);
  if (match === null) return null;
  const index = Number(match[1]);
  if (!Number.isSafeInteger(index) || index < 1 || index > ITEM_DEFINITIONS[type].spawnCount) {
    return null;
  }
  return Object.freeze({ instanceId: value.instanceId as ItemInstanceId, type });
}

function parseInventory(value: unknown): SurvivalInventorySnapshot | null {
  if (!isRecord(value)) return null;
  const inventory: Partial<Record<ItemInstanceId, Readonly<SurvivalItemState>>> = {};
  for (const [instanceId, rawItem] of Object.entries(value)) {
    if (!isRecord(rawItem)) return null;
    const item = parseItem(rawItem);
    if (item === null || item.instanceId !== instanceId || typeof rawItem.condition !== 'string') return null;
    if (!isItemCondition(rawItem.condition)) return null;
    const condition = rawItem.condition;
    if (condition === 'broken' && !ITEM_DEFINITIONS[item.type].breakable) return null;
    if (condition === 'consumed' && ITEM_DEFINITIONS[item.type].charges === null) return null;
    inventory[item.instanceId] = Object.freeze({ ...item, condition });
  }
  return Object.freeze(inventory);
}

function allParsedCounters(
  values: readonly [number | null, number | null, number | null, number | null],
): values is readonly [number, number, number, number] {
  return values.every((field) => field !== null);
}

function parseCarlitos(value: unknown): CarlitosSnapshot | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const counters = [
    parseInteger(value.energy, 0, 3),
    parseInteger(value.hunger, 0, 5),
    parseInteger(value.sickness, 0, 5),
    parseInteger(value.unhappiness, 0, MAX_COUNTER),
  ] as const;
  if (!allParsedCounters(counters)) return undefined;
  const [energy, hunger, sickness, unhappiness] = counters;
  if (!hasCarlitosFlags(value)) return undefined;
  const deathCause = value.deathCause;
  if (!isCarlitosDeathCause(deathCause)) return undefined;
  if (value.alive !== (deathCause === null)) return undefined;
  return Object.freeze({
    alive: value.alive,
    energy,
    hunger,
    sickness,
    unhappiness,
    pettedToday: value.pettedToday,
    deathCause,
  });
}

function hasCarlitosFlags(
  value: Record<string, unknown>,
): value is Record<string, unknown> & { alive: boolean; pettedToday: boolean } {
  return typeof value.alive === 'boolean' && typeof value.pettedToday === 'boolean';
}

function isCarlitosDeathCause(
  value: unknown,
): value is CarlitosSnapshot['deathCause'] {
  return value === null || value === 'starvation' || value === 'sickness' || value === 'misery';
}

type ActionOutcomeExtensions = {
  readonly nextDawnEnergy?: DawnEnergy;
  readonly rewardSummary?: NonNullable<ActionOutcome['rewardSummary']>;
  readonly eventResult?: NonNullable<ActionOutcome['eventResult']>;
  readonly eventPresentationKey?: EventPresentationKey;
};

function parseActionOutcome(value: unknown): ActionOutcome | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const baseOutcome = parseActionOutcomeBase(value);
  if (baseOutcome === null) return undefined;
  const nextDawnEnergy = parseNextDawnEnergyExtension(value);
  const rewardSummary = parseRewardSummaryExtension(value);
  const eventResult = parseEventResultExtension(value);
  const eventPresentationKey = parseEventPresentationKeyExtension(value);
  if (nextDawnEnergy === null || rewardSummary === null
    || eventResult === null || eventPresentationKey === null) return undefined;
  return Object.freeze({
    ...baseOutcome,
    ...nextDawnEnergy,
    ...rewardSummary,
    ...eventResult,
    ...eventPresentationKey,
  });
}

function parseActionOutcomeBase(value: Record<string, unknown>) {
  if (typeof value.accepted !== 'boolean' || typeof value.code !== 'string'
    || typeof value.message !== 'string' || typeof value.cue !== 'string'
    || !PRESENTATION_CUE_SET.has(value.cue) || !isRecord(value.deltas)) return null;
  const deltas: Record<string, number> = {};
  for (const [key, rawDelta] of Object.entries(value.deltas)) {
    if (!ACTION_OUTCOME_DELTA_SET.has(key)) return null;
    const delta = parseInteger(rawDelta, -MAX_COUNTER, MAX_COUNTER);
    if (delta === null) return null;
    deltas[key] = delta;
  }
  return {
    accepted: value.accepted,
    code: value.code,
    message: value.message,
    deltas: Object.freeze(deltas),
    cue: value.cue as ActionOutcome['cue'],
  };
}

function parseNextDawnEnergyExtension(
  value: Record<string, unknown>,
): ActionOutcomeExtensions | null {
  if (!('nextDawnEnergy' in value)) return {};
  const nextDawnEnergy = parseInteger(value.nextDawnEnergy, 0, 4);
  return nextDawnEnergy === null ? null : { nextDawnEnergy: nextDawnEnergy as DawnEnergy };
}

function parseRewardSummaryExtension(
  value: Record<string, unknown>,
): ActionOutcomeExtensions | null {
  if (!('rewardSummary' in value)) return {};
  const rewardSummary = parseRewardSummary(value.rewardSummary);
  return rewardSummary === undefined ? null : { rewardSummary };
}

function parseEventResultExtension(
  value: Record<string, unknown>,
): ActionOutcomeExtensions | null {
  if (!('eventResult' in value)) return {};
  const eventResult = parseEventResult(value.eventResult);
  return eventResult === undefined ? null : { eventResult };
}

function parseEventPresentationKeyExtension(
  value: Record<string, unknown>,
): ActionOutcomeExtensions | null {
  if (!('eventPresentationKey' in value)) return {};
  if (typeof value.eventPresentationKey !== 'string'
    || !isEventPresentationKey(value.eventPresentationKey)) return null;
  return { eventPresentationKey: value.eventPresentationKey };
}

function parseRewardSummary(value: unknown): ActionOutcome['rewardSummary'] | undefined {
  if (!isRecord(value) || typeof value.kind !== 'string' || typeof value.id !== 'string') return undefined;
  if (value.kind === 'resource' && (value.id === 'food' || value.id === 'bait' || value.id === 'repairMaterial')) {
    const quantity = parseInteger(value.quantity, 1, MAX_COUNTER);
    return quantity === null ? undefined : Object.freeze({ kind: 'resource', id: value.id, quantity });
  }
  if (value.kind === 'item' && ITEM_ID_SET.has(value.id) && value.quantity === 1) {
    return Object.freeze({ kind: 'item', id: value.id as ItemId, quantity: 1 });
  }
  return undefined;
}

function parseEventResult(value: unknown): ActionOutcome['eventResult'] | undefined {
  if (!isRecord(value) || typeof value.eventId !== 'string' || !EVENT_ID_SET.has(value.eventId)
    || typeof value.choiceId !== 'string' || typeof value.resultId !== 'string') return undefined;
  const event = eventById(value.eventId);
  if (event === undefined) return undefined;
  const choice = event.choices.find(({ id }) => id === value.choiceId);
  if (choice === undefined || !matchesResultId(event, choice, value.resultId)) return undefined;
  return Object.freeze({ eventId: value.eventId, choiceId: value.choiceId, resultId: value.resultId });
}

function parseJournalAction(value: unknown): JournalDayActionRecord | null {
  if (!isRecord(value) || typeof value.kind !== 'string') return null;
  switch (value.kind) {
    case 'fishing': return parseJournalFishingAction(value);
    case 'carlitosCare': return parseJournalCarlitosCareAction(value);
    case 'carlitosDawn': return parseJournalCarlitosDawnAction(value);
    default: return null;
  }
}

function parseJournalFishingAction(
  value: Record<string, unknown>,
): Extract<JournalDayActionRecord, { readonly kind: 'fishing' }> | null {
  if (!hasJournalFishingFields(value)) return null;
  const food = parseInteger(value.food, 0, 2);
  if (food === null || !hasMatchingJournalFishingCatch(value)) return null;
  return Object.freeze({
    kind: 'fishing',
    attemptId: value.attemptId,
    result: value.result,
    catchId: value.catchId,
    catchLabel: value.catchLabel,
    food: food as 0 | 1 | 2,
    baitConsumed: value.baitConsumed,
  });
}

type JournalFishingFields = Record<string, unknown> & {
  readonly attemptId: string;
  readonly result: 'fish' | 'utility' | 'junk' | 'miss';
  readonly catchId: FishingCatchId | null;
  readonly catchLabel: string | null;
  readonly baitConsumed: boolean;
};

function hasJournalFishingFields(
  value: Record<string, unknown>,
): value is JournalFishingFields {
  return typeof value.attemptId === 'string'
    && typeof value.result === 'string'
    && ['fish', 'utility', 'junk', 'miss'].includes(value.result)
    && (value.catchId === null
      || typeof value.catchId === 'string' && isFishingCatchId(value.catchId))
    && (value.catchLabel === null || typeof value.catchLabel === 'string')
    && typeof value.baitConsumed === 'boolean';
}

function hasMatchingJournalFishingCatch(value: JournalFishingFields): boolean {
  return value.result === 'miss'
    ? value.catchId === null && value.catchLabel === null
    : value.catchId !== null && value.catchLabel !== null;
}

function parseJournalCarlitosCareAction(
  value: Record<string, unknown>,
): Extract<JournalDayActionRecord, { readonly kind: 'carlitosCare' }> | null {
  if (value.action !== 'pet' && value.action !== 'feed' && value.action !== 'treat') return null;
  return Object.freeze({ kind: 'carlitosCare', action: value.action });
}

function parseJournalCarlitosDawnAction(
  value: Record<string, unknown>,
): Extract<JournalDayActionRecord, { readonly kind: 'carlitosDawn' }> | null {
  const before = parseJournalCarlitosState(value.before);
  const after = parseJournalCarlitosState(value.after);
  return before === null || after === null ? null : Object.freeze({ kind: 'carlitosDawn', before, after });
}

function parseJournalCarlitosState(value: unknown): Extract<JournalDayActionRecord, { kind: 'carlitosDawn' }>['before'] | null {
  const parsed = parseCarlitos(value);
  return parsed === undefined || parsed === null ? null : parsed;
}

type JournalEventFields = Record<string, unknown> & {
  readonly phase: 'day' | 'night';
  readonly eventId: string;
  readonly title: string;
  readonly prompt: string;
  readonly attemptedChoiceId: string | null;
  readonly choiceLabel: string;
  readonly attemptedItemId: ItemId | null;
  readonly outcomeCode: string;
  readonly outcomeMessage: string;
  readonly inventoryMutations: unknown[];
};

function parseJournalEvent(value: unknown): Exclude<JournalDaytimeRecord, { readonly kind: 'sinkingShip' }> | null {
  if (!hasJournalEventFields(value) || !hasValidJournalPresentationKey(value)) return null;
  const definition = resolveJournalEventDefinition(value);
  if (definition === null) return null;
  const inventoryMutations = parseJournalMutations(value.inventoryMutations);
  if (inventoryMutations === null) return null;
  return createJournalEventRecord(value, inventoryMutations);
}

function resolveJournalEventDefinition(value: JournalEventFields) {
  const event = eventById(value.eventId);
  if (event === undefined || value.attemptedChoiceId === null) return null;
  const choice = event.choices.find(({ id }) => id === value.attemptedChoiceId);
  if (choice === undefined || !matchesJournalEventDefinition(value, event, choice)) return null;
  return { event, choice };
}

function matchesJournalEventDefinition(
  value: JournalEventFields,
  event: (typeof SURVIVAL_EVENTS)[number],
  choice: (typeof SURVIVAL_EVENTS)[number]['choices'][number],
): boolean {
  return event.phase === value.phase
    && event.title === value.title
    && event.prompt === value.prompt
    && choice.label === value.choiceLabel
    && (choice.itemId ?? null) === value.attemptedItemId
    && value.outcomeCode === 'event-resolved'
    && matchesJournalOutcome(event, choice, value.outcomeMessage, value.eventPresentationKey);
}

function parseJournalMutations(
  values: unknown[],
): readonly JournalInventoryMutation[] | null {
  const inventoryMutations = values.map(parseJournalMutation);
  return inventoryMutations.some((mutation) => mutation === null)
    ? null
    : Object.freeze(inventoryMutations as JournalInventoryMutation[]);
}

function createJournalEventRecord(
  value: JournalEventFields,
  inventoryMutations: readonly JournalInventoryMutation[],
): Exclude<JournalDaytimeRecord, { readonly kind: 'sinkingShip' }> {
  return Object.freeze({
    phase: value.phase as 'day' | 'night',
    eventId: value.eventId,
    title: value.title,
    prompt: value.prompt,
    attemptedChoiceId: value.attemptedChoiceId,
    choiceLabel: value.choiceLabel,
    attemptedItemId: value.attemptedItemId === null ? null : value.attemptedItemId as ItemId,
    outcomeCode: value.outcomeCode,
    outcomeMessage: value.outcomeMessage,
    ...('eventPresentationKey' in value ? { eventPresentationKey: value.eventPresentationKey as EventPresentationKey } : {}),
    inventoryMutations,
  });
}

function hasJournalEventFields(value: unknown): value is JournalEventFields {
  return isRecord(value)
    && hasJournalEventIdentity(value)
    && hasJournalEventAttempt(value)
    && hasJournalEventOutcome(value);
}

function hasJournalEventIdentity(value: Record<string, unknown>): boolean {
  return (value.phase === 'day' || value.phase === 'night')
    && typeof value.eventId === 'string'
    && EVENT_ID_SET.has(value.eventId)
    && typeof value.title === 'string'
    && typeof value.prompt === 'string';
}

function hasJournalEventAttempt(value: Record<string, unknown>): boolean {
  return (value.attemptedChoiceId === null || typeof value.attemptedChoiceId === 'string')
    && typeof value.choiceLabel === 'string'
    && (value.attemptedItemId === null
      || typeof value.attemptedItemId === 'string' && ITEM_ID_SET.has(value.attemptedItemId));
}

function hasJournalEventOutcome(value: Record<string, unknown>): boolean {
  return typeof value.outcomeCode === 'string'
    && typeof value.outcomeMessage === 'string'
    && Array.isArray(value.inventoryMutations);
}

function hasValidJournalPresentationKey(value: Record<string, unknown>): boolean {
  return !('eventPresentationKey' in value)
    || typeof value.eventPresentationKey === 'string'
      && isEventPresentationKey(value.eventPresentationKey);
}

function eventById(eventId: string) {
  return SURVIVAL_EVENTS.find(({ id }) => id === eventId);
}

function matchesResultId(
  event: (typeof SURVIVAL_EVENTS)[number],
  choice: (typeof SURVIVAL_EVENTS)[number]['choices'][number],
  resultId: string,
): boolean {
  return choice.outcomes.some((outcome) => outcome.resultId === resultId)
    || (resultId === fallbackResultId(event.id) && choiceMayFallbackToFood(choice));
}

function matchesJournalOutcome(
  event: (typeof SURVIVAL_EVENTS)[number],
  choice: (typeof SURVIVAL_EVENTS)[number]['choices'][number],
  message: string,
  presentationKey: unknown,
): boolean {
  if (message === fallbackMessage(event.id) && choiceMayFallbackToFood(choice)) {
    return presentationKey === undefined;
  }
  return choice.outcomes.some((outcome) => (
    outcome.message === message && outcome.presentationKey === presentationKey
  ));
}

function fallbackResultId(eventId: string): string | undefined {
  if (eventId === 'night-trader') return 'trader-food-fallback';
  if (eventId === 'handyman') return 'handyman-food-fallback';
  return undefined;
}

function fallbackMessage(eventId: string): string | undefined {
  return fallbackResultId(eventId) === undefined
    ? undefined
    : 'The item slot is occupied, so you receive one food instead.';
}

function choiceMayFallbackToFood(
  choice: (typeof SURVIVAL_EVENTS)[number]['choices'][number],
): boolean {
  return choice.outcomes.some((outcome) => outcome.effects.items?.some((item) => (
    item.kind === 'gain' || item.kind === 'gainChest'
  )) === true);
}

function parseJournalMutation(value: unknown): JournalInventoryMutation | null {
  if (!isRecord(value) || !['consume', 'break', 'lose', 'gain', 'repair'].includes(String(value.kind))
    || !Array.isArray(value.instanceIds)) return null;
  const instanceIds = value.instanceIds.map(parseItemInstanceId);
  return instanceIds.some((instanceId) => instanceId === null) || new Set(instanceIds).size !== instanceIds.length
    ? null
    : Object.freeze({ kind: value.kind as 'consume' | 'break' | 'lose' | 'gain' | 'repair', instanceIds: Object.freeze(instanceIds as ItemInstanceId[]) });
}

function parseJournalDaytime(value: unknown): JournalDaytimeRecord | null | undefined {
  if (value === null) return null;
  if (isRecord(value) && value.kind === 'sinkingShip' && Object.keys(value).length === 1) {
    return Object.freeze({ kind: 'sinkingShip' });
  }
  return parseJournalEvent(value) ?? undefined;
}

function parseJournalNight(value: unknown): JournalNightRecord | null {
  if (!isRecord(value) || typeof value.kind !== 'string') return null;
  if (value.kind === 'quiet' && Object.keys(value).length === 1) return Object.freeze({ kind: 'quiet' });
  if (value.kind !== 'event') return null;
  const event = parseJournalEvent(value.event);
  return event === null ? null : Object.freeze({ kind: 'event', event });
}

function parseJournalEntry(value: unknown): JournalEntry | null {
  if (!isRecord(value) || !Array.isArray(value.actions)) return null;
  const day = parseInteger(value.day, 1, MAX_COUNTER);
  if (day === null || typeof value.weather !== 'string' || !WEATHER_ID_SET.has(value.weather as WeatherId)) return null;
  const actions = value.actions.map(parseJournalAction);
  const daytime = parseJournalDaytime(value.daytime);
  const nighttime = parseJournalNight(value.nighttime);
  if (actions.some((action) => action === null) || daytime === undefined || nighttime === null) return null;
  return Object.freeze({ day, weather: value.weather as WeatherId, actions: Object.freeze(actions as JournalDayActionRecord[]), daytime, nighttime });
}

function parseSessionCheckpoint(value: unknown): SurvivalSessionCheckpoint | null {
  if (!isRecord(value)) return null;
  const state = value.state;
  const day = parseInteger(value.day, 1, MAX_COUNTER);
  const pressure = parseInteger(value.pressure, 0, 4);
  const health = parseInteger(value.health, 1, 100);
  const hunger = parseInteger(value.hunger, 0, 100);
  const energy = parseInteger(value.energy, 0, 4);
  const hull = parseInteger(value.hull, 1, 100);
  const food = parseInteger(value.food, 0, MAX_COUNTER);
  const bait = parseInteger(value.bait, 0, MAX_COUNTER);
  const recoveredFood = parseInteger(value.recoveredFood, 0, parsedUpperBound(food));
  const recoveredBait = parseInteger(value.recoveredBait, 0, parsedUpperBound(bait));
  const repairMaterial = parseInteger(value.repairMaterial, 0, MAX_COUNTER);
  const rescueLead = parseInteger(value.rescueLead, 0, 8);
  const rescueTraceFinds = parseInteger(value.rescueTraceFinds, 0, 2);
  const radioSignalsSent = parseInteger(value.radioSignalsSent, 0, MAX_COUNTER);
  const savedPickupCount = parseInteger(value.savedPickupCount, 0, MAX_COUNTER);
  const fishingCounter = parseInteger(value.fishingCounter, 0, MAX_COUNTER);
  const seed = parseInteger(value.seed, 0, MAX_UINT32);
  const randomState = parseInteger(value.randomState, 0, MAX_UINT32);
  const scavengeFields = [day, pressure, health, hunger, energy, hull, food, bait, recoveredFood,
    recoveredBait, repairMaterial, rescueLead, rescueTraceFinds, radioSignalsSent, savedPickupCount,
    fishingCounter, seed, randomState];
  if (!hasValidSessionScalars(state, scavengeFields)) return null;
  if (!hasSessionFlags(value)) return null;
  const chest = parseChest(value.chest, day!);
  const inventory = parseInventory(value.inventory);
  const savedItems = parseItemList(value.savedItems);
  const carlitos = parseCarlitos(value.carlitos);
  const nextDawnEnergyOverride = parseNextDawnEnergyOverride(value.nextDawnEnergyOverride);
  const lastEventId = parseEventIdOrNull(value.lastEventId);
  const lastSeenDays = parseEventNumberRecord(value.lastSeenDays, 0, day!);
  const appearanceCounts = parseEventNumberRecord(value.appearanceCounts, 0, MAX_COUNTER);
  const lastOutcome = parseActionOutcome(value.lastOutcome);
  const lastHealthCause = parseDeathCause(value.lastHealthCause);
  const lastHullEventId = parseEventIdOrNull(value.lastHullEventId);
  const pendingJournalDaytime = parseJournalDaytime(value.pendingJournalDaytime);
  const pendingJournalNighttime = parsePendingJournalNight(value.pendingJournalNighttime);
  const pendingJournalActions = parseJournalActions(value.pendingJournalActions);
  const journalEntries = parseJournalEntries(value.journalEntries);
  const history = parseHistory(value.history, day!);
  if ([chest, inventory, savedItems, lastSeenDays, appearanceCounts,
    lastHealthCause, pendingJournalActions, journalEntries, history].some((field) => field === null)) return null;
  if ([carlitos, lastEventId, lastOutcome, lastHullEventId, pendingJournalDaytime,
    pendingJournalNighttime].some((field) => field === undefined)) return null;
  if (nextDawnEnergyOverride === undefined) return null;
  const pendingEventId = parseEventIdOrNull(value.pendingEventId);
  const pendingEventTargetId = parsePendingEventTargetId(value.pendingEventTargetId, inventory!);
  if (pendingEventId === undefined || pendingEventTargetId === undefined) return null;
  if (!hasValidPendingEventState(state, pendingEventId, pendingEventTargetId)) return null;
  if (!hasValidSessionInventory(inventory!, savedItems!, savedPickupCount!, carlitos!)) return null;
  if (!hasValidPendingEventDefinition(
    state, pendingEventId, pendingEventTargetId, inventory!,
  )) return null;
  return createSurvivalSessionCheckpoint({
    history: history!,
    state: state as SurvivalSessionCheckpoint['state'], day: day!, pressure: pressure!, health: health!, hunger: hunger!, energy: energy!, hull: hull!,
    food: food!, bait: bait!, recoveredFood: recoveredFood!, recoveredBait: recoveredBait!, repairMaterial: repairMaterial!, rescueLead: rescueLead! as RescueLead,
    rescueTraceFinds: rescueTraceFinds! as 0 | 1 | 2, radioSignalAvailable: value.radioSignalAvailable, radioSignalsSent: radioSignalsSent!, radioSignalsEnabled: value.radioSignalsEnabled,
    chest: chest!, weather: value.weather, actedToday: value.actedToday, inventory: inventory!, savedItems: savedItems!, savedPickupCount: savedPickupCount!, carlitos: carlitos!,
    pendingEventId, pendingEventTargetId, nextDawnEnergyOverride: nextDawnEnergyOverride as DawnEnergy | null,
    lastEventId: lastEventId!, lastSeenDays: lastSeenDays!, appearanceCounts: appearanceCounts!, lastOutcome: lastOutcome!, lastHealthCause: lastHealthCause!, lastHullEventId: lastHullEventId!,
    pendingJournalDaytime: pendingJournalDaytime!, pendingJournalNighttime: pendingJournalNighttime!, pendingJournalActions: pendingJournalActions!, journalEntries: journalEntries!,
    fishingCounter: fishingCounter!, seed: seed!, randomState: randomState!,
  });
}

function parsedUpperBound(value: number | null): number {
  return value ?? -1;
}

function parseHistory(value: unknown, currentDay: number): readonly SurvivalReading[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const readings: SurvivalReading[] = [];
  let previousDay = 0;
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const day = parseInteger(raw.day, previousDay + 1, currentDay);
    const health = parseInteger(raw.health, 0, 100);
    const hunger = parseInteger(raw.hunger, 0, 100);
    const hull = parseInteger(raw.hull, 0, 100);
    if (day === null || health === null || hunger === null || hull === null) return null;
    readings.push({ day, health, hunger, hull });
    previousDay = day;
  }
  return previousDay === currentDay ? readings : null;
}

function parseNextDawnEnergyOverride(value: unknown): DawnEnergy | null | undefined {
  if (value === null) return null;
  const parsed = parseInteger(value, 0, 4);
  return parsed === null ? undefined : parsed as DawnEnergy;
}

function parsePendingJournalNight(value: unknown): JournalNightRecord | null | undefined {
  if (value === null) return null;
  return parseJournalNight(value) ?? undefined;
}

function parsePendingEventTargetId(
  value: unknown,
  inventory: SurvivalInventorySnapshot,
): ItemInstanceId | null | undefined {
  return value === null ? null : parseKnownInventoryId(value, inventory);
}

function isSessionState(value: unknown): value is SurvivalSessionCheckpoint['state'] {
  return value === 'day' || value === 'dayEvent' || value === 'nightEvent';
}

function hasValidSessionScalars(
  state: unknown,
  fields: readonly (number | null)[],
): state is SurvivalSessionCheckpoint['state'] {
  return isSessionState(state) && fields.every((field) => field !== null);
}

function hasSessionFlags(
  value: Record<string, unknown>,
): value is Record<string, unknown> & {
  radioSignalAvailable: boolean;
  radioSignalsEnabled: boolean;
  actedToday: boolean;
  weather: WeatherId;
} {
  return typeof value.radioSignalAvailable === 'boolean'
    && typeof value.radioSignalsEnabled === 'boolean'
    && typeof value.actedToday === 'boolean'
    && typeof value.weather === 'string'
    && WEATHER_ID_SET.has(value.weather as WeatherId);
}

function hasValidPendingEventState(
  state: SurvivalSessionCheckpoint['state'],
  pendingEventId: string | null,
  pendingEventTargetId: ItemInstanceId | null,
): boolean {
  if (state === 'day') return pendingEventId === null && pendingEventTargetId === null;
  return pendingEventId !== null;
}

function hasValidSessionInventory(
  inventory: SurvivalInventorySnapshot,
  savedItems: readonly ItemInstance[],
  savedPickupCount: number,
  carlitos: CarlitosSnapshot | null,
): boolean {
  if (Object.values(inventory).some((item) => item?.type === 'carlitos')) return false;
  if (savedPickupCount !== savedItems.length + (carlitos === null ? 0 : 1)) return false;
  return inventoryContainsIds(inventory, savedItems.map((item) => item.instanceId));
}

function hasValidPendingEventDefinition(
  state: SurvivalSessionCheckpoint['state'],
  pendingEventId: string | null,
  pendingEventTargetId: ItemInstanceId | null,
  inventory: SurvivalInventorySnapshot,
): boolean {
  if (pendingEventId === null) return true;
  const event = SURVIVAL_EVENTS.find(({ id }) => id === pendingEventId)!;
  if ((state === 'dayEvent') !== (event.phase === 'day')) return false;
  if ((state === 'nightEvent') !== (event.phase === 'night')) return false;
  return pendingEventTargetId === null
    || event.targetItemIds?.includes(inventory[pendingEventTargetId]!.type) === true;
}

function parseSurvivalRunCheckpoint(value: unknown): SurvivalRunCheckpoint | null {
  if (!isRecord(value)) return null;
  const scavengeElapsedSeconds = parseFiniteNumber(value.scavengeElapsedSeconds, 0, MAX_COUNTER);
  const session = parseSessionCheckpoint(value.session);
  return scavengeElapsedSeconds === null || session === null
    ? null
    : Object.freeze({ scavengeElapsedSeconds, session });
}

function parseChest(value: unknown, day: number): ChestSnapshot | null {
  if (!isRecord(value) || (value.state !== 'none' && value.state !== 'closed' && value.state !== 'mimic')) return null;
  if (value.state === 'none') return value.acquiredDay === null ? Object.freeze({ state: 'none', acquiredDay: null }) : null;
  const acquiredDay = parseInteger(value.acquiredDay, 1, day);
  return acquiredDay === null ? null : Object.freeze({ state: value.state, acquiredDay });
}

function parseItemList(value: unknown): readonly ItemInstance[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.map(parseItem);
  return items.some((item) => item === null) || new Set(items.map((item) => item!.instanceId)).size !== items.length
    ? null
    : Object.freeze(items as ItemInstance[]);
}

function parseItemInstanceId(value: unknown): ItemInstanceId | null {
  if (typeof value !== 'string') return null;
  const match = /^(.+)-(\d+)$/.exec(value);
  if (match === null || !ITEM_ID_SET.has(match[1] ?? '')) return null;
  const type = match[1] as ItemId;
  const number = Number(match[2]);
  return Number.isSafeInteger(number) && number >= 1 && number <= ITEM_DEFINITIONS[type].spawnCount
    ? value as ItemInstanceId
    : null;
}

function parseKnownInventoryId(value: unknown, inventory: SurvivalInventorySnapshot): ItemInstanceId | null | undefined {
  if (typeof value !== 'string') return undefined;
  const instanceId = parseItemInstanceId(value);
  return instanceId === null || inventory[instanceId] === undefined ? undefined : instanceId;
}

function inventoryContainsIds(inventory: SurvivalInventorySnapshot, ids: readonly ItemInstanceId[]): boolean {
  return ids.every((id) => inventory[id] !== undefined);
}

function parseEventIdOrNull(value: unknown): string | null | undefined {
  return value === null ? null : typeof value === 'string' && EVENT_ID_SET.has(value) ? value : undefined;
}

function parseEventNumberRecord(value: unknown, minimum: number, maximum: number): Readonly<Record<string, number>> | null {
  if (!isRecord(value)) return null;
  const record: Record<string, number> = {};
  for (const [eventId, rawNumber] of Object.entries(value)) {
    const number = parseInteger(rawNumber, minimum, maximum);
    if (!EVENT_ID_SET.has(eventId) || number === null) return null;
    record[eventId] = number;
  }
  return Object.freeze(record);
}

function parseDeathCause(value: unknown): DeathCause | null {
  if (!isRecord(value) || typeof value.kind !== 'string') return null;
  if (value.kind === 'starvation' || value.kind === 'diving' || value.kind === 'other') return Object.freeze({ kind: value.kind });
  return value.kind === 'event' && typeof value.eventId === 'string' && EVENT_ID_SET.has(value.eventId)
    ? Object.freeze({ kind: 'event', eventId: value.eventId })
    : null;
}

function parseJournalActions(value: unknown): readonly JournalDayActionRecord[] | null {
  if (!Array.isArray(value)) return null;
  const actions = value.map(parseJournalAction);
  return actions.some((action) => action === null) ? null : Object.freeze(actions as JournalDayActionRecord[]);
}

function parseJournalEntries(value: unknown): readonly JournalEntry[] | null {
  if (!Array.isArray(value)) return null;
  const entries = value.map(parseJournalEntry);
  if (entries.some((entry) => entry === null)) return null;
  const days = entries.map((entry) => entry!.day);
  return new Set(days).size !== days.length ? null : Object.freeze(entries as JournalEntry[]);
}

import { cloneOutcomeText, type OutcomeText } from './outcomeText';
import { presentationWeatherForEvent, type PresentationWeatherId } from '../weather/presentationWeather';
import type { ItemId, ItemInstanceId } from '../game/ItemState';
import type { CarlitosState, CarlitosRest } from './CarlitosState';
import type { FishingTerminalResult } from './FishingSession';
import type { FishingCatchId } from './fishingCatalog';
import type { FishingSettlement } from './fishingSettlementRules';
import type {
  ActionOutcome,
  EventPresentationKey,
  ResourceDelta,
  SurvivalEventDefinition,
} from './survivalTypes';

export interface JournalInventoryMutation {
  readonly kind: 'consume' | 'break' | 'lose' | 'gain' | 'repair';
  readonly instanceIds: readonly ItemInstanceId[];
}

export interface JournalEventRecord {
  readonly deltas: Readonly<ResourceDelta>;
  readonly phase: 'day' | 'night';
  readonly eventId: string;
  readonly attemptedChoiceId: string | null;
  readonly attemptedItemId: ItemId | null;
  readonly outcomeCode: string;
  readonly text: OutcomeText;
  readonly eventPresentationKey?: EventPresentationKey;
  readonly inventoryMutations: readonly JournalInventoryMutation[];
}

export interface JournalSinkingShipRecord {
  readonly kind: 'sinkingShip';
}

export type JournalDaytimeRecord = JournalEventRecord | JournalSinkingShipRecord;

export type JournalNightRecord =
  | { readonly kind: 'event'; readonly event: JournalEventRecord }
  | { readonly kind: 'quiet' };

export interface JournalFishingRecord {
  readonly deltas: Readonly<ResourceDelta>;
  readonly inventoryMutations: readonly JournalInventoryMutation[];
  readonly kind: 'fishing';
  readonly attemptId: string;
  readonly result: 'fish' | 'utility' | 'junk' | 'miss';
  readonly catchId: FishingCatchId | null;
  readonly food: 0 | 1 | 2;
  readonly baitConsumed: boolean;
}

export interface JournalCarlitosCareRecord {
  readonly kind: 'carlitosCare';
  readonly action: 'pet' | 'feed';
}

export interface JournalSurvivalActionRecord {
  readonly kind: 'dayAction';
  readonly action: 'treat' | 'dive' | 'repair' | 'repairItem' | 'discardItem';
  readonly deltas: Readonly<ResourceDelta>;
  readonly inventoryMutations: readonly JournalInventoryMutation[];
}

export interface JournalCarlitosDawnRecord {
  readonly kind: 'carlitosDawn';
  readonly before: JournalCarlitosDawnState;
  readonly after: JournalCarlitosDawnState;
}

export interface JournalCarlitosDawnState {
  readonly rest: CarlitosRest;
  readonly hunger: number;
  readonly unhappiness: number;
  readonly pettedToday: boolean;
}

export type JournalDayActionRecord =
  | JournalFishingRecord
  | JournalSurvivalActionRecord
  | JournalCarlitosCareRecord
  | JournalCarlitosDawnRecord;

export interface JournalEntry {
  readonly day: number;
  readonly weather: PresentationWeatherId;
  readonly nightWeather: PresentationWeatherId | null;
  readonly actions: readonly JournalDayActionRecord[];
  readonly daytime: JournalDaytimeRecord | null;
  readonly nighttime: JournalNightRecord | { readonly kind: 'pending' };
}

export function createJournalEventRecord(
  event: Pick<SurvivalEventDefinition, 'phase' | 'id'>,
  attemptedChoiceId: string | null,
  attemptedItemId: ItemId | null,
  outcome: Pick<ActionOutcome, 'code' | 'text' | 'eventPresentationKey' | 'deltas'>,
  inventoryMutations: readonly JournalInventoryMutation[],
): JournalEventRecord {
  if (outcome.text === undefined) throw new Error('Journal event requires a stable text reference.');
  return Object.freeze({
    phase: event.phase,
    eventId: event.id,
    attemptedChoiceId,
    attemptedItemId,
    outcomeCode: outcome.code,
    deltas: Object.freeze({ ...outcome.deltas }),
    text: cloneOutcomeText(outcome.text),
    ...(outcome.eventPresentationKey === undefined
      ? {}
      : { eventPresentationKey: outcome.eventPresentationKey }),
    inventoryMutations: cloneJournalInventoryMutations(inventoryMutations),
  });
}

export function createJournalNightEventRecord(event: JournalEventRecord): JournalNightRecord {
  return Object.freeze({ kind: 'event', event: cloneJournalRecord(event) });
}

export function createQuietJournalNightRecord(): JournalNightRecord {
  return Object.freeze({ kind: 'quiet' });
}

export function createJournalFishingRecord(
  attemptId: string,
  result: FishingTerminalResult,
  settlement: Pick<FishingSettlement, 'food' | 'baitConsumed' | 'deltas'>,
  inventoryMutations: readonly JournalInventoryMutation[],
): JournalFishingRecord {
  return Object.freeze({
    kind: 'fishing',
    attemptId,
    result: result.kind === 'miss' ? 'miss' : result.catch.kind,
    catchId: result.kind === 'miss' ? null : result.catch.id,
    food: settlement.food,
    baitConsumed: settlement.baitConsumed,
    deltas: Object.freeze({ ...settlement.deltas }),
    inventoryMutations: cloneJournalInventoryMutations(inventoryMutations),
  });
}

export function createJournalCarlitosCareRecord(
  action: JournalCarlitosCareRecord['action'],
): JournalCarlitosCareRecord {
  return Object.freeze({ kind: 'carlitosCare', action });
}

export function createJournalSurvivalActionRecord(
  action: JournalSurvivalActionRecord['action'],
  deltas: Readonly<ResourceDelta>,
  inventoryMutations: readonly JournalInventoryMutation[],
): JournalSurvivalActionRecord {
  return Object.freeze({
    kind: 'dayAction',
    action,
    deltas: Object.freeze({ ...deltas }),
    inventoryMutations: cloneJournalInventoryMutations(inventoryMutations),
  });
}

export function createJournalCarlitosDawnRecord(
  before: JournalCarlitosDawnState,
  after: JournalCarlitosDawnState,
): JournalCarlitosDawnRecord {
  return Object.freeze({
    kind: 'carlitosDawn',
    before: Object.freeze({ ...before }),
    after: Object.freeze({ ...after }),
  });
}

export function createJournalCarlitosDawnState(
  state: CarlitosState,
): JournalCarlitosDawnState {
  return Object.freeze({
    rest: state.rest,
    hunger: state.hunger,
    unhappiness: state.unhappiness,
    pettedToday: state.pettedToday,
  });
}

export function createJournalSinkingShipRecord(): JournalSinkingShipRecord {
  return Object.freeze({ kind: 'sinkingShip' });
}

export function createJournalEntry(
  day: number,
  weather: PresentationWeatherId,
  actions: readonly JournalDayActionRecord[],
  daytime: JournalDaytimeRecord | null,
  nighttime: JournalEntry['nighttime'],
): JournalEntry {
  return Object.freeze({
    day,
    weather,
    nightWeather: nighttime.kind === 'pending' ? null
      : nighttime.kind === 'event' ? presentationWeatherForEvent(nighttime.event.eventId) ?? 'calm' : 'calm',
    actions: cloneJournalActions(actions),
    daytime: daytime === null ? null : cloneJournalDaytime(daytime),
    nighttime: nighttime.kind === 'pending' ? Object.freeze({ kind: 'pending' }) : cloneJournalNight(nighttime),
  });
}

function cloneJournalRecord(record: JournalEventRecord): JournalEventRecord {
  return Object.freeze({
    ...record,
    deltas: Object.freeze({ ...record.deltas }),
    text: cloneOutcomeText(record.text),
    inventoryMutations: cloneJournalInventoryMutations(record.inventoryMutations),
  });
}

function cloneJournalDaytime(record: JournalDaytimeRecord): JournalDaytimeRecord {
  return 'kind' in record
    ? createJournalSinkingShipRecord()
    : cloneJournalRecord(record);
}

export function cloneJournalEntry(entry: JournalEntry): JournalEntry {
  return Object.freeze({
    ...entry,
    actions: cloneJournalActions(entry.actions),
    daytime: entry.daytime === null ? null : cloneJournalDaytime(entry.daytime),
    nighttime: entry.nighttime.kind === 'pending'
      ? Object.freeze({ kind: 'pending' }) : cloneJournalNight(entry.nighttime),
  });
}

export function cloneJournalNight(record: JournalNightRecord): JournalNightRecord {
  return record.kind === 'quiet'
    ? createQuietJournalNightRecord()
    : createJournalNightEventRecord(record.event);
}

export function cloneJournalActions(
  actions: readonly JournalDayActionRecord[],
): readonly JournalDayActionRecord[] {
  return Object.freeze(actions.map((action) => {
    if (action.kind === 'fishing') {
      return Object.freeze({ ...action, deltas: Object.freeze({ ...action.deltas }),
        inventoryMutations: cloneJournalInventoryMutations(action.inventoryMutations) });
    }
    if (action.kind === 'dayAction') {
      return createJournalSurvivalActionRecord(action.action, action.deltas, action.inventoryMutations);
    }
    if (action.kind === 'carlitosDawn') {
      return createJournalCarlitosDawnRecord(action.before, action.after);
    }
    return Object.freeze({ ...action });
  }));
}

export function cloneJournalInventoryMutations(
  mutations: readonly JournalInventoryMutation[],
): readonly JournalInventoryMutation[] {
  return Object.freeze(mutations.map((mutation) => Object.freeze({
    kind: mutation.kind,
    instanceIds: Object.freeze([...mutation.instanceIds]),
  })));
}

export function journalSnapshot(entries: readonly JournalEntry[]): readonly JournalEntry[] {
  return Object.freeze(entries.map(cloneJournalEntry));
}

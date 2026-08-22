import type { ItemId, ItemInstanceId } from '../game/ItemState';
import type { CarlitosDeathCause, CarlitosState } from './CarlitosState';
import type { FishingTerminalResult } from './FishingSession';
import type { FishingCatchId } from './fishingCatalog';
import type {
  ActionOutcome,
  EventPresentationKey,
  SurvivalEventDefinition,
  WeatherId,
} from './survivalTypes';

export interface JournalInventoryMutation {
  readonly kind: 'consume' | 'break' | 'lose' | 'gain' | 'repair';
  readonly instanceIds: readonly ItemInstanceId[];
}

export interface JournalEventRecord {
  phase: 'day' | 'night';
  eventId: string;
  title: string;
  prompt: string;
  attemptedChoiceId: string | null;
  readonly choiceLabel: string;
  attemptedItemId: ItemId | null;
  outcomeCode: string;
  outcomeMessage: string;
  eventPresentationKey?: EventPresentationKey;
  readonly inventoryMutations: readonly JournalInventoryMutation[];
}

export interface JournalSinkingShipRecord {
  readonly kind: 'sinkingShip';
}

export type JournalDaytimeRecord = JournalEventRecord | JournalSinkingShipRecord;

export type JournalNightRecord =
  | { kind: 'event'; event: JournalEventRecord }
  | { kind: 'quiet' };

export interface JournalFishingRecord {
  readonly kind: 'fishing';
  readonly attemptId: string;
  readonly result: 'fish' | 'utility' | 'junk' | 'miss';
  readonly catchId: FishingCatchId | null;
  readonly catchLabel: string | null;
  readonly food: 0 | 1 | 2;
  readonly baitConsumed: boolean;
}

export interface JournalCarlitosCareRecord {
  readonly kind: 'carlitosCare';
  readonly action: 'pet' | 'feed' | 'treat';
}

export interface JournalCarlitosDawnRecord {
  readonly kind: 'carlitosDawn';
  readonly before: JournalCarlitosDawnState;
  readonly after: JournalCarlitosDawnState;
}

export interface JournalCarlitosDawnState {
  readonly alive: boolean;
  readonly energy: number;
  readonly hunger: number;
  readonly sickness: number;
  readonly unhappiness: number;
  readonly pettedToday: boolean;
  readonly deathCause: CarlitosDeathCause | null;
}

export type JournalDayActionRecord =
  | JournalFishingRecord
  | JournalCarlitosCareRecord
  | JournalCarlitosDawnRecord;

export interface JournalEntry {
  day: number;
  weather: WeatherId;
  readonly actions: readonly JournalDayActionRecord[];
  daytime: JournalDaytimeRecord | null;
  nighttime: JournalNightRecord;
}

export function createJournalEventRecord(
  event: Pick<SurvivalEventDefinition, 'phase' | 'id' | 'title' | 'prompt'>,
  attemptedChoiceId: string | null,
  choiceLabel: string,
  attemptedItemId: ItemId | null,
  outcome: Pick<ActionOutcome, 'code' | 'message' | 'eventPresentationKey'>,
  inventoryMutations: readonly JournalInventoryMutation[],
): JournalEventRecord {
  return {
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
}

export function createJournalNightEventRecord(event: JournalEventRecord): JournalNightRecord {
  return { kind: 'event', event };
}

export function createQuietJournalNightRecord(): JournalNightRecord {
  return { kind: 'quiet' };
}

export function createJournalFishingRecord(
  attemptId: string,
  result: FishingTerminalResult,
  food: 0 | 1 | 2,
  baitConsumed: boolean,
): JournalFishingRecord {
  return Object.freeze({
    kind: 'fishing',
    attemptId,
    result: result.kind === 'miss' ? 'miss' : result.catch.kind,
    catchId: result.kind === 'miss' ? null : result.catch.id,
    catchLabel: result.kind === 'miss' ? null : result.catch.label,
    food,
    baitConsumed,
  });
}

export function createJournalCarlitosCareRecord(
  action: JournalCarlitosCareRecord['action'],
): JournalCarlitosCareRecord {
  return Object.freeze({ kind: 'carlitosCare', action });
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
    alive: state.alive,
    energy: state.energy,
    hunger: state.hunger,
    sickness: state.sickness,
    unhappiness: state.unhappiness,
    pettedToday: state.pettedToday,
    deathCause: state.deathCause,
  });
}

export function createJournalSinkingShipRecord(): JournalSinkingShipRecord {
  return Object.freeze({ kind: 'sinkingShip' });
}

export function createJournalEntry(
  day: number,
  weather: WeatherId,
  actions: readonly JournalDayActionRecord[],
  daytime: JournalDaytimeRecord | null,
  nighttime: JournalNightRecord,
): JournalEntry {
  return {
    day,
    weather,
    actions: cloneJournalActions(actions),
    daytime,
    nighttime,
  };
}

function cloneJournalRecord(record: JournalEventRecord): JournalEventRecord {
  return Object.freeze({
    ...record,
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
    nighttime: cloneJournalNight(entry.nighttime),
  });
}

export function cloneJournalNight(record: JournalNightRecord): JournalNightRecord {
  return Object.freeze(record.kind === 'quiet'
    ? createQuietJournalNightRecord()
    : createJournalNightEventRecord(cloneJournalRecord(record.event)));
}

export function cloneJournalActions(
  actions: readonly JournalDayActionRecord[],
): readonly JournalDayActionRecord[] {
  return Object.freeze(actions.map((action) => Object.freeze(
    action.kind === 'carlitosDawn'
      ? {
          ...action,
          before: Object.freeze({ ...action.before }),
          after: Object.freeze({ ...action.after }),
        }
      : { ...action },
  )));
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

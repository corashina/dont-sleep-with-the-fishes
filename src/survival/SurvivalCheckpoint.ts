import { cloneActionOutcome } from './outcomeText';
import type { DeathCause } from '../game/ending';
import type { SurvivalReading } from '../game/runStatistics';
import type { ItemInstance, ItemInstanceId } from '../game/ItemState';
import type { CarlitosSnapshot } from './CarlitosState';
import {
  cloneJournalActions,
  cloneJournalEntry,
  cloneJournalNight,
  createJournalNightEventRecord,
  createJournalSinkingShipRecord,
} from './journalRecords';
import type {
  JournalDayActionRecord,
  JournalDaytimeRecord,
  JournalEntry,
  JournalNightRecord,
} from './journalRecords';
import type { RescueLead } from './survivalBalance';
import type {
  ActionOutcome,
  ChestSnapshot,
  DawnEnergy,
  SurvivalInventorySnapshot,
  WeatherId,
} from './survivalTypes';

export interface SurvivalSessionCheckpoint {
  readonly history: readonly SurvivalReading[];
  readonly state: 'day' | 'dayEvent' | 'nightEvent';
  readonly day: number;
  readonly pressure: number;
  readonly health: number;
  readonly hunger: number;
  readonly energy: number;
  readonly hull: number;
  readonly food: number;
  readonly bait: number;
  readonly recoveredFood: number;
  readonly recoveredBait: number;
  readonly rescueLead: RescueLead;
  readonly rescueTraceFinds: 0 | 1 | 2;
  readonly radioSignalAvailable: boolean;
  readonly radioSignalsSent: number;
  readonly radioSignalsEnabled: boolean;
  readonly chest: ChestSnapshot;
  readonly weather: WeatherId;
  readonly actedToday: boolean;
  readonly inventory: SurvivalInventorySnapshot;
  readonly savedItems: readonly ItemInstance[];
  readonly savedPickupCount: number;
  readonly carlitos: CarlitosSnapshot | null;
  readonly pendingEventId: string | null;
  readonly pendingEventTargetId: ItemInstanceId | null;
  readonly nextDawnEnergyOverride: DawnEnergy | null;
  readonly lastEventId: string | null;
  readonly lastSeenDays: Readonly<Record<string, number>>;
  readonly appearanceCounts: Readonly<Record<string, number>>;
  readonly lastOutcome: ActionOutcome | null;
  readonly lastHealthCause: DeathCause;
  readonly lastHullEventId: string | null;
  readonly pendingJournalDaytime: JournalDaytimeRecord | null;
  readonly pendingJournalNighttime: JournalNightRecord | null;
  readonly pendingJournalActions: readonly JournalDayActionRecord[];
  readonly journalEntries: readonly JournalEntry[];
  readonly fishingCounter: number;
  readonly seed: number;
  readonly randomState: number;
}

export interface SurvivalRunCheckpoint {
  readonly scavengeElapsedSeconds: number;
  readonly session: SurvivalSessionCheckpoint;
}

export function createSurvivalSessionCheckpoint(
  checkpoint: SurvivalSessionCheckpoint,
): SurvivalSessionCheckpoint {
  return Object.freeze({
    ...checkpoint,
    history: Object.freeze(checkpoint.history.map((reading) => Object.freeze({ ...reading }))),
    chest: Object.freeze({ ...checkpoint.chest }),
    inventory: cloneInventory(checkpoint.inventory),
    savedItems: Object.freeze(checkpoint.savedItems.map((item) => Object.freeze({ ...item }))),
    carlitos: checkpoint.carlitos === null ? null : Object.freeze({ ...checkpoint.carlitos }),
    lastSeenDays: cloneRecord(checkpoint.lastSeenDays),
    appearanceCounts: cloneRecord(checkpoint.appearanceCounts),
    lastOutcome: checkpoint.lastOutcome === null ? null : cloneOutcome(checkpoint.lastOutcome),
    lastHealthCause: Object.freeze({ ...checkpoint.lastHealthCause }),
    pendingJournalDaytime: cloneDaytime(checkpoint.pendingJournalDaytime),
    pendingJournalNighttime: checkpoint.pendingJournalNighttime === null
      ? null
      : cloneJournalNight(checkpoint.pendingJournalNighttime),
    pendingJournalActions: cloneJournalActions(checkpoint.pendingJournalActions),
    journalEntries: Object.freeze(checkpoint.journalEntries.map(cloneJournalEntry)),
  });
}

function cloneInventory(snapshot: SurvivalInventorySnapshot): SurvivalInventorySnapshot {
  return Object.freeze(Object.fromEntries(Object.entries(snapshot).map(([instanceId, item]) => [
    instanceId,
    item === undefined ? undefined : Object.freeze({ ...item }),
  ])));
}

function cloneRecord(record: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  return Object.freeze({ ...record });
}

function cloneOutcome(outcome: ActionOutcome): ActionOutcome {
  return Object.freeze(cloneActionOutcome(outcome));
}

function cloneDaytime(record: JournalDaytimeRecord | null): JournalDaytimeRecord | null {
  if (record === null) return null;
  if ('kind' in record) return createJournalSinkingShipRecord();
  const night = createJournalNightEventRecord(record);
  return night.kind === 'event' ? night.event : createJournalSinkingShipRecord();
}

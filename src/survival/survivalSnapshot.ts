import type { ItemInstance, ItemInstanceId } from '../game/ItemState';
import type { EndingRecord } from '../game/ending';
import type { SurvivalReading } from '../game/runStatistics';
import type { CarlitosSnapshot } from './CarlitosState';
import type { JournalEntry } from './journalRecords';
import type {
  ActionOutcome,
  ChestSnapshot,
  SurvivalInventorySnapshot,
  SurvivalState,
  WeatherId,
} from './survivalTypes';

export interface SurvivalSnapshot {
  state: SurvivalState;
  readonly ending: EndingRecord | null;
  readonly history: readonly SurvivalReading[];
  day: number;
  pressure: number;
  health: number;
  hunger: number;
  energy: number;
  hull: number;
  food: number;
  bait: number;
  recoveredFood: number;
  recoveredBait: number;
  rescueLead: number;
  readonly rescueTraceFinds: number;
  radioSignalAvailable: boolean;
  radioSignalsSent: number;
  readonly chest: ChestSnapshot;
  weather: WeatherId;
  actedToday: boolean;
  readonly journalEntries: readonly JournalEntry[];
  inventory: SurvivalInventorySnapshot;
  savedItems: readonly ItemInstance[];
  readonly carlitos: Readonly<CarlitosSnapshot> | null;
  pendingEventId: string | null;
  readonly pendingEventTargetId: ItemInstanceId | null;
  lastOutcome: ActionOutcome | null;
  seed: number;
}

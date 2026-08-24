import type { ItemInstance, ItemInstanceId } from '../game/ItemState';
import type { CarlitosSnapshot } from './CarlitosState';
import type { JournalEntry } from './journalRecords';
import type {
  ActionOutcome,
  ChestSnapshot,
  SurvivalEndingReason,
  SurvivalInventorySnapshot,
  SurvivalState,
  WeatherId,
} from './survivalTypes';

export interface SurvivalSnapshot {
  state: SurvivalState;
  readonly endingReason: SurvivalEndingReason;
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
  repairMaterial: number;
  rescueProgress: number;
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

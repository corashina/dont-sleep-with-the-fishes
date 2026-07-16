import type { ItemId, ItemInstance, ItemInstanceId } from '../game/ItemState';
import type { JournalEntry } from './journal';

export type SurvivalState = 'day' | 'dayEvent' | 'nightEvent' | 'rescued' | 'dead' | 'sunk';
export type WeatherId = 'calm' | 'overcast' | 'squall';
export type DayActionId =
  | 'fish' | 'dive' | 'eat' | 'repair' | 'repairItem'
  | 'treat' | 'rest' | 'sendMessage' | 'useEnergyBar' | 'endDay';
export type DayActionOption =
  | { readonly kind: 'fishing'; readonly useBait: boolean }
  | { readonly kind: 'hullRepair'; readonly material: 'repairMaterial' | 'ductTape' }
  | { readonly kind: 'itemRepair'; readonly target: ItemInstanceId };
export type RiskLabel = 'safe' | 'uncertain' | 'dangerous';
export type PresentationCue =
  | 'none' | 'fish' | 'dive' | 'repair' | 'treat' | 'rest'
  | 'storm' | 'impact' | 'darkness' | 'sighting' | 'nightfall' | 'dawn'
  | 'rescue' | 'death' | 'sinking';

export type ItemCondition = 'usable' | 'broken' | 'consumed' | 'lost';

export interface SurvivalItemState extends ItemInstance {
  readonly condition: ItemCondition;
}

export type SurvivalInventorySnapshot = Readonly<
  Partial<Record<ItemInstanceId, Readonly<SurvivalItemState>>>
>;

export interface ResourceDelta {
  health?: number;
  hunger?: number;
  energy?: number;
  hull?: number;
  food?: number;
  bait?: number;
  repairMaterial?: number;
  rescueProgress?: number;
}

export interface ActionOutcome {
  accepted: boolean;
  code: string;
  message: string;
  deltas: Readonly<ResourceDelta>;
  cue: PresentationCue;
}

export interface EventResponse {
  itemId: ItemId;
  message: string;
  deltas: Readonly<ResourceDelta>;
  cue: PresentationCue;
  consume: boolean;
  rescue?: boolean;
}

export interface SurvivalEventDefinition {
  id: string;
  phase: 'day' | 'night';
  title: string;
  prompt: string;
  danger: RiskLabel;
  earliestDay: number;
  latestDay?: number;
  weight: number;
  cooldownDays: number;
  weather?: readonly WeatherId[];
  responses: readonly EventResponse[];
  unsuitable: Omit<EventResponse, 'itemId' | 'consume'>;
  endure: Omit<EventResponse, 'itemId' | 'consume'>;
  cue: PresentationCue;
}

export interface SurvivalSnapshot {
  state: SurvivalState;
  day: number;
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
  weather: WeatherId;
  restedToday: boolean;
  actedToday: boolean;
  readonly journalEntries: readonly JournalEntry[];
  inventory: SurvivalInventorySnapshot;
  savedItems: readonly ItemInstance[];
  pendingEventId: string | null;
  lastOutcome: ActionOutcome | null;
  seed: number;
}

export interface RandomSource { next(): number; }

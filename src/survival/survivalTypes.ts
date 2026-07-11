import type { ItemId } from '../game/ItemState';

export type SurvivalState = 'day' | 'dayEvent' | 'nightEvent' | 'rescued' | 'dead' | 'sunk';
export type WeatherId = 'calm' | 'overcast' | 'squall';
export type DayActionId = 'fish' | 'dive' | 'eat' | 'repair' | 'treat' | 'rest' | 'endDay';
export type RiskLabel = 'safe' | 'uncertain' | 'dangerous';
export type PresentationCue =
  | 'none' | 'fish' | 'dive' | 'repair' | 'treat' | 'rest'
  | 'storm' | 'impact' | 'darkness' | 'sighting' | 'rescue' | 'death' | 'sinking';

export interface ItemInventoryState {
  owned: boolean;
  charges: number | null;
  durable: boolean;
}

export type SurvivalInventory = Record<ItemId, ItemInventoryState>;

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
  repairMaterial: number;
  rescueProgress: number;
  weather: WeatherId;
  restedToday: boolean;
  actedToday: boolean;
  inventory: Readonly<SurvivalInventory>;
  pendingEventId: string | null;
  lastOutcome: ActionOutcome | null;
  seed: number;
}

export interface RandomSource { next(): number; }

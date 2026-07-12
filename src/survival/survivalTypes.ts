import type { ItemId, ItemInstance, ItemInstanceId } from '../game/ItemState';
import type { IntegerValue } from '../canonical/types';

export type SurvivalState = 'day' | 'dayEvent' | 'nightEvent' | 'rescued' | 'dead' | 'sunk';
export type WeatherId = 'calm' | 'overcast' | 'squall';
export type DayActionId = 'fish' | 'dive' | 'eat' | 'repair' | 'treat' | 'rest' | 'endDay';
export type RiskLabel = 'safe' | 'uncertain' | 'dangerous';
export type PresentationCue =
  | 'none' | 'fish' | 'dive' | 'repair' | 'treat' | 'rest'
  | 'storm' | 'impact' | 'darkness' | 'sighting' | 'nightfall' | 'dawn'
  | 'rescue' | 'death' | 'sinking';

export type ItemCondition = 'usable' | 'broken' | 'consumed' | 'lost';

export interface SurvivalItemInstance extends ItemInstance {
  condition: ItemCondition;
  charges: number | null;
}

export interface ItemInventoryState {
  owned: boolean;
  charges: number | null;
  durable: boolean;
  instances: SurvivalItemInstance[];
}

export type SurvivalInventory = Record<ItemId, ItemInventoryState>;

export type InventoryMutation = {
  kind: 'consume' | 'break' | 'repair' | 'lose' | 'gain';
  itemId: ItemId;
  quantity: number;
  instanceId?: ItemInstanceId;
};

export type EventInventoryMutation = InventoryMutation
  | { kind: 'loseRandom'; quantity: number }
  | { kind: 'breakRandom'; quantity: number }
  | { kind: 'loseEventTarget'; quantity: number };

export type EventRoute = 'left' | 'right';
export type EventResource = 'health' | 'hull' | 'energy' | 'food' | 'bait' | 'danger';
export type EventAssetRequirement =
  | { kind: 'item'; itemId: ItemId }
  | { kind: 'resource'; resource: EventResource; min: number };

export interface ResourceEffect {
  resource: EventResource;
  operation: 'add' | 'subtract' | 'set';
  value: IntegerValue;
}

export interface WeightedEventOutcome {
  weight: number;
  message: string;
  effects: {
    resources?: readonly ResourceEffect[];
    items?: readonly EventInventoryMutation[];
    route?: EventRoute;
    terminal?: 'sunk';
  };
}

export interface EventChoiceDefinition {
  id: string;
  label: string;
  itemId?: ItemId | 'any';
  outcomes: readonly [WeightedEventOutcome, ...WeightedEventOutcome[]];
  trade?: { receive: ItemId; fallbackFood: 1 };
}

interface CanonicalEventBase {
  id: string;
  phase: 'day' | 'night';
  title: string;
  prompt: string;
  cue: PresentationCue;
  weight: number;
  minDay: number;
  maxDay?: number;
  cooldownDays: number;
  maxAppearances: number;
  dangerMin: number;
  selectable?: boolean;
  requiredItems?: readonly ItemId[];
  requiredAnyItems?: readonly ItemId[];
  requiredAnyAssets?: readonly EventAssetRequirement[];
  forbiddenItems?: readonly ItemId[];
  routeWeightBonuses?: Partial<Record<EventRoute, number>>;
}

export interface ChoiceEventDefinition extends CanonicalEventBase {
  automatic?: false;
  choices: readonly [EventChoiceDefinition, ...EventChoiceDefinition[]];
  automaticOutcome?: never;
}

export interface AutomaticEventDefinition extends CanonicalEventBase {
  automatic: true;
  choices?: never;
  automaticOutcome: WeightedEventOutcome;
}

export type CanonicalEventDefinition = ChoiceEventDefinition | AutomaticEventDefinition;

export interface EventHistory {
  appearances: number;
  firstDay: number;
  lastDay: number;
}

export type ResolvedEventResources = Partial<Record<EventResource, number>>;

export interface ResolvedEventOutcome {
  message: string;
  resourceDeltas: ResolvedEventResources;
  resourceSets: ResolvedEventResources;
  itemMutations: readonly EventInventoryMutation[];
  route?: EventRoute;
  terminal?: 'sunk';
}

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
  inventory: Readonly<SurvivalInventory>;
  savedItems: readonly ItemInstance[];
  pendingEventId: string | null;
  lastOutcome: ActionOutcome | null;
  seed: number;
}

export interface RandomSource { next(): number; }

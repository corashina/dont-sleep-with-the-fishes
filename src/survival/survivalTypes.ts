import type { ItemId, ItemInstance, ItemInstanceId } from '../game/ItemState';
import type { FishingSession } from './FishingSession';
import type { JournalEntry } from './journal';

export type SurvivalState = 'day' | 'dayEvent' | 'nightEvent' | 'rescued' | 'dead' | 'sunk';
export type WeatherId = 'calm' | 'overcast' | 'squall';
export type DayActionId =
  | 'fish' | 'dive' | 'eat' | 'repair' | 'repairItem'
  | 'treat' | 'sendMessage' | 'useEnergyBar' | 'endDay';
export type DayActionOption =
  | { readonly kind: 'hullRepair'; readonly material: 'repairMaterial' | 'ductTape' }
  | { readonly kind: 'itemRepair'; readonly target: ItemInstanceId };
export type RiskLabel = 'safe' | 'uncertain' | 'dangerous';
export type PresentationCue =
  | 'none' | 'fish' | 'dive' | 'repair' | 'treat'
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

export type BeginFishingResult =
  | {
      readonly accepted: true;
      readonly outcome: ActionOutcome;
      readonly attempt: FishingSession;
    }
  | {
      readonly accepted: false;
      readonly outcome: ActionOutcome;
    };

export interface EventResponse {
  itemId: ItemId;
  message: string;
  deltas: Readonly<ResourceDelta>;
  cue: PresentationCue;
  consume: boolean;
  rescue?: boolean;
}

export type EventResource =
  | 'health' | 'hull' | 'energy' | 'food' | 'bait' | 'rescueProgress';
export type IntegerValue = number | { readonly min: number; readonly max: number };
export interface ResourceEffect {
  readonly resource: EventResource;
  readonly operation: 'add' | 'subtract' | 'set';
  readonly value: IntegerValue;
}
export type EventInventoryMutation =
  | {
    readonly kind: 'consume' | 'break' | 'lose';
    readonly itemId: ItemId;
    readonly quantity: number;
  }
  | { readonly kind: 'breakRandom' | 'loseRandom'; readonly quantity: number }
  | { readonly kind: 'loseEventTarget'; readonly quantity: 1 };
export interface WeightedEventOutcome {
  readonly weight: number;
  readonly message: string;
  readonly effects: {
    readonly resources?: readonly ResourceEffect[];
    readonly items?: readonly EventInventoryMutation[];
    readonly rescue?: boolean;
  };
}
export interface EventChoiceDefinition {
  readonly id: string;
  readonly label: string;
  readonly itemId?: ItemId;
  readonly outcomes: readonly [WeightedEventOutcome, ...WeightedEventOutcome[]];
}

export type EventResponseId = string;

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
  targetItemIds?: readonly ItemId[];
  choices: readonly [EventChoiceDefinition, ...EventChoiceDefinition[]];
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
  actedToday: boolean;
  readonly journalEntries: readonly JournalEntry[];
  inventory: SurvivalInventorySnapshot;
  savedItems: readonly ItemInstance[];
  pendingEventId: string | null;
  lastOutcome: ActionOutcome | null;
  seed: number;
}

export interface RandomSource { next(): number; }

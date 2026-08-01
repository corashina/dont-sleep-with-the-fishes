import type { ItemId, ItemInstance, ItemInstanceId } from '../game/ItemState';
import type { FishingSession } from './FishingSession';
import type { JournalEntry } from './journal';

export type SurvivalState = 'day' | 'dayEvent' | 'nightEvent' | 'rescued' | 'dead' | 'sunk';
/** Gameplay weather remains separate from renderer-only presentation weather. */
export type WeatherId = 'calm' | 'overcast' | 'squall';
export type DayActionId =
  | 'fish' | 'dive' | 'eat' | 'repair' | 'repairItem'
  | 'treat' | 'sendMessage' | 'useEnergyBar' | 'openChest' | 'endDay';
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
  pressure?: number;
  health?: number;
  hunger?: number;
  energy?: number;
  hull?: number;
  food?: number;
  bait?: number;
  repairMaterial?: number;
  rescueProgress?: number;
}

export type DriftingLootVariant = 'barrel' | 'crate';

export type EventPresentationKey =
  | 'drifting-loot.food'
  | 'drifting-loot.bait'
  | 'drifting-loot.repair'
  | 'drifting-loot.energy-bar'
  | 'drifting-loot.drift'
  | 'drifting-bottle.retrieve'
  | 'drifting-bottle.lost'
  | 'check-the-back.fish'
  | 'check-the-back.empty'
  | 'check-the-back.face'
  | 'check-the-back.ignore'
  | 'mystery-chest.safe'
  | 'mystery-chest.mimic'
  | 'mystery-chest.leave'
  | 'flowers.collect'
  | 'flowers.drift';

export type RewardSummary =
  | {
      readonly kind: 'resource';
      readonly id: 'food' | 'bait' | 'repairMaterial';
      readonly quantity: number;
    }
  | {
      readonly kind: 'item';
      readonly id: ItemId;
      readonly quantity: 1;
    };

export interface ActionOutcome {
  accepted: boolean;
  code: string;
  message: string;
  deltas: Readonly<ResourceDelta>;
  cue: PresentationCue;
  readonly rewardSummary?: RewardSummary;
  readonly eventResult?: EventResultPresentation;
  readonly eventPresentationKey?: EventPresentationKey;
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

export type EventResource =
  | 'pressure' | 'health' | 'hull' | 'energy'
  | 'food' | 'bait' | 'repairMaterial' | 'rescueProgress';
export type ChestState = 'none' | 'closed' | 'mimic';
export interface ChestSnapshot {
  readonly state: ChestState;
  readonly acquiredDay: number | null;
}
export type ChestEventEffect = 'acquire' | 'close' | 'destroy';
export interface EventFlagEffects {
  readonly set?: readonly string[];
  readonly clear?: readonly string[];
}
export type IntegerValue = number | { readonly min: number; readonly max: number };
export interface ResourceEffect {
  readonly resource: EventResource;
  readonly operation: 'add' | 'subtract' | 'set';
  readonly value: IntegerValue;
}
export type EventInventoryMutation =
  | { readonly kind: 'consume' | 'break' | 'lose'; readonly itemId: ItemId; readonly quantity: number }
  | { readonly kind: 'gain'; readonly itemId: ItemId; readonly quantity: 1; readonly fallbackFood: 1 }
  | { readonly kind: 'gainChest'; readonly quantity: 1; readonly fallbackFood: 1 }
  | { readonly kind: 'breakRandom' | 'loseRandom'; readonly quantity: number }
  | { readonly kind: 'loseEventTarget'; readonly quantity: 1 };
export interface EventEffects {
  readonly resources?: readonly ResourceEffect[];
  readonly items?: readonly EventInventoryMutation[];
  readonly chest?: ChestEventEffect;
  readonly flags?: EventFlagEffects;
  readonly rescue?: boolean;
}
export interface WeightedEventOutcome {
  readonly resultId?: string;
  readonly weight: number;
  readonly message: string;
  readonly presentationKey?: EventPresentationKey;
  readonly minimumPriorAppearances?: number;
  readonly effects: EventEffects;
}
export interface EventChoiceDefinition {
  readonly id: string;
  readonly label: string;
  readonly itemId?: ItemId;
  readonly requirements?: readonly EventChoiceRequirement[];
  readonly requiredChestState?: ChestState;
  readonly outcomes: readonly [WeightedEventOutcome, ...WeightedEventOutcome[]];
}

export interface EventChoiceRequirement {
  readonly resource: EventResource;
  readonly minimum: number;
}

export type EventResponseId = string;
export interface EventResultPresentation {
  readonly eventId: string;
  readonly choiceId: EventResponseId;
  readonly resultId: string;
}
export type EventResponse =
  | {
      readonly kind: 'item';
      readonly choiceId: EventResponseId;
      readonly instanceId: ItemInstanceId;
    }
  | { readonly kind: 'choice'; readonly choiceId: EventResponseId }
  | { readonly kind: 'endure' };

export interface SurvivalEventDefinition {
  id: string;
  phase: 'day' | 'night';
  title: string;
  revealText: string;
  prompt: string;
  danger: RiskLabel;
  earliestDay: number;
  latestDay?: number;
  weight: number;
  cooldownDays: number;
  maximumAppearances?: number;
  absentItemIds?: readonly ItemId[];
  minimumRescueProgress?: number;
  minimumPressure?: number;
  maximumPressure?: number;
  requiredFlags?: readonly string[];
  forbiddenFlags?: readonly string[];
  allowedChestStates?: readonly ChestState[];
  weather?: readonly WeatherId[];
  targetItemIds?: readonly ItemId[];
  choices: readonly [EventChoiceDefinition, ...EventChoiceDefinition[]];
  cue: PresentationCue;
}

export interface SurvivalSnapshot {
  state: SurvivalState;
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
  readonly eventFlags: readonly string[];
  weather: WeatherId;
  actedToday: boolean;
  readonly journalEntries: readonly JournalEntry[];
  inventory: SurvivalInventorySnapshot;
  savedItems: readonly ItemInstance[];
  pendingEventId: string | null;
  readonly pendingEventTargetId: ItemInstanceId | null;
  readonly pendingDriftingLootVariant: DriftingLootVariant | null;
  lastOutcome: ActionOutcome | null;
  seed: number;
}

export interface RandomSource { next(): number; }

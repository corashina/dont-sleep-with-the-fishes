import type { ItemInstanceId } from '../game/ItemState';
import type {
  ActionOutcome,
  ItemCondition,
  ResourceDelta,
} from './survivalTypes';

export const DEDICATED_EVENT_IDS = [
  'leak',
  'school-of-fish',
  'snatcher',
  'death-stare',
  'swarm-of-anglerfish',
  'whirlpool',
] as const;

export type DedicatedEventId = typeof DEDICATED_EVENT_IDS[number];

export interface EventSceneContext {
  readonly eventId: DedicatedEventId;
  readonly targetInstanceId: ItemInstanceId | null;
  readonly variantSeed: number;
}

export interface EventOutcomePresentation {
  readonly outcome: ActionOutcome;
  readonly resourceDeltas: Readonly<ResourceDelta>;
  readonly brokenInstanceIds: readonly ItemInstanceId[];
  readonly lostInstanceIds: readonly ItemInstanceId[];
  readonly consumedInstanceIds: readonly ItemInstanceId[];
  readonly selectedInstanceId: ItemInstanceId | null;
  readonly selectedCondition: ItemCondition | null;
  readonly targetInstanceId: ItemInstanceId | null;
}

import type {
  Group,
  Object3D,
  PerspectiveCamera,
} from 'three';
import type { ItemInstanceId } from '../game/ItemState';
import type { WaveComponent } from '../ocean/WaveField';
import type { PropModelLibrary } from '../world/PropModelLibrary';
import type { BoatSupplyDisplay } from './BoatSupplyDisplay';
import type { ChestDisplay } from './ChestDisplay';
import type { FocusedEventId } from './eventPresentationRoutes';
import type {
  ActionOutcome,
  EventResultPresentation,
  ItemCondition,
} from './survivalTypes';

export interface EventChoicePresentation {
  readonly choiceId: string;
  readonly instanceId: ItemInstanceId | null;
  readonly condition: ItemCondition | null;
}

export interface FocusedEventInteractionTarget {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly choiceId: string;
  readonly root: Object3D;
  readonly tooltip?: boolean;
  readonly minimumHitWidth?: number;
  readonly minimumHitHeight?: number;
}

export interface FocusedEventPresentation {
  readonly root: Group;
  itemAimTarget?(): Object3D | null;
  stage(variantSeed?: number): void;
  reveal(): Promise<void>;
  playChoice(choice: EventChoicePresentation): Promise<void>;
  react(
    result: EventResultPresentation,
    outcome: ActionOutcome,
  ): Promise<void>;
  clear(): void;
  update(time: number, delta: number): void;
  settleForVisibilityChange(): void;
  interactionTargets?(): readonly FocusedEventInteractionTarget[];
  dispose(): void;
}

export interface FocusedEventPresentationDependencies {
  readonly propModels: PropModelLibrary;
  readonly waves: readonly WaveComponent[];
  readonly cameraRig: Group;
  readonly camera: PerspectiveCamera;
  readonly boatMotionRoot?: Group;
  readonly supplyDisplay: BoatSupplyDisplay;
  readonly chestDisplay: ChestDisplay;
}

export type FocusedEventPresentationFactory = (
  dependencies: FocusedEventPresentationDependencies,
) => FocusedEventPresentation | null;

export type FocusedEventPresentationFactories = Partial<Readonly<Record<
  FocusedEventId,
  FocusedEventPresentationFactory
>>>;

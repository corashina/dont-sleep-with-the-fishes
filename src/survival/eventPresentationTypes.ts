import type { Group, Object3D, PerspectiveCamera } from 'three';
import type { ItemInstanceId } from '../game/ItemState';
import type { WaveSample, VortexWaveState } from '../ocean/WaveField';
import type { BoatSupplyDisplay } from './BoatSupplyDisplay';
import type { CarlitosPresentation } from './CarlitosPresentation';
import type { DivePresentationController } from './DivePresentationController';
import type { EventModelLibrary } from './EventModelLibrary';
import type { EventPhysicalResponsePresentation } from './EventPhysicalResponse';
import type {
  EventChoicePresentation,
  FocusedEventInteractionTarget,
} from './FocusedEventPresentation';
import type { SurvivalEventModels } from './SurvivalEventModelLibrary';
import type { SurvivalEventId } from './eventCatalog';
import type { DedicatedEventId } from './eventPresentationRoutes';
import type {
  ActionOutcome,
  ItemCondition,
  ResourceDelta,
} from './survivalTypes';

export interface EventSceneContext {
  readonly eventId: DedicatedEventId;
  readonly targetInstanceId: ItemInstanceId | null;
  readonly variantSeed: number;
}

export interface EventPresentationContext {
  readonly eventId: SurvivalEventId;
  readonly targetInstanceId: ItemInstanceId | null;
  readonly variantSeed: number;
}

export interface EventOutcomePresentation {
  readonly outcome: ActionOutcome;
  readonly resourceDeltas: Readonly<ResourceDelta>;
  readonly gainedInstanceIds: readonly ItemInstanceId[];
  readonly brokenInstanceIds: readonly ItemInstanceId[];
  readonly lostInstanceIds: readonly ItemInstanceId[];
  readonly consumedInstanceIds: readonly ItemInstanceId[];
  readonly selectedInstanceId: ItemInstanceId | null;
  readonly selectedCondition: ItemCondition | null;
  readonly targetInstanceId: ItemInstanceId | null;
}

export interface EventPresentationReaction {
  readonly outcome: ActionOutcome;
  readonly physicalResponse: EventPhysicalResponsePresentation;
  readonly result: EventOutcomePresentation | null;
  readonly choice: EventChoicePresentation | null;
}

export type WorldWaveSampler = (
  output: WaveSample,
  time: number,
  x: number,
  z: number,
  amplitudeScale: number,
) => void;

export interface UnderwaterViewEnvironment {
  readonly enter: () => void;
  readonly exit: () => void;
}

export interface DedicatedEventEnvironment {
  readonly eventModels: EventModelLibrary;
  readonly featuredModels: SurvivalEventModels;
  readonly dive: Pick<
    DivePresentationController,
    'play' | 'clear' | 'settleForVisibilityChange'
  >;
  readonly delegateCarlitos: (retrieve: () => Promise<void>) => Promise<void>;
  readonly supplies: BoatSupplyDisplay;
  readonly carlitos: CarlitosPresentation;
  readonly vortexWave: VortexWaveState;
  readonly sampleWorldWaveInto: WorldWaveSampler;
  readonly readWorldWaveAmplitudeScale: () => number;
  readonly underwaterView: UnderwaterViewEnvironment;
  readonly cameraEffectsRoot?: Group;
  readonly camera?: PerspectiveCamera;
  readonly boatEffectsRoot?: Group;
}

export interface DedicatedEventPresentation {
  readonly eventId: DedicatedEventId;
  readonly worldRoot: Group;
  readonly boatRoot: Group;
  readonly itemAimTarget: Object3D;
  interactionTargets?(): readonly FocusedEventInteractionTarget[];
  interactionRoot?(id: string): Object3D | null;
  stage(context: EventSceneContext): void;
  reveal(): Promise<void>;
  skip(): void;
  playChoice?(choiceId: string): Promise<void>;
  playItemUse(
    choiceId: string,
    instanceId: ItemInstanceId,
    onAction?: (cueIndex: number) => void,
  ): Promise<boolean>;
  react(result: EventOutcomePresentation): Promise<void>;
  update(time: number, delta: number): void;
  settleForVisibilityChange(): void;
  clear(): void;
  dispose(): void;
}

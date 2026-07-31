import type { Group } from 'three';
import type { ItemInstanceId } from '../game/ItemState';
import type { WaveSample, VortexWaveState } from '../ocean/WaveField';
import type { BoatSupplyDisplay } from './BoatSupplyDisplay';
import type { EventModelLibrary } from './EventModelLibrary';
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

export type WorldWaveSampler = (
  output: WaveSample,
  time: number,
  x: number,
  z: number,
  amplitudeScale: number,
) => void;

export interface DedicatedEventEnvironment {
  readonly eventModels: EventModelLibrary;
  readonly supplies: BoatSupplyDisplay;
  readonly vortexWave: VortexWaveState;
  readonly sampleWorldWaveInto: WorldWaveSampler;
  readonly cameraEffectsRoot?: Group;
  readonly boatEffectsRoot?: Group;
}

export interface DedicatedEventPresentation {
  readonly eventId: DedicatedEventId;
  readonly worldRoot: Group;
  readonly boatRoot: Group;
  stage(context: EventSceneContext): void;
  reveal(): Promise<void>;
  playItemUse(choiceId: string, instanceId: ItemInstanceId): Promise<boolean>;
  react(result: EventOutcomePresentation): Promise<void>;
  update(time: number, delta: number): void;
  settleForVisibilityChange(): void;
  clear(): void;
  dispose(): void;
}

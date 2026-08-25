import {
  type Group,
  type PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';
import type { ItemInstanceId } from '../game/ItemState';
import type { WaveSample } from '../ocean/WaveField';
import { ignoreCleanupError, runCleanupSteps } from '../world/SceneResources';
import type { BoatSupplyDisplay } from './BoatSupplyDisplay';
import {
  DivePresentation,
  type DivePlayOptions,
} from './DivePresentation';
import type { WorldWaveSampler } from './eventPresentationTypes';

export type { DivePlayOptions } from './DivePresentation';

const DIVE_STARBOARD_POSITION = new Vector3(1.66, 0.76, -1.2);
const DIVE_LEFT_TURN = new Quaternion().setFromAxisAngle(
  new Vector3(0, 1, 0),
  Math.PI / 2,
);

export interface DivePresentationControllerEnvironment {
  readonly camera: PerspectiveCamera;
  readonly cameraControl: {
    copyBaseQuaternion(output: Quaternion): Quaternion;
  };
  readonly supplies: Pick<BoatSupplyDisplay, 'setPresentationItemHidden'>;
  readonly sampleWorldWaveInto: WorldWaveSampler;
  readonly readWorldWaveAmplitudeScale: () => number;
  readonly goggleModel: Group;
}

export class DivePresentationController {
  private readonly starboardQuaternion = new Quaternion();
  private readonly waveSample: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };
  private readonly waterEntryWorldPosition = new Vector3();
  private readonly presentation: DivePresentation;
  private activeItemId: ItemInstanceId | null = null;
  private elapsed = 0;
  private disposed = false;

  constructor(private readonly environment: DivePresentationControllerEnvironment) {
    environment.cameraControl.copyBaseQuaternion(this.starboardQuaternion)
      .multiply(DIVE_LEFT_TURN);
    this.presentation = new DivePresentation({
      camera: environment.camera,
      starboardPosition: DIVE_STARBOARD_POSITION,
      starboardQuaternion: this.starboardQuaternion,
      goggleModel: environment.goggleModel,
    });
  }

  play(instanceId: ItemInstanceId, options: DivePlayOptions): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.clear();
    this.activeItemId = instanceId;
    this.elapsed = 0;
    try {
      this.environment.supplies.setPresentationItemHidden(instanceId, true);
      return this.presentation.start(options);
    } catch (error) {
      ignoreCleanupError(() => this.clear());
      throw error;
    }
  }

  clear(): void {
    if (this.disposed) return;
    const itemId = this.activeItemId;
    this.activeItemId = null;
    this.elapsed = 0;
    runCleanupSteps([
      () => this.presentation.clear(),
      () => {
        if (itemId !== null) {
          this.environment.supplies.setPresentationItemHidden(itemId, false);
        }
      },
    ]);
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    const itemId = this.activeItemId;
    this.activeItemId = null;
    this.elapsed = 0;
    runCleanupSteps([
      () => this.presentation.settleForVisibilityChange(),
      () => {
        if (itemId !== null) {
          this.environment.supplies.setPresentationItemHidden(itemId, false);
        }
      },
    ]);
  }

  update(time: number, delta: number): void {
    if (this.disposed || this.activeItemId === null) return;
    if (Number.isFinite(delta) && delta > 0) this.elapsed += delta;
    this.presentation.copyWaterEntryWorldPosition(this.waterEntryWorldPosition);
    this.environment.sampleWorldWaveInto(
      this.waveSample,
      time,
      this.waterEntryWorldPosition.x,
      this.waterEntryWorldPosition.z,
      this.environment.readWorldWaveAmplitudeScale(),
    );
    this.presentation.update(this.elapsed, delta, this.waveSample.height);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const itemId = this.activeItemId;
    this.activeItemId = null;
    this.elapsed = 0;
    runCleanupSteps([
      () => this.presentation.clear(),
      () => {
        if (itemId !== null) {
          this.environment.supplies.setPresentationItemHidden(itemId, false);
        }
      },
      () => this.presentation.dispose(),
    ]);
  }
}

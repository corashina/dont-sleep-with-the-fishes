import { Box3, Group, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { createWaveSample, DEFAULT_WAVES, sampleWaveFieldInto } from '../ocean/WaveField';

export const RESCUE_ENDING_DURATION = 9;
const FADE_START = 7.5;

function smooth(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

/** Owns the approach and head turn. The caller owns the model resources. */
export class RescueEndingPresentation {
  readonly finished: Promise<void>;
  private resolve!: () => void;
  private elapsed = 0;
  private settled = false;
  private readonly startQuaternion = new Quaternion();
  private readonly targetQuaternion = new Quaternion();
  private readonly parentQuaternion = new Quaternion();
  private readonly lookMatrix = new Matrix4();
  private readonly cameraPosition = new Vector3();
  private readonly target = new Vector3();
  private readonly wave = createWaveSample();
  private readonly waterlineOffset: number;

  constructor(
    readonly boat: Group,
    private readonly camera: PerspectiveCamera,
    private readonly onFade: (opacity: number) => void,
  ) {
    boat.name = 'rescue-boat';
    this.waterlineOffset = -new Box3().setFromObject(boat).min.y - 0.55;
    this.startQuaternion.copy(camera.quaternion);
    this.finished = new Promise((resolve) => { this.resolve = resolve; });
    this.update(0, 0, 1);
  }

  update(delta: number, time: number, waveScale: number): void {
    this.elapsed = Math.min(RESCUE_ENDING_DURATION, this.elapsed + delta);
    const travel = Math.min(1, this.elapsed / 6.7);
    const approach = 1 - (1 - travel) ** 2;
    this.boat.position.set(24 - 13 * approach, 0, -4.8 + 2.8 * approach);
    sampleWaveFieldInto(this.wave, DEFAULT_WAVES, time,
      this.boat.position.x, this.boat.position.z, waveScale);
    this.boat.position.y = this.waterlineOffset + this.wave.height * 0.6;
    this.boat.rotation.set(
      Math.sin(time * 0.8) * 0.018 * waveScale,
      -Math.PI / 2 + 0.2 + smooth((this.elapsed - 4) / 2.7) * 0.65,
      Math.sin(time * 0.65 + 1.2) * 0.025 * waveScale,
    );

    this.camera.getWorldPosition(this.cameraPosition);
    this.target.copy(this.boat.position);
    this.target.y -= 0.6;
    this.lookMatrix.lookAt(this.cameraPosition, this.target, this.camera.up);
    this.targetQuaternion.setFromRotationMatrix(this.lookMatrix);
    if (this.camera.parent !== null) {
      this.camera.parent.getWorldQuaternion(this.parentQuaternion).invert();
      this.targetQuaternion.premultiply(this.parentQuaternion);
    }
    this.camera.quaternion.copy(this.startQuaternion)
      .slerp(this.targetQuaternion, smooth((this.elapsed - 0.6) / 1.6));
    if (!this.settled) {
      this.onFade(smooth((this.elapsed - FADE_START) / (RESCUE_ENDING_DURATION - FADE_START)));
      if (this.elapsed >= RESCUE_ENDING_DURATION) {
        this.settled = true;
        this.resolve();
      }
    }
  }

  dispose(): void {
    this.settled = true;
    this.boat.removeFromParent();
    this.resolve();
  }
}

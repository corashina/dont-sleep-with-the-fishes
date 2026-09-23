import { Box3, type Matrix4, type Object3D, Vector3 } from 'three';
import { DEFAULT_WAVES } from '../ocean/WaveField';
import { presentationWeatherProfile } from '../weather/presentationWeather';
import { smoothstep } from './animationMath';
import type { EventItemUseSample } from './eventItemUseChoreography';

const WIND_WAVE_CREST = DEFAULT_WAVES.reduce((height, wave) => height + wave.amplitude, 0)
  * presentationWeatherProfile('wind').waveScale;

/** Keeps the released umbrella on a level world path, clear of every wind wave. */
export class UmbrellaWindFlight {
  private readonly origin = new Vector3();
  private readonly heldView = new Vector3();
  private readonly right = new Vector3();
  private readonly backward = new Vector3();
  private readonly bounds = new Box3();
  private lift = 0;
  private active = false;

  apply(
    position: Vector3,
    sample: Readonly<EventItemUseSample>,
    cameraMatrix: Matrix4,
    actor: Object3D,
  ): void {
    if (!this.active) this.capture(sample, cameraMatrix, actor);
    const x = sample.viewX - this.heldView.x;
    const z = sample.viewZ - this.heldView.z;
    position.copy(this.origin)
      .addScaledVector(this.right, x)
      .addScaledVector(this.backward, z);
    // Gain clearance near the hand before drifting beyond the boat.
    position.y += sample.viewY - this.heldView.y
      + this.lift * smoothstep(Math.hypot(x, z) / 0.45);
  }

  clear(): void {
    this.active = false;
  }

  private capture(sample: Readonly<EventItemUseSample>, cameraMatrix: Matrix4, actor: Object3D): void {
    actor.getWorldPosition(this.origin);
    this.heldView.set(sample.viewX, sample.viewY, sample.viewZ);
    this.right.setFromMatrixColumn(cameraMatrix, 0);
    this.right.y = 0;
    this.right.normalize();
    this.backward.set(-this.right.z, 0, this.right.x);
    this.bounds.setFromObject(actor);
    const { min, max } = this.bounds;
    // Enclose all rotations around the root, including an offset canopy and handle.
    const radius = Math.hypot(
      Math.max(Math.abs(min.x - this.origin.x), Math.abs(max.x - this.origin.x)),
      Math.max(Math.abs(min.y - this.origin.y), Math.abs(max.y - this.origin.y)),
      Math.max(Math.abs(min.z - this.origin.z), Math.abs(max.z - this.origin.z)),
    );
    this.lift = Math.max(0, WIND_WAVE_CREST + radius + 0.2 - this.origin.y);
    this.active = true;
  }
}

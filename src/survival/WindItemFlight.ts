import { Box3, Euler, type Matrix4, type Object3D, Quaternion, Vector3 } from 'three';
import { DEFAULT_WAVES } from '../ocean/WaveField';
import { presentationWeatherProfile } from '../weather/presentationWeather';
import { smoothstep } from './animationMath';
import type { EventItemUseSample } from './eventItemUseChoreography';

const WIND_WAVE_CREST = DEFAULT_WAVES.reduce((height, wave) => height + wave.amplitude, 0)
  * presentationWeatherProfile('wind').waveScale;

/** Keeps the released item on a level world path, clear of every wind wave. */
export class WindItemFlight {
  private readonly origin = new Vector3();
  private readonly heldView = new Vector3();
  private readonly right = new Vector3();
  private readonly backward = new Vector3();
  private readonly bounds = new Box3();
  private readonly heldAngles = new Vector3();
  private readonly heldRotation = new Quaternion();
  private readonly rotation = new Quaternion();
  private readonly parentRotation = new Quaternion();
  private readonly turn = new Euler(0, 0, 0, 'YXZ');
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

  applyRotation(actor: Object3D, sample: Readonly<EventItemUseSample>): void {
    this.turn.set(
      sample.pitch - this.heldAngles.x,
      sample.yaw - this.heldAngles.y,
      sample.roll - this.heldAngles.z,
    );
    this.rotation.setFromEuler(this.turn).premultiply(this.heldRotation);
    if (actor.parent !== null) {
      actor.parent.getWorldQuaternion(this.parentRotation).invert();
      this.rotation.premultiply(this.parentRotation);
    }
    actor.quaternion.copy(this.rotation);
  }

  private capture(sample: Readonly<EventItemUseSample>, cameraMatrix: Matrix4, actor: Object3D): void {
    actor.getWorldPosition(this.origin);
    actor.getWorldQuaternion(this.heldRotation);
    this.heldAngles.set(sample.pitch, sample.yaw, sample.roll);
    this.heldView.set(sample.viewX, sample.viewY, sample.viewZ);
    this.right.setFromMatrixColumn(cameraMatrix, 0);
    this.right.y = 0;
    this.right.normalize();
    this.backward.set(-this.right.z, 0, this.right.x);
    this.bounds.setFromObject(actor);
    const { min, max } = this.bounds;
    // Enclose all rotations around the root, including offset parts.
    const radius = Math.hypot(
      Math.max(Math.abs(min.x - this.origin.x), Math.abs(max.x - this.origin.x)),
      Math.max(Math.abs(min.y - this.origin.y), Math.abs(max.y - this.origin.y)),
      Math.max(Math.abs(min.z - this.origin.z), Math.abs(max.z - this.origin.z)),
    );
    this.lift = Math.max(0, WIND_WAVE_CREST + radius + 0.2 - this.origin.y);
    this.active = true;
  }
}

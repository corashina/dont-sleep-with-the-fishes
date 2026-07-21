import {
  BufferAttribute,
  BufferGeometry,
  Points,
  PointsMaterial,
} from 'three';

export interface BoatDepositSmokeSnapshot {
  active: boolean;
  age: number;
  opacity: number;
  maximumRise: number;
}

const PARTICLE_COUNT = 10;
const LIFETIME = 0.8;
const START_OPACITY = 0.72;
const START_SIZE = 0.34;
const END_SIZE = 0.82;

export class BoatDepositSmoke {
  readonly points: Points<BufferGeometry, PointsMaterial>;

  private readonly initialPositions = new Float32Array(PARTICLE_COUNT * 3);
  private readonly positions = new Float32Array(PARTICLE_COUNT * 3);
  private readonly velocities = new Float32Array(PARTICLE_COUNT * 3);
  private age = 0;
  private active = false;
  private disposed = false;

  constructor() {
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      const offset = index * 3;
      const angle = index * 2.399963229728653;
      const radius = 0.08 + (index % 4) * 0.025;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      this.initialPositions[offset] = x;
      this.initialPositions[offset + 1] = (index % 3) * 0.018;
      this.initialPositions[offset + 2] = z;
      this.velocities[offset] = x * 1.2;
      this.velocities[offset + 1] = 0.5 + (index % 5) * 0.08;
      this.velocities[offset + 2] = z * 1.2;
    }
    this.positions.set(this.initialPositions);

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    const material = new PointsMaterial({
      color: 0xd8d1c3,
      depthWrite: false,
      opacity: 0,
      size: START_SIZE,
      sizeAttenuation: true,
      transparent: true,
    });
    this.points = new Points(geometry, material);
    this.points.name = 'lifeboat-deposit-smoke';
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  trigger(): void {
    if (this.disposed) return;
    this.age = 0;
    this.active = true;
    this.positions.set(this.initialPositions);
    this.points.material.opacity = START_OPACITY;
    this.points.material.size = START_SIZE;
    this.points.visible = true;
    this.points.geometry.getAttribute('position').needsUpdate = true;
  }

  update(delta: number, reducedMotion: boolean): void {
    if (!this.active || this.disposed) return;
    const step = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.1)) : 0;
    this.age = Math.min(LIFETIME, this.age + step);
    if (this.age >= LIFETIME) {
      this.active = false;
      this.positions.set(this.initialPositions);
      this.points.material.opacity = 0;
      this.points.visible = false;
      this.points.geometry.getAttribute('position').needsUpdate = true;
      return;
    }

    const motionTime = reducedMotion ? 0 : this.age;
    for (let index = 0; index < this.positions.length; index += 1) {
      this.positions[index] = this.initialPositions[index]! + this.velocities[index]! * motionTime;
    }
    const progress = this.age / LIFETIME;
    this.points.material.opacity = START_OPACITY * (1 - progress);
    this.points.material.size = START_SIZE + (END_SIZE - START_SIZE) * progress;
    this.points.geometry.getAttribute('position').needsUpdate = true;
  }

  snapshotForTest(): BoatDepositSmokeSnapshot {
    let maximumRise = 0;
    if (this.active) {
      for (let index = 1; index < this.positions.length; index += 3) {
        maximumRise = Math.max(
          maximumRise,
          this.positions[index]! - this.initialPositions[index]!,
        );
      }
    }
    return {
      active: this.active,
      age: this.age,
      opacity: this.points.material.opacity,
      maximumRise,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}

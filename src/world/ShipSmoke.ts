import {
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';

export interface ShipSmokeSnapshot {
  capacity: number;
  activeCount: number;
  maximumDrift: number;
}

const POOL_SIZE = 48;
const REGULAR_SPAWN_BASE = 0.26;
const SINKING_SPAWN_REDUCTION = 0.14;

export class ShipSmoke {
  readonly points: Points<BufferGeometry, ShaderMaterial>;

  private readonly outlets: readonly [Vector3, Vector3];
  private readonly random: () => number;
  private readonly positions = new Float32Array(POOL_SIZE * 3);
  private readonly opacities = new Float32Array(POOL_SIZE);
  private readonly sizes = new Float32Array(POOL_SIZE);
  private readonly ages = new Float32Array(POOL_SIZE);
  private readonly lifetimes = new Float32Array(POOL_SIZE);
  private readonly velocities = new Float32Array(POOL_SIZE * 3);
  private readonly active = new Uint8Array(POOL_SIZE);
  private readonly sources = new Uint8Array(POOL_SIZE);
  private spawnAccumulator = 0;
  private nextSource = 0;
  private disposed = false;

  constructor(outlets: readonly [Vector3, Vector3], random: () => number = Math.random) {
    this.outlets = [outlets[0].clone(), outlets[1].clone()];
    this.random = random;

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('aOpacity', new BufferAttribute(this.opacities, 1));
    geometry.setAttribute('aSize', new BufferAttribute(this.sizes, 1));

    const material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float aOpacity;
        attribute float aSize;
        varying float vOpacity;

        void main() {
          vOpacity = aOpacity;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (180.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying float vOpacity;

        void main() {
          float distanceFromCenter = length(gl_PointCoord - vec2(0.5)) * 2.0;
          if (distanceFromCenter > 1.0) discard;
          float edge = 1.0 - smoothstep(0.62, 1.0, distanceFromCenter);
          float aOpacity = vOpacity;
          gl_FragColor = vec4(vec3(0.20, 0.21, 0.22), aOpacity * edge);
        }
      `,
    });

    this.points = new Points(geometry, material);
    this.points.name = 'ship-smoke';
    this.points.frustumCulled = false;
  }

  update(delta: number, sinkingProgress: number, reducedMotion: boolean): void {
    const step = Math.max(0, Math.min(delta, 0.1));
    const progress = Math.max(0, Math.min(sinkingProgress, 1));

    this.updateActivePuffs(step, progress);

    const spawnInterval = (REGULAR_SPAWN_BASE - progress * SINKING_SPAWN_REDUCTION)
      * (reducedMotion ? 1.9 : 1);
    this.spawnAccumulator += step;
    while (this.spawnAccumulator >= spawnInterval) {
      this.spawnAccumulator -= spawnInterval;
      this.spawn(progress, reducedMotion);
    }

    this.points.geometry.getAttribute('position').needsUpdate = true;
    this.points.geometry.getAttribute('aOpacity').needsUpdate = true;
    this.points.geometry.getAttribute('aSize').needsUpdate = true;
  }

  snapshotForTest(): ShipSmokeSnapshot {
    let activeCount = 0;
    let maximumDrift = 0;

    for (let index = 0; index < POOL_SIZE; index += 1) {
      if (this.active[index] === 0) continue;
      activeCount += 1;
      const positionOffset = index * 3;
      const sourceIndex = this.sources[index]!;
      const source = this.outlets[sourceIndex]!;
      const driftX = this.positions[positionOffset]! - source.x;
      const driftZ = this.positions[positionOffset + 2]! - source.z;
      maximumDrift = Math.max(maximumDrift, Math.hypot(driftX, driftZ));
    }

    return { capacity: POOL_SIZE, activeCount, maximumDrift };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.points.geometry.dispose();
    this.points.material.dispose();
  }

  private updateActivePuffs(delta: number, sinkingProgress: number): void {
    for (let index = 0; index < POOL_SIZE; index += 1) {
      if (this.active[index] === 0) continue;

      this.ages[index] = this.ages[index]! + delta;
      if (this.ages[index]! >= this.lifetimes[index]!) {
        this.active[index] = 0;
        this.opacities[index] = 0;
        this.sizes[index] = 0;
        continue;
      }

      const positionOffset = index * 3;
      this.positions[positionOffset] = this.positions[positionOffset]! + this.velocities[positionOffset]! * delta;
      this.positions[positionOffset + 1] = this.positions[positionOffset + 1]! + this.velocities[positionOffset + 1]! * delta;
      this.positions[positionOffset + 2] = this.positions[positionOffset + 2]! + this.velocities[positionOffset + 2]! * delta;

      const normalizedAge = this.ages[index]! / this.lifetimes[index]!;
      this.sizes[index] = 0.65 + (1.8 - 0.65) * normalizedAge;
      this.opacities[index] = (0.62 + sinkingProgress * 0.16) * (1 - normalizedAge);
    }
  }

  private spawn(sinkingProgress: number, reducedMotion: boolean): void {
    const index = this.active.indexOf(0);
    if (index === -1) return;

    const sourceIndex = this.nextSource;
    this.nextSource = (this.nextSource + 1) % this.outlets.length;
    const source = this.outlets[sourceIndex]!;
    const positionOffset = index * 3;
    const horizontalScale = reducedMotion ? 0.3 : 1;

    this.active[index] = 1;
    this.sources[index] = sourceIndex;
    this.ages[index] = 0;
    this.lifetimes[index] = (2.2 + this.random() * 1.1) * (reducedMotion ? 0.85 : 1);
    this.positions[positionOffset] = source.x;
    this.positions[positionOffset + 1] = source.y;
    this.positions[positionOffset + 2] = source.z;
    this.velocities[positionOffset] = (0.18 + this.random() * 0.12) * horizontalScale;
    this.velocities[positionOffset + 1] = 0.85 + this.random() * 0.35;
    this.velocities[positionOffset + 2] = (-0.08 + this.random() * 0.08) * horizontalScale;
    this.opacities[index] = 0.62 + sinkingProgress * 0.16;
    this.sizes[index] = 0.65;
  }
}

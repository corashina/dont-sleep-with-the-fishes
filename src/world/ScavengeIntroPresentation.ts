import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  TetrahedronGeometry,
} from 'three';

const LIFETIME_SECONDS = 1.5;
const MAX_STEP_SECONDS = 0.1;
const START_DUST_OPACITY = 0.62;

const FRAGMENT_STARTS = [
  [-0.42, 0.04, -0.18], [-0.28, 0.08, 0.16],
  [-0.12, 0.02, -0.1], [0.08, 0.1, 0.2],
  [0.2, 0.06, -0.22], [0.34, 0.03, 0.08],
  [0.46, 0.09, -0.06], [0.02, 0.05, 0.34],
] as const;

const FRAGMENT_VELOCITIES = [
  [-0.45, 1.3, -0.25], [-0.3, 1.55, 0.2],
  [-0.1, 1.15, -0.35], [0.1, 1.65, 0.28],
  [0.25, 1.4, -0.3], [0.38, 1.2, 0.12],
  [0.52, 1.5, -0.08], [0.04, 1.35, 0.42],
] as const;

const DUST_STARTS = [
  [-0.34, 0.06, -0.12], [-0.22, 0.08, 0.08], [-0.1, 0.05, -0.04],
  [0.02, 0.07, 0.16], [0.15, 0.04, -0.15], [0.27, 0.06, 0.04],
  [0.38, 0.05, -0.06], [-0.04, 0.1, 0.27], [0.12, 0.08, 0.29],
  [-0.26, 0.04, 0.24], [0.31, 0.09, 0.19], [-0.39, 0.07, -0.25],
] as const;

const DUST_VELOCITIES = [
  [-0.25, 0.8, -0.12], [-0.18, 0.92, 0.09], [-0.06, 0.72, -0.08],
  [0.02, 0.88, 0.18], [0.12, 0.76, -0.16], [0.2, 0.82, 0.06],
  [0.27, 0.74, -0.04], [-0.03, 0.95, 0.25], [0.09, 0.86, 0.29],
  [-0.16, 0.7, 0.2], [0.22, 0.9, 0.17], [-0.28, 0.79, -0.18],
] as const;

export class ScavengeIntroPresentation {
  readonly root = new Group();

  private readonly fragmentGeometry = new TetrahedronGeometry(0.1, 0);
  private readonly fragmentMaterial = new MeshStandardMaterial({
    color: 0x5b3b2b,
    flatShading: true,
    roughness: 0.9,
  });
  private readonly fragments: Mesh<TetrahedronGeometry, MeshStandardMaterial>[] = [];
  private readonly dustPositions = new Float32Array(DUST_STARTS.length * 3);
  private readonly dustGeometry = new BufferGeometry();
  private readonly dustMaterial = new PointsMaterial({
    color: 0xb5a48b,
    depthWrite: false,
    opacity: 0,
    size: 0.18,
    sizeAttenuation: true,
    transparent: true,
  });
  private readonly dust: Points<BufferGeometry, PointsMaterial>;
  private age = 0;
  private active = false;
  private disposed = false;

  constructor() {
    this.root.name = 'scavenge-intro-crash';
    this.root.visible = false;
    for (let index = 0; index < FRAGMENT_STARTS.length; index += 1) {
      const fragment = new Mesh(this.fragmentGeometry, this.fragmentMaterial);
      fragment.castShadow = true;
      fragment.receiveShadow = true;
      this.fragments.push(fragment);
      this.root.add(fragment);
    }
    this.resetObjects();
    this.dustGeometry.setAttribute('position', new BufferAttribute(this.dustPositions, 3));
    this.dust = new Points(this.dustGeometry, this.dustMaterial);
    this.dust.frustumCulled = false;
    this.root.add(this.dust);
  }

  trigger(): void {
    if (this.disposed) return;
    this.active = true;
    this.age = 0;
    this.resetObjects();
    this.dustMaterial.opacity = START_DUST_OPACITY;
    this.root.visible = true;
  }

  update(deltaSeconds: number): void {
    if (!this.active || this.disposed) return;
    let remaining = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    while (remaining > 0 && this.active) {
      const step = Math.min(remaining, MAX_STEP_SECONDS);
      this.age = Math.min(LIFETIME_SECONDS, this.age + step);
      remaining -= step;
      if (this.age >= LIFETIME_SECONDS) {
        this.active = false;
        this.resetObjects();
        this.dustMaterial.opacity = 0;
        this.root.visible = false;
        return;
      }
    }
    this.updateObjects();
  }

  snapshotForTest(): { active: boolean; age: number; debrisCount: number } {
    return { active: this.active, age: this.age, debrisCount: this.fragments.length };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.fragmentGeometry.dispose();
    this.fragmentMaterial.dispose();
    this.dustGeometry.dispose();
    this.dustMaterial.dispose();
  }

  private resetObjects(): void {
    for (let index = 0; index < this.fragments.length; index += 1) {
      const start = FRAGMENT_STARTS[index]!;
      const fragment = this.fragments[index]!;
      fragment.position.set(start[0], start[1], start[2]);
      fragment.scale.setScalar(1);
    }
    for (let index = 0; index < DUST_STARTS.length; index += 1) {
      const offset = index * 3;
      const start = DUST_STARTS[index]!;
      this.dustPositions[offset] = start[0];
      this.dustPositions[offset + 1] = start[1];
      this.dustPositions[offset + 2] = start[2];
    }
    const attribute = this.dustGeometry.getAttribute('position');
    if (attribute !== undefined) attribute.needsUpdate = true;
  }

  private updateObjects(): void {
    const progress = this.age / LIFETIME_SECONDS;
    const scale = 1 - 0.65 * progress;
    const gravityOffset = 4.9 * this.age * this.age;
    for (let index = 0; index < this.fragments.length; index += 1) {
      const start = FRAGMENT_STARTS[index]!;
      const velocity = FRAGMENT_VELOCITIES[index]!;
      const fragment = this.fragments[index]!;
      fragment.position.set(
        start[0] + velocity[0] * this.age,
        start[1] + velocity[1] * this.age - gravityOffset,
        start[2] + velocity[2] * this.age,
      );
      fragment.scale.setScalar(scale);
    }
    for (let index = 0; index < DUST_STARTS.length; index += 1) {
      const offset = index * 3;
      const start = DUST_STARTS[index]!;
      const velocity = DUST_VELOCITIES[index]!;
      this.dustPositions[offset] = start[0] + velocity[0] * this.age;
      this.dustPositions[offset + 1] = start[1] + velocity[1] * this.age;
      this.dustPositions[offset + 2] = start[2] + velocity[2] * this.age;
    }
    this.dustMaterial.opacity = START_DUST_OPACITY * (1 - progress);
    this.dustGeometry.getAttribute('position').needsUpdate = true;
  }
}

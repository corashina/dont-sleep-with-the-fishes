import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  Points,
  PointsMaterial,
  TetrahedronGeometry,
} from 'three';

const LIFETIME_SECONDS = 2.2;
const FLASH_DURATION_SECONDS = 0.42;
const CORE_DURATION_SECONDS = 0.28;
const MAX_STEP_SECONDS = 0.1;
const START_SMOKE_OPACITY = 0.72;
const START_LIGHT_INTENSITY = 18;

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

  private readonly blastGeometry = new IcosahedronGeometry(0.65, 1);
  private readonly blastShellMaterial = new MeshBasicMaterial({
    blending: AdditiveBlending,
    color: 0xff7a27,
    depthWrite: false,
    opacity: 0,
    toneMapped: false,
    transparent: true,
  });
  private readonly blastCoreMaterial = new MeshBasicMaterial({
    blending: AdditiveBlending,
    color: 0xffd58a,
    depthWrite: false,
    opacity: 0,
    toneMapped: false,
    transparent: true,
  });
  private readonly blastShell = new Mesh(this.blastGeometry, this.blastShellMaterial);
  private readonly blastCore = new Mesh(this.blastGeometry, this.blastCoreMaterial);
  private readonly blastLight = new PointLight(0xff8a35, 0, 10, 1.8);
  private readonly fragmentGeometry = new TetrahedronGeometry(0.1, 0);
  private readonly fragmentMaterial = new MeshStandardMaterial({
    color: 0x5b3b2b,
    emissive: 0x241007,
    emissiveIntensity: 0.55,
    flatShading: true,
    roughness: 0.9,
  });
  private readonly fragments: Mesh<TetrahedronGeometry, MeshStandardMaterial>[] = [];
  private readonly dustPositions = new Float32Array(DUST_STARTS.length * 3);
  private readonly dustGeometry = new BufferGeometry();
  private readonly dustMaterial = new PointsMaterial({
    color: 0x51473f,
    depthWrite: false,
    opacity: 0,
    size: 0.28,
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
    this.blastShell.name = 'scavenge-intro-blast-shell';
    this.blastCore.name = 'scavenge-intro-blast-core';
    this.blastLight.name = 'scavenge-intro-blast-light';
    this.blastShell.rotation.set(0.18, 0.35, -0.12);
    this.blastCore.rotation.set(-0.2, -0.15, 0.24);
    this.root.add(this.blastShell, this.blastCore, this.blastLight);
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
    this.dust.name = 'scavenge-intro-smoke';
    this.dust.frustumCulled = false;
    this.root.add(this.dust);
  }

  trigger(): void {
    if (this.disposed) return;
    this.active = true;
    this.age = 0;
    this.resetObjects();
    this.blastShellMaterial.opacity = 0.8;
    this.blastCoreMaterial.opacity = 0.96;
    this.blastLight.intensity = START_LIGHT_INTENSITY;
    this.dustMaterial.opacity = START_SMOKE_OPACITY;
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
        this.root.visible = false;
        return;
      }
    }
    this.updateObjects();
  }

  snapshotForTest(): {
    active: boolean;
    age: number;
    debrisCount: number;
    flashOpacity: number;
    smokeCount: number;
  } {
    return {
      active: this.active,
      age: this.age,
      debrisCount: this.fragments.length,
      flashOpacity: this.blastShellMaterial.opacity,
      smokeCount: DUST_STARTS.length,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.blastGeometry.dispose();
    this.blastShellMaterial.dispose();
    this.blastCoreMaterial.dispose();
    this.fragmentGeometry.dispose();
    this.fragmentMaterial.dispose();
    this.dustGeometry.dispose();
    this.dustMaterial.dispose();
  }

  private resetObjects(): void {
    this.blastShell.scale.setScalar(0.01);
    this.blastCore.scale.setScalar(0.01);
    this.blastShellMaterial.opacity = 0;
    this.blastCoreMaterial.opacity = 0;
    this.blastLight.intensity = 0;
    this.dustMaterial.opacity = 0;
    this.dustMaterial.size = 0.28;
    for (let index = 0; index < this.fragments.length; index += 1) {
      const start = FRAGMENT_STARTS[index]!;
      const fragment = this.fragments[index]!;
      fragment.position.set(start[0], start[1], start[2]);
      fragment.rotation.set(index * 0.31, index * -0.19, index * 0.23);
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
    const flashProgress = Math.min(1, this.age / FLASH_DURATION_SECONDS);
    const coreProgress = Math.min(1, this.age / CORE_DURATION_SECONDS);
    const flashEnvelope = (1 - flashProgress) * (1 - flashProgress);
    const coreEnvelope = (1 - coreProgress) * (1 - coreProgress);
    const expansion = 1 - (1 - flashProgress) ** 3;
    this.blastShell.scale.setScalar(0.22 + expansion * 2.05);
    this.blastCore.scale.setScalar(0.16 + expansion * 0.88);
    this.blastShell.rotation.y = 0.35 + this.age * 1.7;
    this.blastCore.rotation.y = -0.15 - this.age * 2.1;
    this.blastShellMaterial.opacity = 0.8 * flashEnvelope;
    this.blastCoreMaterial.opacity = 0.96 * coreEnvelope;
    this.blastLight.intensity = START_LIGHT_INTENSITY * flashEnvelope;
    for (let index = 0; index < this.fragments.length; index += 1) {
      const start = FRAGMENT_STARTS[index]!;
      const velocity = FRAGMENT_VELOCITIES[index]!;
      const fragment = this.fragments[index]!;
      fragment.position.set(
        start[0] + velocity[0] * this.age,
        start[1] + velocity[1] * this.age - gravityOffset,
        start[2] + velocity[2] * this.age,
      );
      fragment.rotation.x = index * 0.31
        + (index % 2 === 0 ? 1 : -1) * this.age * 1.4;
      fragment.rotation.y = index * -0.19 + this.age * 0.9;
      fragment.rotation.z = index * 0.23 + (index % 3 - 1) * this.age * 1.1;
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
    this.dustMaterial.opacity = START_SMOKE_OPACITY * (1 - progress) ** 1.4;
    this.dustMaterial.size = 0.28 + progress * 0.42;
    this.dustGeometry.getAttribute('position').needsUpdate = true;
  }
}

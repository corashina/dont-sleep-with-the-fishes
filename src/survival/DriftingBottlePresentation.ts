import {
  BufferGeometry,
  CylinderGeometry,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three';
import {
  DEFAULT_WAVES,
  sampleWaveFieldInto,
  type WaveSample,
} from '../ocean/WaveField';
import { disposeResourceSets, runCleanupSteps } from '../world/SceneResources';
import { FishingBiteParticles } from './FishingBiteParticles';
import { KeyedEventPresentation } from './KeyedEventPresentation';
import { eventSideFromSeed, type EventSide } from './eventVariant';

const BASE = Object.freeze({ x: 3.25, y: 0.34, z: -4.35 });
const PARTICLE_INTERVAL_SECONDS = 0.18;

export class DriftingBottlePresentation extends KeyedEventPresentation {
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly particles = new FishingBiteParticles();
  private readonly particleOrigin = new Vector3();
  private readonly paper: Mesh;
  private readonly target = new Vector3();
  private readonly wave: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };
  private side: EventSide = -1;
  private particleCooldown = 0;

  constructor(model: Object3D, private readonly deckTarget: Object3D) {
    super('drifting-bottle-presentation');
    this.subject.name = 'event-prop:drifting-bottle';
    this.subject.userData.motionSource = 'shared-wave-field';
    this.subject.add(model);
    const corkGeometry = new CylinderGeometry(0.045, 0.045, 0.1, 7);
    const paperGeometry = new CylinderGeometry(0.055, 0.055, 0.32, 7);
    const corkMaterial = new MeshStandardMaterial({
      color: 0x7b5b38,
      roughness: 0.96,
      flatShading: true,
    });
    const paperMaterial = new MeshStandardMaterial({
      color: 0xc4b58e,
      roughness: 0.98,
      flatShading: true,
    });
    this.geometries.add(corkGeometry);
    this.geometries.add(paperGeometry);
    this.materials.add(corkMaterial);
    this.materials.add(paperMaterial);
    const cork = new Mesh(corkGeometry, corkMaterial);
    cork.name = 'drifting-bottle:cork';
    cork.position.z = 0.38;
    cork.rotation.x = Math.PI / 2;
    this.paper = new Mesh(paperGeometry, paperMaterial);
    this.paper.name = 'drifting-bottle:paper';
    this.paper.rotation.x = Math.PI / 2;
    this.paper.visible = true;
    this.particles.points.name = 'drifting-bottle:bite-particles';
    this.particles.points.renderOrder = 3;
    this.subject.scale.setScalar(1.22);
    this.subject.add(cork, this.paper);
    this.root.add(this.particles.points);
  }

  stage(variantSeed = 0): void {
    this.side = eventSideFromSeed(variantSeed);
    this.particles.reset();
    this.particleCooldown = 0;
    super.stage();
  }

  update(time: number, delta: number): void {
    super.update(time, delta);
    this.particles.update(delta);
    if (!this.root.visible || this.settledKind !== 'staged') return;
    const dt = Math.min(0.1, Math.max(0, delta));
    this.particleCooldown = Math.max(0, this.particleCooldown - dt);
    if (this.particleCooldown > 0) return;
    this.particleOrigin.copy(this.subject.position);
    this.particleOrigin.y -= 0.18;
    this.particles.emit(this.particleOrigin, 0.34);
    this.particleCooldown = PARTICLE_INTERVAL_SECONDS;
  }

  clear(): void {
    super.clear();
    this.particles.reset();
    this.particleCooldown = 0;
  }

  protected reset(): void {
    const baseX = BASE.x * this.side;
    this.subject.position.set(baseX, BASE.y, BASE.z);
    this.subject.rotation.set(0.08, -0.18 * this.side, 0.06 * this.side);
    this.paper.visible = false;
  }

  protected applyIdle(time: number): void {
    if (this.settledKind === 'drifting-bottle.retrieve') {
      this.moveToDeck(1);
      this.paper.visible = true;
      return;
    }
    if (this.settledKind === 'drifting-bottle.lost') return;
    this.float(time, 0);
  }

  protected prepareAnimation(kind: string): void {
    if (kind === 'drifting-bottle.retrieve') this.paper.visible = true;
  }

  protected applyAnimation(kind: string, time: number, progress: number): void {
    if (kind === 'reveal') {
      const approach = (1 - progress) * -0.9;
      const knock = Math.sin(progress * Math.PI * 5) * (1 - progress) * 0.12;
      this.float(time, approach);
      this.subject.position.x += knock;
      this.subject.rotation.z += knock * 0.5;
      return;
    }
    if (kind === 'drifting-bottle.retrieve') {
      this.moveToDeck(progress * progress * (3 - 2 * progress));
      this.subject.rotation.z = 0.06 * this.side + progress * 0.38 * this.side;
      return;
    }
    if (kind === 'drifting-bottle.lost') {
      this.float(time, 0);
      this.subject.position.x += this.side * progress * 2.1;
      this.subject.position.z += progress * 1.5;
      this.subject.position.y -= progress * 0.3;
    }
  }

  protected finishAnimation(kind: string): void {
    if (kind === 'drifting-bottle.lost') this.root.visible = false;
  }

  protected disposeOwned(): void {
    runCleanupSteps([
      () => this.particles.dispose(),
      () => disposeResourceSets(this.geometries, this.materials),
    ]);
  }

  private float(time: number, zOffset: number): void {
    const baseX = BASE.x * this.side;
    sampleWaveFieldInto(this.wave, DEFAULT_WAVES, time, baseX, BASE.z + zOffset, 1);
    this.subject.position.set(
      baseX + this.wave.displacementX * 0.12,
      BASE.y + this.wave.height * 0.34,
      BASE.z + zOffset + this.wave.displacementZ * 0.12,
    );
    this.subject.rotation.set(
      0.08 + this.wave.normal.z * 0.16,
      -0.18 * this.side,
      0.06 * this.side - this.wave.normal.x * 0.18,
    );
  }

  private moveToDeck(progress: number): void {
    const baseX = BASE.x * this.side;
    this.deckTarget.getWorldPosition(this.target);
    this.root.worldToLocal(this.target);
    this.subject.position.set(
      baseX + (this.target.x - baseX) * progress,
      BASE.y + (this.target.y - BASE.y) * progress,
      BASE.z + (this.target.z - BASE.z) * progress,
    );
  }
}

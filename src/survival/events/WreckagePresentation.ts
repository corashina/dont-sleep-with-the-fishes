import {
  BoxGeometry,
  BufferGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
} from 'three';
import type { ItemInstanceId } from '../../game/ItemState';
import { disposeResourceSets, runCleanupSteps } from '../../world/SceneResources';
import type { EventModelInstance } from '../EventModelLibrary';
import type {
  DedicatedEventEnvironment,
  DedicatedEventPresentation,
  EventOutcomePresentation,
  EventSceneContext,
} from '../eventPresentationTypes';
import {
  createWreckageSample,
  sampleWreckageBeat,
  wreckageBeatDuration,
  type WreckageBeat,
  type WreckageSample,
} from './wreckageChoreography';

interface SurfaceDebrisPlacement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly scale: number;
}

interface ActiveWreckageBeat {
  readonly beat: WreckageBeat;
  elapsed: number;
  readonly resolve: () => void;
}

type WreckageResult = 'loot' | 'collapse' | 'creature' | 'ghost' | 'recovered' | null;

const SURFACE_DEBRIS: readonly SurfaceDebrisPlacement[] = Object.freeze([
  { x: -2.4, y: 0.08, z: -4.2, yaw: 0.36, scale: 0.9 },
  { x: 1.9, y: 0.02, z: -5.8, yaw: -0.52, scale: 0.72 },
  { x: -0.72, y: 0.14, z: -7.1, yaw: 0.94, scale: 0.58 },
  { x: 2.7, y: -0.04, z: -8.2, yaw: -0.21, scale: 0.48 },
]);

const SILT_INSTANCES = 14;

const REACTION_BEATS = Object.freeze({
  'wreckage.dive-loot': 'loot',
  'wreckage.dive-collapse': 'collapse',
  'wreckage.dive-creature': 'creature',
  'wreckage.dive-ghost': 'ghost',
} as const);

function isDiveReaction(beat: WreckageBeat): boolean {
  return beat === 'loot'
    || beat === 'collapse'
    || beat === 'creature'
    || beat === 'ghost';
}

function resultForBeat(beat: WreckageBeat): WreckageResult {
  if (beat === 'loot' || beat === 'collapse' || beat === 'creature' || beat === 'ghost') {
    return beat;
  }
  return null;
}

export class WreckagePresentation implements DedicatedEventPresentation {
  readonly eventId = 'wreckage' as const;
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();
  readonly itemAimTarget = new Object3D();

  private readonly sample: WreckageSample = createWreckageSample();
  private readonly scratchObject = new Object3D();
  private readonly scratchMatrix = new Matrix4();
  private readonly ship: EventModelInstance;
  private readonly anglerfish: Group;
  private readonly ghost: Group;
  private readonly barrel: Group;
  private readonly debris: InstancedMesh<BoxGeometry, MeshStandardMaterial>;
  private readonly silt: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly recoveredDebris: Group;
  private readonly redFlash: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly debrisMaterial = new MeshStandardMaterial({
    color: 0x5f4a37,
    emissive: 0x16100b,
    emissiveIntensity: 0.18,
    roughness: 0.94,
    metalness: 0.04,
    transparent: true,
    opacity: 0,
    flatShading: true,
  });
  private readonly siltMaterial = new MeshBasicMaterial({
    color: 0x9ab9ad,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: DoubleSide,
  });
  private readonly flashMaterial = new MeshBasicMaterial({
    color: 0xa51f16,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
  });
  private active: ActiveWreckageBeat | null = null;
  private result: WreckageResult = null;
  private surfaceSeed = 0;
  private staged = false;
  private diveCaptured = false;
  private diveCleared = false;
  private disposed = false;

  constructor(private readonly environment: DedicatedEventEnvironment) {
    this.worldRoot.name = 'wreckage-world';
    this.boatRoot.name = 'wreckage-boat';
    this.itemAimTarget.name = 'wreckage-item-aim-target';
    this.itemAimTarget.position.set(0, -2.35, -6.3);

    this.ownedMaterials.add(this.debrisMaterial);
    this.ownedMaterials.add(this.siltMaterial);
    this.ownedMaterials.add(this.flashMaterial);

    const debrisGeometry = new BoxGeometry(0.68, 0.14, 0.24, 1, 1, 1);
    this.ownedGeometries.add(debrisGeometry);
    this.debris = new InstancedMesh(debrisGeometry, this.debrisMaterial, SURFACE_DEBRIS.length);
    this.debris.name = 'wreckage-surface-debris';
    this.debris.count = SURFACE_DEBRIS.length;
    this.debris.renderOrder = 1;

    const siltGeometry = new PlaneGeometry(1, 1, 1, 1);
    this.ownedGeometries.add(siltGeometry);
    this.silt = new InstancedMesh(siltGeometry, this.siltMaterial, SILT_INSTANCES);
    this.silt.name = 'wreckage-silt';
    this.silt.count = SILT_INSTANCES;
    this.silt.renderOrder = 2;

    const flashGeometry = new PlaneGeometry(3.6, 2.1);
    this.ownedGeometries.add(flashGeometry);
    this.redFlash = new Mesh(flashGeometry, this.flashMaterial);
    this.redFlash.name = 'wreckage-search-injury-flash';
    this.redFlash.position.set(0, 1.1, -2.4);
    this.redFlash.renderOrder = 8;

    this.ship = environment.eventModels.create('containerShip');
    this.ship.root.name = 'wreckage-wreck';
    this.ship.root.position.set(0, -3.1, -8.5);
    this.ship.root.rotation.set(0.18, -0.42, -0.12);

    this.anglerfish = environment.featuredModels.clone('anglerFish');
    this.anglerfish.name = 'wreckage-creature';
    this.anglerfish.position.set(0.9, -3.5, -7.2);
    this.anglerfish.rotation.set(0.16, 0.68, -0.08);
    this.anglerfish.scale.setScalar(1.3);

    this.ghost = environment.eventModels.create('ghost');
    this.ghost.name = 'wreckage-ghost';
    this.ghost.position.set(-0.62, -2.4, -7.7);
    this.ghost.rotation.set(0, 0.34, 0.08);

    this.barrel = environment.featuredModels.clone('driftingBarrel');
    this.barrel.name = 'wreckage-loot';
    this.barrel.position.set(-0.82, -2.92, -6.75);
    this.barrel.rotation.set(0.28, -0.34, 0.46);
    this.barrel.scale.setScalar(0.82);

    this.recoveredDebris = new Group();
    this.recoveredDebris.name = 'wreckage-recovered-debris';
    const recoveredGeometry = new BoxGeometry(0.62, 0.1, 0.2, 1, 1, 1);
    const recoveredMaterial = new MeshStandardMaterial({
      color: 0x8d6744,
      emissive: 0x2a180b,
      emissiveIntensity: 0.22,
      roughness: 0.9,
      flatShading: true,
    });
    this.ownedGeometries.add(recoveredGeometry);
    this.ownedMaterials.add(recoveredMaterial);
    const timber = new Mesh(recoveredGeometry, recoveredMaterial);
    timber.name = 'wreckage-recovered-timber';
    timber.position.set(0.5, 0.12, 0);
    timber.rotation.set(0.1, 0.28, -0.16);
    this.recoveredDebris.add(timber);
    this.recoveredDebris.position.set(-0.56, 0.2, -3.4);

    this.worldRoot.add(
      this.debris,
      this.silt,
      this.ship.root,
      this.anglerfish,
      this.ghost,
      this.barrel,
      this.redFlash,
      this.itemAimTarget,
    );
    this.boatRoot.add(this.recoveredDebris);
    this.applySiltInstances(0);
    this.hideScene();
  }

  stage(context: EventSceneContext): void {
    if (this.disposed || context.eventId !== this.eventId) return;
    this.cancelActive();
    if (this.diveCaptured) this.clearDive();
    this.diveCaptured = false;
    this.diveCleared = false;
    this.staged = true;
    this.result = null;
    this.surfaceSeed = context.variantSeed;
    this.worldRoot.visible = true;
    this.boatRoot.visible = true;
    this.applySurfaceDebris(context.variantSeed, 0);
    sampleWreckageBeat('reveal', 0, this.sample);
    this.applySample();
  }

  reveal(): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    return this.startBeat('reveal');
  }

  skip(): void {
    this.settleForVisibilityChange();
  }

  playChoice(choiceId: string): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    if (choiceId === 'search') return this.startBeat('search');
    if (choiceId === 'delegate-carlitos') {
      return this.environment.delegateCarlitos(() => this.startBeat('search'));
    }
    if (choiceId === 'leave') return this.startBeat('leave');
    return Promise.resolve();
  }

  async playItemUse(choiceId: string, instanceId: ItemInstanceId): Promise<boolean> {
    if (this.disposed || !this.staged || choiceId !== 'dive') return false;
    this.diveCaptured = true;
    this.diveCleared = false;
    await this.environment.dive.play(instanceId, {
      onWaterImpact: () => undefined,
      revealUnderwaterScene: true,
    });
    if (this.disposed) return false;
    await this.startBeat('underwater-hold');
    return !this.disposed;
  }

  react(result: EventOutcomePresentation): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    const key = result.outcome.eventPresentationKey;
    const diveBeat = key === undefined ? undefined : REACTION_BEATS[key as keyof typeof REACTION_BEATS];
    if (diveBeat !== undefined) {
      this.result = resultForBeat(diveBeat);
      return this.startBeat(diveBeat);
    }
    if (key === 'wreckage.search-injury') {
      this.result = null;
      return this.startBeat('search');
    }
    if (
      key === 'wreckage.search-repair'
      || key === 'wreckage.search-food'
      || key === 'wreckage.search-bait'
    ) {
      this.result = 'recovered';
      return this.startBeat('search');
    }
    if (key === 'wreckage.carlitos-empty') {
      this.result = null;
      return this.startBeat('search');
    }
    if (key === 'wreckage.leave') return this.startBeat('leave');
    return Promise.resolve();
  }

  update(_time: number, delta: number): void {
    if (this.disposed || !this.staged) return;
    const active = this.active;
    if (active === null) return;
    const safeDelta = Number.isFinite(delta) && delta > 0 ? delta : 0;
    active.elapsed = Math.min(wreckageBeatDuration(active.beat), active.elapsed + safeDelta);
    sampleWreckageBeat(active.beat, active.elapsed, this.sample);
    this.applySample();
    if (active.elapsed >= wreckageBeatDuration(active.beat)) {
      this.completeActive(active);
    }
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    const active = this.active;
    if (active !== null) {
      active.elapsed = wreckageBeatDuration(active.beat);
      sampleWreckageBeat(active.beat, active.elapsed, this.sample);
      this.applySample();
      this.completeActive(active);
    }
    this.environment.dive.settleForVisibilityChange();
    this.diveCaptured = false;
  }

  clear(): void {
    if (this.disposed) return;
    this.cancelActive();
    this.clearDive();
    this.diveCaptured = false;
    this.staged = false;
    this.result = null;
    this.hideScene();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelActive();
    this.clearDive();
    this.diveCaptured = false;
    runCleanupSteps([
      () => this.hideScene(),
      () => this.boatRoot.clear(),
      () => this.worldRoot.clear(),
      () => this.boatRoot.removeFromParent(),
      () => this.worldRoot.removeFromParent(),
      () => this.ship.dispose(),
      () => disposeResourceSets(this.ownedGeometries, this.ownedMaterials),
    ]);
  }

  private startBeat(beat: WreckageBeat): Promise<void> {
    this.cancelActive();
    sampleWreckageBeat(beat, 0, this.sample);
    this.applySample();
    return new Promise((resolve) => {
      this.active = { beat, elapsed: 0, resolve };
    });
  }

  private completeActive(active: ActiveWreckageBeat): void {
    if (this.active !== active) return;
    this.active = null;
    if (isDiveReaction(active.beat)) {
      this.clearDive();
      void this.startBeat('return');
    }
    active.resolve();
  }

  private cancelActive(): void {
    const active = this.active;
    if (active === null) return;
    this.active = null;
    active.resolve();
  }

  private clearDive(): void {
    if (this.diveCleared) return;
    this.diveCleared = true;
    this.environment.dive.clear();
  }

  private applySurfaceDebris(seed: number, alpha: number): void {
    const seedOffset = Number.isFinite(seed) ? Math.trunc(seed) % 7 : 0;
    for (let index = 0; index < SURFACE_DEBRIS.length; index += 1) {
      const placement = SURFACE_DEBRIS[index]!;
      this.scratchObject.position.set(
        placement.x + ((seedOffset + index * 3) % 5 - 2) * 0.08,
        placement.y,
        placement.z,
      );
      this.scratchObject.rotation.set(0.08 * (index - 1), placement.yaw, 0.1 * (index % 2));
      this.scratchObject.scale.set(placement.scale, placement.scale, placement.scale);
      this.scratchObject.updateMatrix();
      this.scratchMatrix.copy(this.scratchObject.matrix);
      this.debris.setMatrixAt(index, this.scratchMatrix);
    }
    this.debris.instanceMatrix.needsUpdate = true;
    this.debrisMaterial.opacity = alpha;
  }

  private applySiltInstances(strength: number): void {
    for (let index = 0; index < SILT_INSTANCES; index += 1) {
      const ring = Math.floor(index / 5);
      const angle = index * 2.41;
      const spread = 0.52 + ring * 0.3 + strength * 0.34;
      this.scratchObject.position.set(
        Math.cos(angle) * spread,
        -3.05 + (index % 3) * 0.19,
        -7.6 + Math.sin(angle) * spread,
      );
      this.scratchObject.rotation.set(-Math.PI / 2, angle, 0);
      const scale = strength * (0.38 + (index % 4) * 0.11);
      this.scratchObject.scale.set(scale, scale, scale);
      this.scratchObject.updateMatrix();
      this.scratchMatrix.copy(this.scratchObject.matrix);
      this.silt.setMatrixAt(index, this.scratchMatrix);
    }
    this.silt.instanceMatrix.needsUpdate = true;
  }

  private applySample(): void {
    const sample = this.sample;
    this.applySurfaceDebris(this.surfaceSeed, sample.debrisAlpha);
    this.applySiltInstances(sample.silt);
    this.siltMaterial.opacity = Math.min(0.68, sample.silt * 0.68);
    this.flashMaterial.opacity = Math.min(0.42, sample.redFlash * 0.42);
    this.redFlash.visible = sample.redFlash > 0.008;

    this.ship.root.visible = sample.wreckAlpha > 0.008 || this.result !== null;
    this.barrel.visible = sample.lootGlow > 0.008 || this.result === 'loot';
    this.silt.visible = sample.silt > 0.008 || this.result === 'collapse';
    this.anglerfish.visible = sample.creatureAdvance > 0.008 || this.result === 'creature';
    this.ghost.visible = sample.ghostDrift > 0.008 || this.result === 'ghost';
    this.recoveredDebris.visible = this.result === 'recovered';

    const creatureAdvance = sample.creatureAdvance;
    this.anglerfish.position.z = -7.2 + creatureAdvance * 2.4;
    this.anglerfish.position.y = -3.5 + creatureAdvance * 0.34;
    this.anglerfish.rotation.z = -0.08 + creatureAdvance * 0.18;
    this.ghost.position.y = -2.4 + sample.ghostDrift * 0.7;
    this.ghost.position.x = -0.62 + sample.ghostDrift * 0.24;

    const cameraJolt = sample.cameraJolt + sample.redFlash * 0.24;
    const effects = this.environment.cameraEffectsRoot;
    if (effects !== undefined) {
      effects.rotation.set(cameraJolt * 0.025, 0, cameraJolt * -0.035);
    }

    if (sample.sceneAlpha <= 0.008 && this.active?.beat !== 'underwater-hold') {
      this.worldRoot.visible = false;
      this.boatRoot.visible = false;
    }
  }

  private hideScene(): void {
    this.worldRoot.visible = false;
    this.boatRoot.visible = false;
    this.ship.root.visible = false;
    this.anglerfish.visible = false;
    this.ghost.visible = false;
    this.barrel.visible = false;
    this.silt.visible = false;
    this.redFlash.visible = false;
    this.recoveredDebris.visible = false;
    this.debrisMaterial.opacity = 0;
    this.siltMaterial.opacity = 0;
    this.flashMaterial.opacity = 0;
    this.environment.cameraEffectsRoot?.rotation.set(0, 0, 0);
  }
}

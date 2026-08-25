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
  Texture,
} from 'three';
import type { ItemInstanceId } from '../../game/ItemState';
import { collectMaterialTextures } from '../../rendering/modelPresentation';
import {
  collectMeshResources,
  disposeResourceSets,
  ignoreCleanupError,
  runCleanupSteps,
} from '../../world/SceneResources';
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
  beat: WreckageBeat;
  elapsed: number;
  readonly resolve: () => void;
  nextBeat: WreckageBeat | null;
  readonly releaseDiveOnFinish: boolean;
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
  private readonly baseDebrisMatrices = SURFACE_DEBRIS.map(() => new Matrix4());
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
  private readonly ghostGeometries = new Set<BufferGeometry>();
  private readonly ghostMaterials = new Set<Material>();
  private readonly ghostTextures = new Set<Texture>();
  private readonly completeActiveSteps: readonly (() => void)[] = [
    () => this.restoreCompletedSearchDebris(),
    () => this.releaseCompletedDive(),
    () => this.resolveCompletedBeat(),
  ];
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
  private completingActive: ActiveWreckageBeat | null = null;
  private result: WreckageResult = null;
  private surfaceSeedOffset = 0;
  private selectedDebrisIndex = 0;
  private debrisMotionApplied = false;
  private staged = false;
  private operation = 0;
  private diveOwned = false;
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
    collectMeshResources(this.ghost, this.ghostGeometries, this.ghostMaterials);
    collectMaterialTextures(this.ghostMaterials, this.ghostTextures);
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
    this.beginOperation();
    this.cancelActive();
    this.releaseDive();
    this.staged = true;
    this.result = null;
    const seed = Number.isFinite(context.variantSeed) ? Math.trunc(context.variantSeed) : 0;
    this.surfaceSeedOffset = seed % 7;
    this.selectedDebrisIndex = ((seed % SURFACE_DEBRIS.length) + SURFACE_DEBRIS.length)
      % SURFACE_DEBRIS.length;
    this.debrisMotionApplied = false;
    this.worldRoot.visible = true;
    this.boatRoot.visible = true;
    this.cacheSurfaceDebris();
    sampleWreckageBeat('reveal', 0, this.sample);
    this.applySample();
  }

  reveal(): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    this.beginOperation();
    return this.startBeat('reveal');
  }

  skip(): void {
    this.settleForVisibilityChange();
  }

  playChoice(choiceId: string): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    const operation = this.beginOperation();
    if (choiceId === 'search') return this.startBeat('search');
    if (choiceId === 'delegate-carlitos') {
      return this.environment.delegateCarlitos(() => (
        this.ownsOperation(operation) ? this.startBeat('search') : Promise.resolve()
      ));
    }
    if (choiceId === 'leave') return this.startBeat('leave');
    return Promise.resolve();
  }

  async playItemUse(choiceId: string, instanceId: ItemInstanceId): Promise<boolean> {
    if (this.disposed || !this.staged || choiceId !== 'dive') return false;
    const operation = this.beginOperation();
    this.diveOwned = true;
    try {
      await this.environment.dive.play(instanceId, {
        onWaterImpact: () => undefined,
        revealUnderwaterScene: true,
      });
    } catch (error) {
      if (!this.ownsOperation(operation)) return false;
      ignoreCleanupError(() => this.releaseDive());
      throw error;
    }
    if (!this.ownsOperation(operation)) return false;
    await this.startBeat('underwater-hold');
    return this.ownsOperation(operation);
  }

  react(result: EventOutcomePresentation): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    this.beginOperation();
    const key = result.outcome.eventPresentationKey;
    const diveBeat = key === undefined ? undefined : REACTION_BEATS[key as keyof typeof REACTION_BEATS];
    if (diveBeat !== undefined) {
      this.result = resultForBeat(diveBeat);
      return this.startBeat(diveBeat, 'return', true);
    }
    if (key === 'wreckage.search-injury') {
      this.result = null;
      return this.startBeat('injury');
    }
    if (
      key === 'wreckage.search-repair'
      || key === 'wreckage.search-food'
      || key === 'wreckage.search-bait'
    ) {
      this.cancelActive();
      this.result = 'recovered';
      this.holdSurfaceScene();
      return Promise.resolve();
    }
    if (key === 'wreckage.carlitos-empty') {
      this.cancelActive();
      this.result = null;
      this.holdSurfaceScene();
      return Promise.resolve();
    }
    if (key === 'wreckage.leave') return this.startBeat('leave');
    return Promise.resolve();
  }

  update(_time: number, delta: number): void {
    if (this.disposed || !this.staged) return;
    let remaining = Number.isFinite(delta) && delta > 0 ? delta : 0;
    let active = this.active;
    while (active !== null && remaining > 0) {
      const duration = wreckageBeatDuration(active.beat);
      const advance = Math.min(duration - active.elapsed, remaining);
      active.elapsed += advance;
      remaining -= advance;
      sampleWreckageBeat(active.beat, active.elapsed, this.sample);
      this.applySample();
      if (active.elapsed < duration) return;
      this.completeActive(active);
      active = this.active;
    }
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.beginOperation();
    runCleanupSteps([
      () => this.settleDive(),
      () => this.settleActive(),
    ]);
  }

  clear(): void {
    if (this.disposed) return;
    this.beginOperation();
    runCleanupSteps([
      () => this.cancelActive(),
      () => this.releaseDive(),
      () => {
        this.staged = false;
        this.result = null;
      },
      () => this.hideScene(),
    ]);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.beginOperation();
    runCleanupSteps([
      () => this.cancelActive(),
      () => this.releaseDive(),
      () => this.hideScene(),
      () => this.boatRoot.clear(),
      () => this.worldRoot.clear(),
      () => this.boatRoot.removeFromParent(),
      () => this.worldRoot.removeFromParent(),
      () => this.ship.dispose(),
      () => disposeResourceSets(
        this.ghostGeometries,
        this.ghostTextures,
        this.ghostMaterials,
      ),
      () => disposeResourceSets(this.ownedGeometries, this.ownedMaterials),
    ]);
  }

  private startBeat(
    beat: WreckageBeat,
    nextBeat: WreckageBeat | null = null,
    releaseDiveOnFinish = false,
  ): Promise<void> {
    this.cancelActive();
    sampleWreckageBeat(beat, 0, this.sample);
    this.applySample();
    return new Promise((resolve) => {
      this.active = {
        beat,
        elapsed: 0,
        resolve,
        nextBeat,
        releaseDiveOnFinish,
      };
    });
  }

  private completeActive(active: ActiveWreckageBeat): void {
    if (this.active !== active) return;
    if (this.advanceActive(active)) return;
    this.active = null;
    this.completingActive = active;
    try {
      runCleanupSteps(this.completeActiveSteps);
    } finally {
      this.completingActive = null;
    }
  }

  private restoreCompletedSearchDebris(): void {
    if (this.completingActive?.beat === 'search' && this.debrisMotionApplied) {
      this.restoreSurfaceDebris();
    }
  }

  private releaseCompletedDive(): void {
    if (this.completingActive?.releaseDiveOnFinish) this.releaseDive();
  }

  private resolveCompletedBeat(): void {
    this.completingActive?.resolve();
  }

  private advanceActive(active: ActiveWreckageBeat): boolean {
    const nextBeat = active.nextBeat;
    if (nextBeat === null) return false;
    active.beat = nextBeat;
    active.nextBeat = null;
    active.elapsed = 0;
    sampleWreckageBeat(nextBeat, 0, this.sample);
    this.applySample();
    return true;
  }

  private cancelActive(): void {
    const active = this.active;
    if (active === null) return;
    this.active = null;
    runCleanupSteps([
      () => {
        if (active.beat === 'search' && this.debrisMotionApplied) {
          this.restoreSurfaceDebris();
        }
      },
      () => active.resolve(),
    ]);
  }

  private releaseDive(): void {
    if (!this.diveOwned) return;
    this.diveOwned = false;
    this.environment.dive.clear();
  }

  private settleDive(): void {
    if (!this.diveOwned) return;
    this.diveOwned = false;
    this.environment.dive.settleForVisibilityChange();
  }

  private settleActive(): void {
    const active = this.active;
    if (active === null) return;
    do {
      active.elapsed = wreckageBeatDuration(active.beat);
      sampleWreckageBeat(active.beat, active.elapsed, this.sample);
      this.applySample();
    } while (this.advanceActive(active));
    this.completeActive(active);
  }

  private beginOperation(): number {
    this.operation += 1;
    return this.operation;
  }

  private ownsOperation(operation: number): boolean {
    return !this.disposed && this.staged && this.operation === operation;
  }

  private holdSurfaceScene(): void {
    sampleWreckageBeat('reveal', wreckageBeatDuration('reveal'), this.sample);
    this.applySample();
  }

  private writeSurfaceDebrisMatrix(
    index: number,
    approach: number,
    falling: number,
  ): void {
    const placement = SURFACE_DEBRIS[index]!;
    this.scratchObject.position.set(
      placement.x + ((this.surfaceSeedOffset + index * 3) % 5 - 2) * 0.08,
      placement.y + approach * 0.06 - falling * (1.5 + index * 0.18),
      placement.z + approach * (2.1 + index * 0.2),
    );
    this.scratchObject.rotation.set(
      0.08 * (index - 1) + falling * (0.42 + index * 0.06),
      placement.yaw,
      0.1 * (index % 2) + falling * 0.18,
    );
    this.scratchObject.scale.set(placement.scale, placement.scale, placement.scale);
    this.scratchObject.updateMatrix();
    this.scratchMatrix.copy(this.scratchObject.matrix);
    this.debris.setMatrixAt(index, this.scratchMatrix);
  }

  private cacheSurfaceDebris(): void {
    for (let index = 0; index < SURFACE_DEBRIS.length; index += 1) {
      this.writeSurfaceDebrisMatrix(index, 0, 0);
      this.baseDebrisMatrices[index]!.copy(this.scratchMatrix);
    }
    this.debris.instanceMatrix.needsUpdate = true;
  }

  private applySurfaceDebrisMotion(approach: number, falling: number): void {
    if (falling > 0) {
      for (let index = 0; index < SURFACE_DEBRIS.length; index += 1) {
        this.writeSurfaceDebrisMatrix(
          index,
          index === this.selectedDebrisIndex ? approach : 0,
          falling,
        );
      }
    } else {
      this.writeSurfaceDebrisMatrix(this.selectedDebrisIndex, approach, 0);
    }
    this.debris.instanceMatrix.needsUpdate = true;
    this.debrisMotionApplied = true;
  }

  private restoreSurfaceDebris(): void {
    for (let index = 0; index < this.baseDebrisMatrices.length; index += 1) {
      this.debris.setMatrixAt(index, this.baseDebrisMatrices[index]!);
    }
    this.debris.instanceMatrix.needsUpdate = true;
    this.debrisMotionApplied = false;
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
    if (sample.debrisApproach > 0 || sample.fallingDebris > 0) {
      this.applySurfaceDebrisMotion(sample.debrisApproach, sample.fallingDebris);
    }
    this.debrisMaterial.opacity = sample.debrisAlpha;
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

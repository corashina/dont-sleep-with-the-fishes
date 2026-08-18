import {
  Box3,
  BufferGeometry,
  ConeGeometry,
  DoubleSide,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
} from 'three';
import type { ItemInstanceId } from '../../game/ItemState';
import { createWaveSample as waveSample, type WaveSample } from '../../ocean/WaveField';
import {
  disposeResourceSets,
  runCleanupSteps,
} from '../../world/SceneResources';
import type { BorrowedSupplyActor, MutableSupplyPose } from '../BoatSupplyDisplay';
import type { EventModelInstance } from '../EventModelLibrary';
import { StationaryEventCamera } from '../StationaryEventCamera';
import type {
  DedicatedEventEnvironment,
  DedicatedEventPresentation,
  EventOutcomePresentation,
  EventSceneContext,
} from '../eventPresentationTypes';
import { TimedPresentationAnimation } from '../TimedPresentationAnimation';
import {
  createTornadoSample,
  resetTornadoSample,
  sampleTornadoItemUse,
  sampleTornadoReaction,
  sampleTornadoReveal,
  TORNADO_ITEM_DURATION,
  TORNADO_REACTION_DURATION,
  TORNADO_REVEAL_DURATION,
  type TornadoSample,
} from './tornadoChoreography';

interface WindBandActor {
  readonly mesh: Mesh;
  readonly phase: number;
  readonly radius: number;
  readonly height: number;
  readonly speed: number;
  motionPhase: number;
}

interface SeaSprayActor {
  readonly mesh: Mesh;
  readonly phase: number;
  readonly radius: number;
  readonly scale: number;
}

interface ModelMaterialActor {
  readonly material: Material;
  readonly opacity: number;
}

const WIND_BAND_COUNT = 3;
const SEA_SPRAY_COUNT = 6;
const MAX_LOST_ACTORS = 2;
const WATERLINE = 0.04;
const TORNADO_SCALE = 2;
const SUBMERGED_FRACTION = 0.1;
const TORNADO_X = 12.8;
const TORNADO_Z = -19;
const TORNADO_DISTANCE = Math.hypot(TORNADO_X, TORNADO_Z);
const FULL_TURN = Math.PI * 2;

function advancePhase(phase: number, change: number): number {
  return (phase + change) % FULL_TURN;
}

const IDENTITY_ITEM_POSE: MutableSupplyPose = {
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1,
};

function supportedChoice(choiceId: string): boolean {
  return choiceId === 'anchor' || choiceId === 'swimRing';
}

export class TornadoPresentation implements DedicatedEventPresentation {
  readonly eventId = 'tornado' as const;
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();
  readonly itemAimTarget = new Group();

  private readonly modelInstance: EventModelInstance;
  private readonly modelRoot: Group;
  private readonly modelMaterials: ModelMaterialActor[] = [];
  private readonly windBands: WindBandActor[] = [];
  private readonly seaSprays: SeaSprayActor[] = [];
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly windMaterial = new MeshStandardMaterial({
    color: 0x78909a,
    emissive: 0x1b3039,
    emissiveIntensity: 0.18,
    roughness: 0.76,
    metalness: 0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    flatShading: true,
    side: DoubleSide,
  });
  private readonly sprayMaterial = new MeshStandardMaterial({
    color: 0x8ca7ae,
    emissive: 0x203b44,
    emissiveIntensity: 0.2,
    roughness: 0.68,
    metalness: 0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    flatShading: true,
    side: DoubleSide,
  });
  private readonly surfaceWave: WaveSample = waveSample();
  private readonly sample: TornadoSample = createTornadoSample();
  private readonly reactionState = {
    hullDamage: 0,
    anchorBroken: false,
    ringBroken: false,
    lostItemCount: 0,
  };
  private readonly lostPoses: MutableSupplyPose[] = [
    { ...IDENTITY_ITEM_POSE },
    { ...IDENTITY_ITEM_POSE },
  ];
  private readonly lostActors: Array<BorrowedSupplyActor | null> = [null, null];
  private readonly cameraLook: StationaryEventCamera | null;
  private readonly modelBaseOffset: number;
  private readonly modelHeight: number;
  private readonly animation = new TimedPresentationAnimation<
    'reveal' | 'item' | 'reaction'
  >(
    (kind, time, progress) => this.applyAnimation(kind, time, progress),
    (kind) => this.finishAnimation(kind),
    1e-9,
  );
  private activeChoiceId: string | null = null;
  private lastChoiceId = '';
  private waveTime = 0;
  private modelSpinPhase = 0;
  private swayPhase = 0;
  private sprayPhase = 0;
  private staged = false;
  private disposed = false;

  constructor(private readonly environment: DedicatedEventEnvironment) {
    this.cameraLook = environment.camera === undefined
      ? null
      : new StationaryEventCamera(environment.camera);
    this.worldRoot.name = 'tornado-world';
    this.boatRoot.name = 'tornado-boat';
    this.worldRoot.position.x = TORNADO_X;
    this.worldRoot.position.z = TORNADO_Z;
    this.worldRoot.scale.setScalar(TORNADO_SCALE);
    this.worldRoot.userData.distanceFromBoat = TORNADO_DISTANCE;

    this.modelInstance = environment.eventModels.create('tornadoCore');
    this.modelRoot = this.modelInstance.root;
    this.modelRoot.name = 'tornado-model';
    this.modelRoot.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(this.modelRoot);
    this.modelBaseOffset = bounds.isEmpty() ? 0 : -bounds.min.y;
    this.modelHeight = bounds.isEmpty() ? 0 : bounds.max.y - bounds.min.y;
    const aimHeight = bounds.isEmpty()
      ? 1.5
      : (bounds.min.y + bounds.max.y) * 0.5;
    this.modelRoot.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (let index = 0; index < materials.length; index += 1) {
        const material = materials[index]!;
        if (this.modelMaterials.some((actor) => actor.material === material)) continue;
        this.modelMaterials.push({ material, opacity: material.opacity });
        material.transparent = true;
        material.opacity = 0;
        material.needsUpdate = true;
      }
    });
    this.itemAimTarget.name = 'tornado-item-aim-target';
    this.itemAimTarget.position.set(0, aimHeight, 0);
    this.modelRoot.add(this.itemAimTarget);
    this.worldRoot.add(this.modelRoot);

    const windGeometry = new TorusGeometry(1, 0.035, 4, 32);
    const sprayGeometry = new ConeGeometry(0.08, 0.7, 5, 1, true);
    this.ownedGeometries.add(windGeometry);
    this.ownedGeometries.add(sprayGeometry);
    this.ownedMaterials.add(this.windMaterial);
    this.ownedMaterials.add(this.sprayMaterial);
    for (let index = 0; index < WIND_BAND_COUNT; index += 1) {
      const mesh = new Mesh(windGeometry, this.windMaterial);
      mesh.name = `tornado-wind-band-${index + 1}`;
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.windBands.push({
        mesh,
        phase: index / WIND_BAND_COUNT * Math.PI * 2,
        radius: 1.7 + index * 0.72,
        height: 0.72 + index * 1.35,
        speed: 0.78 + index * 0.16,
        motionPhase: 0,
      });
      this.worldRoot.add(mesh);
    }
    for (let index = 0; index < SEA_SPRAY_COUNT; index += 1) {
      const mesh = new Mesh(sprayGeometry, this.sprayMaterial);
      mesh.name = `tornado-sea-spray-${index + 1}`;
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.seaSprays.push({
        mesh,
        phase: index / SEA_SPRAY_COUNT * Math.PI * 2,
        radius: 1.45 + index % 2 * 0.5,
        scale: 0.82 + index % 3 * 0.14,
      });
      this.worldRoot.add(mesh);
    }
    this.hideScene();
  }

  stage(context: EventSceneContext): void {
    if (this.disposed || context.eventId !== this.eventId) return;
    this.clear();
    this.cameraLook?.capture();
    this.staged = true;
    this.worldRoot.visible = true;
    this.boatRoot.visible = true;
    sampleTornadoReveal(0, this.sample);
    this.applySample(this.waveTime);
  }

  reveal(): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    this.animation.cancel();
    this.activeChoiceId = null;
    this.cameraLook?.capture();
    sampleTornadoReveal(0, this.sample);
    this.applySample(this.waveTime);
    return this.animation.start('reveal', TORNADO_REVEAL_DURATION);
  }

  playItemUse(choiceId: string, _instanceId: ItemInstanceId): Promise<boolean> {
    if (this.disposed || !this.staged || !supportedChoice(choiceId)) {
      return Promise.resolve(false);
    }
    this.animation.cancel();
    this.activeChoiceId = choiceId;
    this.lastChoiceId = choiceId;
    sampleTornadoItemUse(choiceId, 0, this.sample);
    this.applySample(this.waveTime);
    return this.animation.start('item', TORNADO_ITEM_DURATION, {
      complete: true,
      cancel: false,
    });
  }

  react(result: EventOutcomePresentation): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    this.animation.cancel();
    this.activeChoiceId = null;
    this.releaseLostActors(false);

    const selectedId = result.selectedInstanceId;
    const selectedBroken = selectedId !== null
      && result.brokenInstanceIds.includes(selectedId);
    this.reactionState.hullDamage = result.resourceDeltas.hull ?? 0;
    this.reactionState.anchorBroken = selectedBroken && this.lastChoiceId === 'anchor';
    this.reactionState.ringBroken = selectedBroken && this.lastChoiceId === 'swimRing';
    this.reactionState.lostItemCount = 0;
    if (result.lostInstanceIds.length > 0) {
      const lostIds = result.lostInstanceIds.filter((id) => id !== selectedId);
      const lostLimit = Math.min(MAX_LOST_ACTORS, lostIds.length);
      for (let index = 0; index < lostLimit; index += 1) {
        const actor = this.environment.supplies.borrowEventActor(lostIds[index]!);
        if (actor === null) continue;
        this.lostActors[this.reactionState.lostItemCount] = actor;
        this.reactionState.lostItemCount += 1;
      }
    }

    sampleTornadoReaction(this.reactionState, 0, this.sample);
    this.applySample(this.waveTime);
    this.applyReactionPoses();
    return this.animation.start('reaction', TORNADO_REACTION_DURATION);
  }

  update(time: number, delta: number): void {
    if (this.disposed || !this.staged) return;
    const safeDelta = Number.isFinite(delta) && delta > 0 ? delta : 0;
    if (this.animation.active) {
      this.animation.update(time, safeDelta);
      this.advancePhases(safeDelta);
      this.applySample(time);
      return;
    }
    this.advancePhases(safeDelta);
    this.applySample(time);
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.animation.settle(this.waveTime);
    this.applySample(this.waveTime);
  }

  skip(): void {
    this.settleForVisibilityChange();
  }

  clear(): void {
    if (this.disposed) return;
    this.animation.cancel();
    this.activeChoiceId = null;
    this.releaseLostActors(false);
    this.resetPresentationState();
    this.cameraLook?.restore();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.animation.cancel();
    this.activeChoiceId = null;
    this.cameraLook?.restore();
    runCleanupSteps([
      () => this.releaseLostActors(false),
      () => this.resetPresentationState(),
      () => this.boatRoot.clear(),
      () => this.worldRoot.clear(),
      () => this.boatRoot.removeFromParent(),
      () => this.worldRoot.removeFromParent(),
      () => this.modelInstance.dispose(),
      () => disposeResourceSets(this.ownedGeometries, this.ownedMaterials),
    ]);
  }

  private releaseLostActors(onNextSync: boolean): void {
    for (let index = 0; index < this.lostActors.length; index += 1) {
      const actor = this.lostActors[index];
      this.lostActors[index] = null;
      if (onNextSync) actor?.releaseOnNextSync();
      else actor?.release();
    }
  }

  private applyAnimation(
    kind: 'reveal' | 'item' | 'reaction',
    _time: number,
    progress: number,
  ): void {
    if (kind === 'reveal') {
      sampleTornadoReveal(progress, this.sample);
    } else if (kind === 'item') {
      if (this.activeChoiceId === null) return;
      this.cameraLook?.apply(0, 0);
      sampleTornadoItemUse(this.activeChoiceId, progress, this.sample);
    } else {
      this.cameraLook?.apply(0, 0);
      sampleTornadoReaction(this.reactionState, progress, this.sample);
      this.applyReactionPoses();
    }
  }

  private finishAnimation(kind: 'reveal' | 'item' | 'reaction'): void {
    this.activeChoiceId = null;
    if (kind === 'reaction') this.releaseLostActors(true);
  }

  private applySample(time: number): void {
    if (Number.isFinite(time)) this.waveTime = time;
    this.environment.sampleWorldWaveInto(
      this.surfaceWave,
      this.waveTime,
      TORNADO_X,
      TORNADO_Z,
      this.environment.readWorldWaveAmplitudeScale(),
    );
    this.worldRoot.position.y = WATERLINE + this.surfaceWave.height;
    this.applyModel();
    this.applyWindBands();
    this.applySeaSpray();
  }

  private advancePhases(delta: number): void {
    if (delta === 0) return;
    this.modelSpinPhase = advancePhase(
      this.modelSpinPhase,
      delta * (0.7 + this.sample.spinRate * 1.8) * this.sample.spinPhase,
    );
    this.swayPhase = advancePhase(
      this.swayPhase,
      delta * 0.43 * this.sample.sway,
    );
    for (let index = 0; index < this.windBands.length; index += 1) {
      const actor = this.windBands[index]!;
      actor.motionPhase = advancePhase(
        actor.motionPhase,
        delta * this.sample.spinRate * actor.speed,
      );
    }
    this.sprayPhase = advancePhase(
      this.sprayPhase,
      delta * (0.7 + this.sample.spinRate * 0.9) * this.sample.effectStrength,
    );
  }

  private applyModel(): void {
    const visible = this.sample.visibility > 0.012;
    const scale = this.sample.funnelScale;
    this.modelRoot.visible = visible;
    this.modelRoot.position.y = (
      this.modelBaseOffset - this.modelHeight * SUBMERGED_FRACTION
    ) * scale;
    this.modelRoot.scale.setScalar(scale);
    this.modelRoot.rotation.x = Math.sin(this.swayPhase + 0.8)
      * this.sample.sway * 0.025;
    this.modelRoot.rotation.y = this.modelSpinPhase;
    this.modelRoot.rotation.z = Math.sin(this.swayPhase) * this.sample.sway * 0.045;
    for (let index = 0; index < this.modelMaterials.length; index += 1) {
      const actor = this.modelMaterials[index]!;
      actor.material.opacity = actor.opacity * this.sample.visibility;
    }
  }

  private applyWindBands(): void {
    const strength = this.sample.effectStrength;
    const visible = strength > 0.012;
    this.windMaterial.opacity = Math.min(0.5, strength * 0.42);
    for (let index = 0; index < this.windBands.length; index += 1) {
      const actor = this.windBands[index]!;
      actor.mesh.visible = visible;
      actor.mesh.position.y = actor.height * this.sample.funnelScale;
      actor.mesh.rotation.x = Math.PI / 2
        + Math.sin(this.swayPhase + actor.phase) * this.sample.sway * 0.08;
      actor.mesh.rotation.y = actor.phase + actor.motionPhase;
      actor.mesh.rotation.z = Math.cos(this.swayPhase + actor.phase)
        * this.sample.sway * 0.06;
      actor.mesh.scale.setScalar(actor.radius * (0.72 + strength * 0.28));
    }
  }

  private applySeaSpray(): void {
    const strength = this.sample.effectStrength;
    const visible = strength > 0.012;
    this.sprayMaterial.opacity = Math.min(0.62, strength * 0.58);
    for (let index = 0; index < this.seaSprays.length; index += 1) {
      const actor = this.seaSprays[index]!;
      const angle = actor.phase + this.sprayPhase;
      actor.mesh.visible = visible;
      actor.mesh.position.x = Math.cos(angle) * actor.radius;
      actor.mesh.position.y = 0.16
        + Math.sin(this.sprayPhase + actor.phase) * 0.1 * strength;
      actor.mesh.position.z = Math.sin(angle) * actor.radius;
      actor.mesh.rotation.x = Math.sin(angle) * 0.24;
      actor.mesh.rotation.y = -angle;
      actor.mesh.rotation.z = -Math.cos(angle) * 0.24;
      actor.mesh.scale.set(
        actor.scale * (0.7 + strength * 0.3),
        actor.scale * (0.55 + strength * 0.7),
        actor.scale * (0.7 + strength * 0.3),
      );
    }
  }

  private applyReactionPoses(): void {
    if (this.reactionState.lostItemCount === 0) return;
    for (let index = 0; index < this.reactionState.lostItemCount; index += 1) {
      const actor = this.lostActors[index];
      if (actor === null || actor === undefined) continue;
      const travel = Math.max(
        0,
        Math.min(1, this.sample.supplyTravel * 1.24 - index * 0.24),
      );
      const pose = this.lostPoses[index]!;
      pose.x = (2.6 + index * 0.32) * travel;
      pose.y = (0.38 + index * 0.14) * travel;
      pose.z = (-1.54 - index * 0.32) * travel;
      pose.yaw = (1.3 + index * 0.28) * travel;
      pose.pitch = -0.32 * travel;
      pose.roll = (index === 0 ? -2.1 : 1.7) * travel;
      const scale = 1 - travel * 0.42;
      pose.scaleX = scale;
      pose.scaleY = scale;
      pose.scaleZ = scale;
      actor.applyPose(pose);
    }
  }

  private resetPresentationState(): void {
    this.lastChoiceId = '';
    this.staged = false;
    this.reactionState.hullDamage = 0;
    this.reactionState.anchorBroken = false;
    this.reactionState.ringBroken = false;
    this.reactionState.lostItemCount = 0;
    this.waveTime = 0;
    this.modelSpinPhase = 0;
    this.swayPhase = 0;
    this.sprayPhase = 0;
    for (let index = 0; index < this.windBands.length; index += 1) {
      this.windBands[index]!.motionPhase = 0;
    }
    resetTornadoSample(this.sample);
    this.hideScene();
  }

  private hideScene(): void {
    this.worldRoot.visible = false;
    this.boatRoot.visible = false;
    this.modelRoot.visible = false;
    this.windMaterial.opacity = 0;
    this.sprayMaterial.opacity = 0;
    for (let index = 0; index < this.modelMaterials.length; index += 1) {
      this.modelMaterials[index]!.material.opacity = 0;
    }
    for (let index = 0; index < this.windBands.length; index += 1) {
      this.windBands[index]!.mesh.visible = false;
    }
    for (let index = 0; index < this.seaSprays.length; index += 1) {
      this.seaSprays[index]!.mesh.visible = false;
    }
  }
}

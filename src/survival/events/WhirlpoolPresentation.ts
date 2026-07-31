import {
  BufferGeometry,
  DoubleSide,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  TetrahedronGeometry,
  TorusGeometry,
} from 'three';
import type { ItemInstanceId } from '../../game/ItemState';
import type { WaveSample } from '../../ocean/WaveField';
import {
  disposeResourceSets,
  runCleanupSteps,
} from '../../world/SceneResources';
import type {
  BorrowedSupplyActor,
} from '../BoatSupplyDisplay';
import type {
  DedicatedEventEnvironment,
  DedicatedEventPresentation,
  EventOutcomePresentation,
  EventSceneContext,
} from '../eventPresentationTypes';
import {
  createWhirlpoolSample,
  resetWhirlpoolSample,
  sampleWhirlpoolItemUse,
  sampleWhirlpoolReaction,
  sampleWhirlpoolReveal,
  WHIRLPOOL_ITEM_DURATION,
  WHIRLPOOL_REACTION_DURATION,
  WHIRLPOOL_REVEAL_DURATION,
  type WhirlpoolSample,
} from './whirlpoolChoreography';

type ActiveWhirlpoolAnimation =
  | {
      readonly kind: 'reveal';
      elapsed: number;
      readonly duration: number;
      readonly resolve: () => void;
    }
  | {
      readonly kind: 'item';
      readonly choiceId: string;
      elapsed: number;
      readonly duration: number;
      readonly resolve: (played: boolean) => void;
    }
  | {
      readonly kind: 'reaction';
      elapsed: number;
      readonly duration: number;
      readonly resolve: () => void;
    };

interface SurfaceActor {
  readonly mesh: Mesh;
  readonly wave: WaveSample;
  readonly angle: number;
  readonly radius: number;
  readonly speed: number;
  readonly inwardTravel: number;
}

interface MutableSupplyPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

const FOAM_RIBBON_COUNT = 14;
const DEBRIS_COUNT = 12;
const CHAIN_LINK_COUNT = 10;
const MAX_LOST_ACTORS = 2;
const WATERLINE = 0.04;
const VORTEX_X = 0.6;
const VORTEX_Z = -5.6;
const VORTEX_RADIUS = 8.2;
const FOAM_RING_LIFT = 0.72;
const FOAM_RING_TILT = Math.PI * 0.34;

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

function waveSample(): WaveSample {
  return {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };
}

function styleCore(root: Group): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (let index = 0; index < materials.length; index += 1) {
      const material = materials[index]!;
      if (!(material instanceof MeshStandardMaterial)) continue;
      material.color.setHex(0x1b4650);
      material.emissive.setHex(0x0b252b);
      material.emissiveIntensity = 0.2;
      material.map = null;
      material.roughness = 0.74;
      material.metalness = 0.02;
      material.flatShading = true;
      material.needsUpdate = true;
    }
  });
}

function supportedChoice(choiceId: string): boolean {
  return choiceId === 'anchor' || choiceId === 'swimRing';
}

export class WhirlpoolPresentation implements DedicatedEventPresentation {
  readonly eventId = 'whirlpool' as const;
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();

  private readonly coreModel;
  private readonly foamRibbons: SurfaceActor[] = [];
  private readonly debris: SurfaceActor[] = [];
  private readonly chainLinks: Mesh[] = [];
  private readonly ringShell: Mesh;
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly foamMaterial = new MeshStandardMaterial({
    color: 0xb5d6d4,
    emissive: 0x315a5d,
    emissiveIntensity: 0.2,
    roughness: 0.38,
    metalness: 0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    flatShading: true,
    side: DoubleSide,
  });
  private readonly debrisMaterial = new MeshStandardMaterial({
    color: 0x493a2c,
    emissive: 0x130d09,
    emissiveIntensity: 0.08,
    roughness: 0.92,
    metalness: 0,
    flatShading: true,
  });
  private readonly chainMaterial = new MeshStandardMaterial({
    color: 0x455153,
    emissive: 0x101819,
    emissiveIntensity: 0.08,
    roughness: 0.62,
    metalness: 0.48,
    flatShading: true,
  });
  private readonly ringMaterial = new MeshStandardMaterial({
    color: 0xd2a44d,
    emissive: 0x4d2f0d,
    emissiveIntensity: 0.18,
    roughness: 0.68,
    metalness: 0,
    transparent: true,
    opacity: 0,
    flatShading: true,
  });
  private readonly sample: WhirlpoolSample = createWhirlpoolSample();
  private readonly reactionState: {
    hullDamage: number;
    anchorBroken: boolean;
    ringBroken: boolean;
    lostItemCount: number;
  } = {
    hullDamage: 0,
    anchorBroken: false,
    ringBroken: false,
    lostItemCount: 0,
  };
  private readonly itemPose: MutableSupplyPose = { ...IDENTITY_ITEM_POSE };
  private readonly lostPoses: MutableSupplyPose[] = [
    { ...IDENTITY_ITEM_POSE },
    { ...IDENTITY_ITEM_POSE },
  ];
  private readonly lostActors: Array<BorrowedSupplyActor | null> = [null, null];
  private active: ActiveWhirlpoolAnimation | null = null;
  private itemActor: BorrowedSupplyActor | null = null;
  private lastChoiceId = '';
  private staged = false;
  private disposed = false;

  constructor(private readonly environment: DedicatedEventEnvironment) {
    this.worldRoot.name = 'whirlpool-world';
    this.boatRoot.name = 'whirlpool-boat';
    this.worldRoot.userData.foamRibbonCount = FOAM_RIBBON_COUNT;
    this.worldRoot.userData.debrisCount = DEBRIS_COUNT;
    this.boatRoot.userData.chainLinkCount = CHAIN_LINK_COUNT;

    this.coreModel = environment.eventModels.create('whirlpoolCore');
    this.coreModel.root.name = 'whirlpool-core';
    this.coreModel.root.userData.visualOnly = true;
    this.coreModel.root.userData.sourceModel = 'Tornado';
    this.coreModel.root.position.set(VORTEX_X, 0.12, VORTEX_Z);
    this.coreModel.root.scale.set(0.3, 0.08, 0.3);
    styleCore(this.coreModel.root);
    this.worldRoot.add(this.coreModel.root);

    this.ownedMaterials.add(this.foamMaterial);
    this.ownedMaterials.add(this.debrisMaterial);
    this.ownedMaterials.add(this.chainMaterial);
    this.ownedMaterials.add(this.ringMaterial);

    const foamGeometry = new TorusGeometry(1, 0.06, 5, 28, Math.PI * 1.75);
    const debrisGeometry = new TetrahedronGeometry(0.26, 0);
    const chainGeometry = new TorusGeometry(0.095, 0.018, 4, 8);
    const ringGeometry = new TorusGeometry(0.44, 0.105, 7, 18);
    this.ownedGeometries.add(foamGeometry);
    this.ownedGeometries.add(debrisGeometry);
    this.ownedGeometries.add(chainGeometry);
    this.ownedGeometries.add(ringGeometry);

    for (let index = 0; index < FOAM_RIBBON_COUNT; index += 1) {
      const mesh = new Mesh(foamGeometry, this.foamMaterial);
      const angle = index / FOAM_RIBBON_COUNT * Math.PI * 2
        + (index % 3) * 0.08;
      mesh.name = `whirlpool-foam-ribbon-${index + 1}`;
      mesh.renderOrder = 2;
      mesh.rotation.x = Math.PI / 2;
      mesh.scale.set(1, 1, 1);
      const actor = {
        mesh,
        wave: waveSample(),
        angle,
        radius: 1.15 + (index % 7) * 0.18,
        speed: 0.72 + (index % 5) * 0.08,
        inwardTravel: 0.18 + (index % 3) * 0.06,
      };
      this.foamRibbons.push(actor);
      this.worldRoot.add(mesh);
    }

    for (let index = 0; index < DEBRIS_COUNT; index += 1) {
      const mesh = new Mesh(debrisGeometry, this.debrisMaterial);
      const angle = index / DEBRIS_COUNT * Math.PI * 2 + 0.14;
      mesh.name = `whirlpool-debris-${index + 1}`;
      mesh.castShadow = true;
      mesh.scale.set(
        0.58 + (index % 4) * 0.13,
        0.28 + (index % 3) * 0.08,
        0.72 + (index % 5) * 0.09,
      );
      const actor = {
        mesh,
        wave: waveSample(),
        angle,
        radius: 1.4 + (index % 5) * 0.24,
        speed: 0.48 + (index % 4) * 0.09,
        inwardTravel: 0.58 + (index % 4) * 0.14,
      };
      this.debris.push(actor);
      this.worldRoot.add(mesh);
    }

    for (let index = 0; index < CHAIN_LINK_COUNT; index += 1) {
      const link = new Mesh(chainGeometry, this.chainMaterial);
      link.name = `whirlpool-chain-link-${index + 1}`;
      link.position.set(0.46, 0.58 - index * 0.14, -0.32);
      link.rotation.set(
        index % 2 === 0 ? Math.PI / 2 : 0,
        0,
        index % 2 === 0 ? 0 : Math.PI / 2,
      );
      link.scale.set(1, 1.16, 0.88);
      link.castShadow = true;
      this.chainLinks.push(link);
      this.boatRoot.add(link);
    }

    this.ringShell = new Mesh(ringGeometry, this.ringMaterial);
    this.ringShell.name = 'whirlpool-ring-shell';
    this.ringShell.position.set(0.78, 0.36, -0.42);
    this.ringShell.rotation.set(Math.PI / 2, 0.12, -0.22);
    this.ringShell.castShadow = true;
    this.boatRoot.add(this.ringShell);
    this.hideScene();
    this.resetVortex();
  }

  stage(context: EventSceneContext): void {
    if (this.disposed || context.eventId !== this.eventId) return;
    this.clear();
    this.staged = true;
    this.worldRoot.visible = true;
    this.boatRoot.visible = true;
    sampleWhirlpoolReveal(0, this.sample);
    this.applySample(0);
  }

  reveal(): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    this.cancelActive();
    sampleWhirlpoolReveal(0, this.sample);
    this.applySample(0);
    return new Promise((resolve) => {
      this.active = {
        kind: 'reveal',
        elapsed: 0,
        duration: WHIRLPOOL_REVEAL_DURATION,
        resolve,
      };
    });
  }

  playItemUse(choiceId: string, instanceId: ItemInstanceId): Promise<boolean> {
    if (
      this.disposed
      || !this.staged
      || !supportedChoice(choiceId)
    ) {
      return Promise.resolve(false);
    }
    this.cancelActive();
    if (!this.borrowItemActor(instanceId)) return Promise.resolve(false);
    this.lastChoiceId = choiceId;
    sampleWhirlpoolItemUse(choiceId, 0, this.sample);
    this.applyItemPose();
    this.applySample(0);
    return new Promise((resolve) => {
      this.active = {
        kind: 'item',
        choiceId,
        elapsed: 0,
        duration: WHIRLPOOL_ITEM_DURATION,
        resolve,
      };
    });
  }

  react(result: EventOutcomePresentation): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    this.cancelActive();
    this.releaseLostActors(false);

    const selectedId = result.selectedInstanceId;
    const selectedBroken = selectedId !== null
      && result.brokenInstanceIds.includes(selectedId);
    this.reactionState.hullDamage = result.resourceDeltas.hull ?? 0;
    this.reactionState.anchorBroken = selectedBroken
      && this.lastChoiceId === 'anchor';
    this.reactionState.ringBroken = selectedBroken
      && this.lastChoiceId === 'swimRing';
    this.reactionState.lostItemCount = 0;

    if (result.lostInstanceIds.length > 0) {
      this.releaseItemActor();
      const lostLimit = Math.min(MAX_LOST_ACTORS, result.lostInstanceIds.length);
      for (let index = 0; index < lostLimit; index += 1) {
        const actor = this.environment.supplies.borrowEventActor(
          result.lostInstanceIds[index]!,
        );
        if (actor === null) continue;
        this.lostActors[this.reactionState.lostItemCount] = actor;
        this.reactionState.lostItemCount += 1;
      }
    } else if (
      selectedId !== null
      && this.itemActor?.instanceId !== selectedId
    ) {
      this.borrowItemActor(selectedId);
    }

    sampleWhirlpoolReaction(this.reactionState, 0, this.sample);
    this.applySample(0);
    this.applyReactionPoses();
    return new Promise((resolve) => {
      this.active = {
        kind: 'reaction',
        elapsed: 0,
        duration: WHIRLPOOL_REACTION_DURATION,
        resolve,
      };
    });
  }

  update(time: number, delta: number): void {
    if (this.disposed || !this.staged) return;
    const active = this.active;
    if (active !== null) {
      const safeDelta = Number.isFinite(delta) && delta > 0 ? delta : 0;
      active.elapsed = Math.min(active.duration, active.elapsed + safeDelta);
      if (active.duration - active.elapsed <= 1e-9) active.elapsed = active.duration;
      const progress = active.duration === 0 ? 1 : active.elapsed / active.duration;
      if (active.kind === 'reveal') {
        sampleWhirlpoolReveal(progress, this.sample);
      } else if (active.kind === 'item') {
        sampleWhirlpoolItemUse(active.choiceId, progress, this.sample);
        this.applyItemPose();
      } else {
        sampleWhirlpoolReaction(this.reactionState, progress, this.sample);
        this.applyReactionPoses();
      }
      this.applySample(time);
      if (progress === 1) this.finishActive();
      return;
    }
    this.applySample(time);
  }

  settleForVisibilityChange(): void {
    if (this.disposed || this.active === null) return;
    this.active.elapsed = this.active.duration;
    if (this.active.kind === 'reveal') {
      sampleWhirlpoolReveal(1, this.sample);
    } else if (this.active.kind === 'item') {
      sampleWhirlpoolItemUse(this.active.choiceId, 1, this.sample);
      this.applyItemPose();
    } else {
      sampleWhirlpoolReaction(this.reactionState, 1, this.sample);
      this.applyReactionPoses();
    }
    this.applySample(0);
    this.finishActive();
  }

  clear(): void {
    if (this.disposed) return;
    this.cancelActive();
    this.releaseItemActor();
    this.releaseLostActors(false);
    this.resetPresentationState();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const active = this.active;
    const itemActor = this.itemActor;
    this.active = null;
    this.itemActor = null;
    this.resolveCancelled(active);

    runCleanupSteps([
      () => itemActor?.release(),
      () => this.releaseLostActors(false),
      () => this.resetPresentationState(),
      () => this.boatRoot.clear(),
      () => this.worldRoot.clear(),
      () => this.boatRoot.removeFromParent(),
      () => this.worldRoot.removeFromParent(),
      () => this.coreModel.dispose(),
      () => disposeResourceSets(this.ownedGeometries, this.ownedMaterials),
    ]);
  }

  private borrowItemActor(instanceId: ItemInstanceId): boolean {
    if (this.itemActor?.instanceId === instanceId) return true;
    this.releaseItemActor();
    const actor = this.environment.supplies.borrowEventActor(instanceId);
    if (actor === null) return false;
    this.itemActor = actor;
    return true;
  }

  private releaseItemActor(): void {
    const actor = this.itemActor;
    this.itemActor = null;
    actor?.release();
  }

  private releaseLostActors(onNextSync: boolean): void {
    for (let index = 0; index < this.lostActors.length; index += 1) {
      const actor = this.lostActors[index];
      this.lostActors[index] = null;
      if (onNextSync) actor?.releaseOnNextSync();
      else actor?.release();
    }
  }

  private finishActive(): void {
    const active = this.active;
    if (active === null) return;
    this.active = null;
    if (active.kind === 'item') {
      sampleWhirlpoolItemUse(active.choiceId, 1, this.sample);
      this.applyItemPose();
      this.applySample(0);
      active.resolve(true);
      return;
    }
    if (active.kind === 'reaction') this.releaseLostActors(true);
    active.resolve();
  }

  private cancelActive(): void {
    const active = this.active;
    this.active = null;
    this.resolveCancelled(active);
  }

  private resolveCancelled(active: ActiveWhirlpoolAnimation | null): void {
    if (active?.kind === 'item') active.resolve(false);
    else active?.resolve();
  }

  private applySample(time: number): void {
    this.applyVortex();
    this.coreModel.root.visible = this.sample.vortexStrength > 0.012;
    this.applySurfaceActors(time);
    this.applyChain();
    this.applyRingShell();

    const cameraRoot = this.environment.cameraEffectsRoot;
    if (cameraRoot !== undefined) {
      cameraRoot.rotation.set(0, 0, this.sample.cameraRoll);
    }
    const boatRoot = this.environment.boatEffectsRoot;
    if (boatRoot !== undefined) {
      boatRoot.rotation.set(0, this.sample.boatYaw, this.sample.boatRoll);
    }
  }

  private applyVortex(): void {
    const vortex = this.environment.vortexWave;
    if (this.sample.vortexStrength === 0) {
      this.resetVortex();
      return;
    }
    vortex.centerX = VORTEX_X;
    vortex.centerZ = VORTEX_Z;
    vortex.radius = VORTEX_RADIUS;
    vortex.depression = this.sample.vortexDepression;
    vortex.tangentStrength = this.sample.vortexTangentStrength;
    vortex.phase = this.sample.vortexPhase;
    vortex.strength = this.sample.vortexStrength;
  }

  private applySurfaceActors(time: number): void {
    this.foamMaterial.opacity = Math.min(0.9, this.sample.foamStrength * 0.88);
    for (let index = 0; index < this.foamRibbons.length; index += 1) {
      const actor = this.foamRibbons[index]!;
      const angle = actor.angle + this.sample.vortexPhase * actor.speed * 0.16;
      const radius = actor.radius - this.sample.debrisPull * actor.inwardTravel;
      const sampleX = VORTEX_X + Math.cos(angle) * radius;
      const sampleZ = VORTEX_Z + Math.sin(angle) * radius;
      this.environment.sampleWorldWaveInto(actor.wave, time, sampleX, sampleZ, 1);
      actor.mesh.visible = this.sample.foamStrength > 0.012;
      actor.mesh.position.set(
        VORTEX_X + actor.wave.displacementX * 0.2,
        WATERLINE + actor.wave.height + FOAM_RING_LIFT,
        VORTEX_Z + actor.wave.displacementZ * 0.2,
      );
      actor.mesh.rotation.set(
        FOAM_RING_TILT + actor.wave.normal.z * 0.04,
        actor.wave.normal.x * 0.02,
        angle,
      );
      actor.mesh.scale.setScalar(radius);
    }

    for (let index = 0; index < this.debris.length; index += 1) {
      const actor = this.debris[index]!;
      const angle = actor.angle + this.sample.vortexPhase * actor.speed * 0.19;
      const radius = actor.radius - this.sample.debrisPull * actor.inwardTravel;
      const x = VORTEX_X + Math.cos(angle) * radius;
      const z = VORTEX_Z + Math.sin(angle) * radius;
      this.environment.sampleWorldWaveInto(actor.wave, time, x, z, 1);
      actor.mesh.visible = this.sample.debrisPull > 0.012;
      actor.mesh.position.set(
        x + actor.wave.displacementX,
        WATERLINE + actor.wave.height + 0.16,
        z + actor.wave.displacementZ,
      );
      actor.mesh.rotation.set(
        actor.wave.normal.z * 0.16 + index * 0.11,
        angle + time * actor.speed,
        -actor.wave.normal.x * 0.14 + index * 0.07,
      );
    }
  }

  private applyChain(): void {
    const visible = this.sample.anchorCatch > 0.01
      || this.sample.chainTension > 0.01
      || this.sample.chainSnap > 0.01;
    for (let index = 0; index < this.chainLinks.length; index += 1) {
      const link = this.chainLinks[index]!;
      const snapSide = index >= 6 ? 1 : 0;
      link.visible = visible;
      link.position.set(
        0.46 + snapSide * this.sample.chainSnap * (index - 5) * 0.12,
        0.58 - index * (0.08 + this.sample.chainTension * 0.06)
          + snapSide * this.sample.chainSnap * 0.08,
        -0.32 - this.sample.anchorCatch * index * 0.018,
      );
      link.rotation.z = snapSide * this.sample.chainSnap * 0.46;
    }
  }

  private applyRingShell(): void {
    const strength = Math.max(this.sample.ringCompression, this.sample.ringSlip);
    this.ringShell.visible = strength > 0.01;
    this.ringMaterial.opacity = Math.min(0.62, strength * 0.68);
    this.ringShell.position.set(
      0.78 + this.sample.ringSlip * 0.72,
      0.36 - this.sample.ringCompression * 0.18,
      -0.42 - this.sample.ringSlip * 0.34,
    );
    this.ringShell.rotation.set(
      Math.PI / 2,
      0.12,
      -0.22 - this.sample.ringSlip * 0.52,
    );
    this.ringShell.scale.set(
      1 + this.sample.ringCompression * 0.24,
      1 - this.sample.ringCompression * 0.72,
      1 + this.sample.ringCompression * 0.12,
    );
  }

  private applyItemPose(): void {
    const actor = this.itemActor;
    if (actor === null) return;
    const pose = this.itemPose;
    pose.x = this.sample.itemX;
    pose.y = this.sample.itemY;
    pose.z = this.sample.itemZ;
    pose.yaw = this.sample.itemYaw;
    pose.pitch = this.sample.itemPitch;
    pose.roll = this.sample.itemRoll;
    pose.scaleX = this.sample.itemScaleX;
    pose.scaleY = this.sample.itemScaleY;
    pose.scaleZ = this.sample.itemScaleZ;
    actor.applyPose(pose);
  }

  private applyReactionPoses(): void {
    if (this.reactionState.lostItemCount === 0) {
      this.applyItemPose();
      return;
    }
    for (let index = 0; index < this.reactionState.lostItemCount; index += 1) {
      const actor = this.lostActors[index];
      if (actor === null || actor === undefined) continue;
      const travel = Math.max(
        0,
        Math.min(1, this.sample.supplyTravel * 1.24 - index * 0.24),
      );
      const pose = this.lostPoses[index]!;
      pose.x = (index === 0 ? 2.8 : -2.4) * travel;
      pose.y = (0.46 + index * 0.18) * travel;
      pose.z = (-1.1 - index * 0.42) * travel;
      pose.yaw = (index === 0 ? 1.4 : -1.1) * travel;
      pose.pitch = -0.34 * travel;
      pose.roll = (index === 0 ? -2.2 : 1.8) * travel;
      const scale = 1 - travel * 0.42;
      pose.scaleX = scale;
      pose.scaleY = scale;
      pose.scaleZ = scale;
      actor.applyPose(pose);
    }
  }

  private resetEffectRoots(): void {
    this.environment.cameraEffectsRoot?.position.set(0, 0, 0);
    this.environment.cameraEffectsRoot?.rotation.set(0, 0, 0);
    this.environment.cameraEffectsRoot?.scale.set(1, 1, 1);
    this.environment.boatEffectsRoot?.position.set(0, 0, 0);
    this.environment.boatEffectsRoot?.rotation.set(0, 0, 0);
    this.environment.boatEffectsRoot?.scale.set(1, 1, 1);
  }

  private resetPresentationState(): void {
    this.lastChoiceId = '';
    this.staged = false;
    this.reactionState.hullDamage = 0;
    this.reactionState.anchorBroken = false;
    this.reactionState.ringBroken = false;
    this.reactionState.lostItemCount = 0;
    resetWhirlpoolSample(this.sample);
    this.hideScene();
    this.resetEffectRoots();
    this.resetVortex();
  }

  private resetVortex(): void {
    const vortex = this.environment.vortexWave;
    vortex.centerX = 0;
    vortex.centerZ = 0;
    vortex.radius = 0;
    vortex.depression = 0;
    vortex.tangentStrength = 0;
    vortex.phase = 0;
    vortex.strength = 0;
  }

  private hideScene(): void {
    this.worldRoot.visible = false;
    this.boatRoot.visible = false;
    this.coreModel.root.visible = false;
    this.foamMaterial.opacity = 0;
    this.ringMaterial.opacity = 0;
    for (let index = 0; index < this.foamRibbons.length; index += 1) {
      this.foamRibbons[index]!.mesh.visible = false;
    }
    for (let index = 0; index < this.debris.length; index += 1) {
      this.debris[index]!.mesh.visible = false;
    }
    for (let index = 0; index < this.chainLinks.length; index += 1) {
      this.chainLinks[index]!.visible = false;
    }
    this.ringShell.visible = false;
    this.ringShell.scale.set(1, 1, 1);
  }
}

import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import type { ItemInstanceId } from '../../game/ItemState';
import type { WaveSample } from '../../ocean/WaveField';
import {
  disposeResourceSets,
  runCleanupSteps,
} from '../../world/SceneResources';
import type { BorrowedSupplyActor } from '../BoatSupplyDisplay';
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

interface SpiralStreamActor {
  readonly mesh: Mesh;
  readonly phase: number;
  readonly speed: number;
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

const STREAM_COUNT = 6;
const MAX_LOST_ACTORS = 2;
const WATERLINE = 0.04;
const VORTEX_X = 4.6;
const VORTEX_Z = -6.8;
const VORTEX_RADIUS = 2.35;
const VORTEX_DISTANCE = Math.hypot(VORTEX_X, VORTEX_Z);

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

function createSpiralStreamGeometry(): BufferGeometry {
  const segmentCount = 48;
  const positions = new Float32Array((segmentCount + 1) * 6);
  const indices: number[] = [];
  for (let index = 0; index <= segmentCount; index += 1) {
    const t = index / segmentCount;
    const angle = t * Math.PI * 6.4;
    const radius = 1.9 - t * 1.68;
    const width = 0.11 - t * 0.045;
    const y = -0.08 - t * 2.72;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const offset = index * 6;
    positions[offset] = cos * (radius - width);
    positions[offset + 1] = y;
    positions[offset + 2] = sin * (radius - width);
    positions[offset + 3] = cos * (radius + width);
    positions[offset + 4] = y - 0.035;
    positions[offset + 5] = sin * (radius + width);
    if (index === segmentCount) continue;
    const vertex = index * 2;
    indices.push(vertex, vertex + 2, vertex + 1, vertex + 1, vertex + 2, vertex + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function supportedChoice(choiceId: string): boolean {
  return choiceId === 'anchor' || choiceId === 'swimRing';
}

export class WhirlpoolPresentation implements DedicatedEventPresentation {
  readonly eventId = 'whirlpool' as const;
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();

  private readonly streams: SpiralStreamActor[] = [];
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly streamMaterial = new MeshStandardMaterial({
    color: 0x79b7be,
    emissive: 0x164852,
    emissiveIntensity: 0.34,
    roughness: 0.26,
    metalness: 0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    flatShading: true,
    side: DoubleSide,
  });
  private readonly rimWave = waveSample();
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
    this.worldRoot.userData.streamCount = STREAM_COUNT;
    this.worldRoot.userData.vortexCenter = [VORTEX_X, VORTEX_Z];
    this.worldRoot.userData.vortexRadius = VORTEX_RADIUS;
    this.worldRoot.userData.distanceFromBoat = VORTEX_DISTANCE;

    const streamGeometry = createSpiralStreamGeometry();
    this.ownedGeometries.add(streamGeometry);
    this.ownedMaterials.add(this.streamMaterial);
    for (let index = 0; index < STREAM_COUNT; index += 1) {
      const mesh = new Mesh(streamGeometry, this.streamMaterial);
      mesh.name = `whirlpool-water-stream-${index + 1}`;
      mesh.renderOrder = 2;
      mesh.visible = false;
      const actor = {
        mesh,
        phase: index / STREAM_COUNT * Math.PI * 2,
        speed: 0.86 + index % 3 * 0.09,
      };
      this.streams.push(actor);
      this.worldRoot.add(mesh);
    }
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
    if (this.disposed || !this.staged || !supportedChoice(choiceId)) {
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
    this.reactionState.anchorBroken = selectedBroken && this.lastChoiceId === 'anchor';
    this.reactionState.ringBroken = selectedBroken && this.lastChoiceId === 'swimRing';
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
    } else if (selectedId !== null && this.itemActor?.instanceId !== selectedId) {
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
    this.applyStreams(time);
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

  private applyStreams(time: number): void {
    const visible = this.sample.streamStrength > 0.012;
    this.streamMaterial.opacity = Math.min(0.82, this.sample.streamStrength * 0.78);
    if (visible) {
      this.environment.sampleWorldWaveInto(
        this.rimWave,
        time,
        VORTEX_X + VORTEX_RADIUS,
        VORTEX_Z,
        1,
      );
    }
    const revealScale = Math.max(0.04, this.sample.vortexStrength);
    const flow = this.sample.streamFlow * 0.46;
    for (let index = 0; index < this.streams.length; index += 1) {
      const actor = this.streams[index]!;
      actor.mesh.visible = visible;
      if (!visible) continue;
      actor.mesh.position.set(
        VORTEX_X + this.rimWave.displacementX * 0.08,
        WATERLINE + this.rimWave.height + 0.08,
        VORTEX_Z + this.rimWave.displacementZ * 0.08,
      );
      actor.mesh.rotation.set(
        this.rimWave.normal.z * 0.025,
        actor.phase + this.sample.vortexPhase * 0.06 + time * actor.speed * flow,
        -this.rimWave.normal.x * 0.025,
      );
      actor.mesh.scale.set(
        revealScale,
        0.68 + this.sample.vortexDepression * 0.24,
        revealScale,
      );
    }
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
    resetWhirlpoolSample(this.sample);
    this.hideScene();
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
    this.streamMaterial.opacity = 0;
    for (let index = 0; index < this.streams.length; index += 1) {
      this.streams[index]!.mesh.visible = false;
    }
  }
}

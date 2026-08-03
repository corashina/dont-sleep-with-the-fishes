import {
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  RingGeometry,
} from 'three';
import type { ItemInstanceId } from '../../game/ItemState';
import { createWaveSample as waveSample, type WaveSample } from '../../ocean/WaveField';
import {
  disposeResourceSets,
  runCleanupSteps,
} from '../../world/SceneResources';
import { borrowSupplyActor, releaseSupplyActor } from '../BoatSupplyDisplay';
import type { BorrowedSupplyActor, MutableSupplyPose } from '../BoatSupplyDisplay';
import { resolveCancelledEventAnimation } from '../eventPresentationTypes';
import { StationaryEventCamera } from '../StationaryEventCamera';
import type {
  DedicatedEventEnvironment,
  DedicatedEventAnimation,
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

interface SpiralStreamActor {
  readonly mesh: Mesh;
  readonly phase: number;
  readonly speed: number;
}

const STREAM_COUNT = 6;
const MAX_LOST_ACTORS = 2;
const WATERLINE = 0.04;
const VORTEX_X = 12.8;
const VORTEX_Z = -19;
const VORTEX_RADIUS = 14.1;
const VORTEX_SURFACE_OFFSET = -0.14;
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

function createSpiralStreamGeometry(): BufferGeometry {
  const segmentCount = 48;
  const positions = new Float32Array((segmentCount + 1) * 6);
  const indices: number[] = [];
  for (let index = 0; index <= segmentCount; index += 1) {
    const t = index / segmentCount;
    const angle = t * Math.PI * 6.4;
    const radius = 11.4 - t * 10.08;
    const width = 0.6 - t * 0.24;
    const y = -0.16 - t * 5.44;
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
  private readonly funnelMaterial = new MeshStandardMaterial({
    color: 0x071317,
    emissive: 0x020608,
    emissiveIntensity: 0.18,
    roughness: 0.9,
    metalness: 0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: DoubleSide,
    flatShading: true,
  });
  private readonly ringMaterial = new MeshStandardMaterial({
    color: 0x659ba1,
    emissive: 0x102f35,
    emissiveIntensity: 0.22,
    roughness: 0.38,
    metalness: 0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: DoubleSide,
    flatShading: true,
  });
  private readonly funnel: Mesh;
  private readonly surfaceRings: Mesh[] = [];
  private readonly cameraLook: StationaryEventCamera | null;
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
  private active: DedicatedEventAnimation | null = null;
  private itemActor: BorrowedSupplyActor | null = null;
  private lastChoiceId = '';
  private staged = false;
  private disposed = false;

  constructor(private readonly environment: DedicatedEventEnvironment) {
    this.cameraLook = environment.camera === undefined
      ? null
      : new StationaryEventCamera(environment.camera);
    this.worldRoot.name = 'whirlpool-world';
    this.boatRoot.name = 'whirlpool-boat';
    this.worldRoot.userData.streamCount = STREAM_COUNT;
    this.worldRoot.userData.vortexCenter = [VORTEX_X, VORTEX_Z];
    this.worldRoot.userData.vortexRadius = VORTEX_RADIUS;
    this.worldRoot.userData.distanceFromBoat = VORTEX_DISTANCE;
    this.worldRoot.userData.surfaceOffset = VORTEX_SURFACE_OFFSET;

    const streamGeometry = createSpiralStreamGeometry();
    const funnelGeometry = new CylinderGeometry(9.6, 1.35, 5.6, 32, 6, true);
    const ringGeometry = new RingGeometry(0.88, 1, 32, 1);
    this.ownedGeometries.add(streamGeometry);
    this.ownedGeometries.add(funnelGeometry);
    this.ownedGeometries.add(ringGeometry);
    this.ownedMaterials.add(this.streamMaterial);
    this.ownedMaterials.add(this.funnelMaterial);
    this.ownedMaterials.add(this.ringMaterial);
    this.funnel = new Mesh(funnelGeometry, this.funnelMaterial);
    this.funnel.name = 'whirlpool-dark-funnel';
    this.funnel.visible = false;
    this.funnel.renderOrder = 1;
    this.worldRoot.add(this.funnel);
    const ringScales = [6.45, 9.75, 13.05] as const;
    for (let index = 0; index < ringScales.length; index += 1) {
      const ring = new Mesh(ringGeometry, this.ringMaterial);
      ring.name = `whirlpool-ring-${index + 1}`;
      ring.rotation.x = -Math.PI / 2;
      ring.scale.setScalar(ringScales[index]!);
      ring.visible = false;
      ring.renderOrder = 2;
      this.surfaceRings.push(ring);
      this.worldRoot.add(ring);
    }
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
    this.cameraLook?.capture();
    this.staged = true;
    this.worldRoot.visible = true;
    this.boatRoot.visible = true;
    sampleWhirlpoolReveal(0, this.sample);
    this.applySample(0);
  }

  reveal(): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    this.cancelActive();
    this.cameraLook?.capture();
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
        this.applyRevealCamera(progress);
      } else if (active.kind === 'item') {
        this.cameraLook?.apply(0, 0);
        sampleWhirlpoolItemUse(active.choiceId, progress, this.sample);
        this.applyItemPose();
      } else {
        this.cameraLook?.apply(0, 0);
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
      this.applyRevealCamera(1);
    } else if (this.active.kind === 'item') {
      this.cameraLook?.apply(0, 0);
      sampleWhirlpoolItemUse(this.active.choiceId, 1, this.sample);
      this.applyItemPose();
    } else {
      this.cameraLook?.apply(0, 0);
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
    this.cameraLook?.restore();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const active = this.active;
    const itemActor = this.itemActor;
    this.active = null;
    this.itemActor = null;
    this.cameraLook?.restore();
    resolveCancelledEventAnimation(active);
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
    this.itemActor = borrowSupplyActor(
      this.itemActor, this.environment.supplies, instanceId,
    );
    return this.itemActor !== null;
  }

  private releaseItemActor(): void {
    this.itemActor = releaseSupplyActor(this.itemActor);
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
    resolveCancelledEventAnimation(active);
  }

  private applySample(time: number): void {
    this.applyVortex();
    this.applyStreams(time);
  }

  private applyRevealCamera(progress: number): void {
    const value = Math.max(0, Math.min(1, progress));
    const enter = value * value * (3 - 2 * value);
    const returnProgress = Math.max(0, Math.min(1, (value - 0.72) / 0.28));
    const leave = 1 - returnProgress * returnProgress * (3 - 2 * returnProgress);
    this.cameraLook?.apply(-0.42 * enter * leave, -0.055 * enter * leave);
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
    const centerX = VORTEX_X + this.rimWave.displacementX * 0.08;
    const centerY = WATERLINE + this.rimWave.height + VORTEX_SURFACE_OFFSET;
    const centerZ = VORTEX_Z + this.rimWave.displacementZ * 0.08;
    this.funnel.visible = visible;
    this.funnelMaterial.opacity = Math.min(0.88, this.sample.streamStrength * 0.82);
    this.funnel.position.set(centerX, centerY - 2.72, centerZ);
    this.funnel.rotation.y = -this.sample.vortexPhase * 0.11 - time * 0.18;
    const ringOpacity = Math.min(0.54, this.sample.streamStrength * 0.5);
    this.ringMaterial.opacity = ringOpacity;
    for (let index = 0; index < this.surfaceRings.length; index += 1) {
      const ring = this.surfaceRings[index]!;
      ring.visible = visible;
      ring.position.set(centerX, centerY + index * 0.012, centerZ);
      ring.rotation.set(
        -Math.PI / 2 + this.rimWave.normal.z * 0.025,
        0,
        this.sample.vortexPhase * (0.045 + index * 0.012)
          + time * (0.12 + index * 0.035),
      );
    }
    const revealScale = Math.max(0.04, this.sample.vortexStrength);
    const flow = this.sample.streamFlow * 0.46;
    for (let index = 0; index < this.streams.length; index += 1) {
      const actor = this.streams[index]!;
      actor.mesh.visible = visible;
      if (!visible) continue;
      actor.mesh.position.set(
        centerX,
        centerY,
        centerZ,
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
    this.funnel.visible = false;
    this.funnelMaterial.opacity = 0;
    this.ringMaterial.opacity = 0;
    for (let index = 0; index < this.surfaceRings.length; index += 1) {
      this.surfaceRings[index]!.visible = false;
    }
    for (let index = 0; index < this.streams.length; index += 1) {
      this.streams[index]!.mesh.visible = false;
    }
  }
}

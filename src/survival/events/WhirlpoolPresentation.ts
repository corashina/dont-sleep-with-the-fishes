import {
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import type { ItemInstanceId } from '../../game/ItemState';
import { createWaveSample as waveSample, type WaveSample } from '../../ocean/WaveField';
import {
  disposeResourceSets,
  runCleanupSteps,
} from '../../world/SceneResources';
import type { BorrowedSupplyActor, MutableSupplyPose } from '../BoatSupplyDisplay';
import { StationaryEventCamera } from '../StationaryEventCamera';
import type {
  DedicatedEventEnvironment,
  DedicatedEventPresentation,
  EventOutcomePresentation,
  EventSceneContext,
} from '../eventPresentationTypes';
import { TimedPresentationAnimation } from '../TimedPresentationAnimation';
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
    const angle = t * Math.PI * 4.8;
    const radius = 12.4 - t * 3.75;
    const width = 0.62 - t * 0.22;
    const y = -0.9 - t * 2.2;
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
  readonly itemAimTarget = new Group();

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
    depthWrite: true,
    side: DoubleSide,
    flatShading: true,
  });
  private readonly funnel: Mesh;
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
  private readonly lostPoses: MutableSupplyPose[] = [
    { ...IDENTITY_ITEM_POSE },
    { ...IDENTITY_ITEM_POSE },
  ];
  private readonly lostActors: Array<BorrowedSupplyActor | null> = [null, null];
  private readonly animation = new TimedPresentationAnimation<
    'reveal' | 'item' | 'reaction'
  >(
    (kind, time, progress) => this.applyAnimation(kind, time, progress),
    (kind) => this.finishAnimation(kind),
    1e-9,
  );
  private activeChoiceId: string | null = null;
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
    const funnelGeometry = new CylinderGeometry(8.2, 5.2, 7.8, 32, 7, true);
    this.ownedGeometries.add(streamGeometry);
    this.ownedGeometries.add(funnelGeometry);
    this.ownedMaterials.add(this.streamMaterial);
    this.ownedMaterials.add(this.funnelMaterial);
    this.funnel = new Mesh(funnelGeometry, this.funnelMaterial);
    this.funnel.name = 'whirlpool-dark-funnel';
    this.funnel.visible = false;
    this.funnel.renderOrder = 1;
    this.worldRoot.add(this.funnel);
    this.itemAimTarget.name = 'whirlpool-item-aim-target';
    this.itemAimTarget.position.set(0, 1.45, 0);
    this.funnel.add(this.itemAimTarget);
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
    this.animation.cancel();
    this.activeChoiceId = null;
    this.cameraLook?.capture();
    sampleWhirlpoolReveal(0, this.sample);
    this.applySample(0);
    return this.animation.start('reveal', WHIRLPOOL_REVEAL_DURATION);
  }

  playItemUse(choiceId: string, _instanceId: ItemInstanceId): Promise<boolean> {
    if (this.disposed || !this.staged || !supportedChoice(choiceId)) {
      return Promise.resolve(false);
    }
    this.animation.cancel();
    this.activeChoiceId = choiceId;
    this.lastChoiceId = choiceId;
    sampleWhirlpoolItemUse(choiceId, 0, this.sample);
    this.applySample(0);
    return this.animation.start('item', WHIRLPOOL_ITEM_DURATION, {
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
        const actor = this.environment.supplies.borrowEventActor(
          lostIds[index]!,
        );
        if (actor === null) continue;
        this.lostActors[this.reactionState.lostItemCount] = actor;
        this.reactionState.lostItemCount += 1;
      }
    }

    sampleWhirlpoolReaction(this.reactionState, 0, this.sample);
    this.applySample(0);
    this.applyReactionPoses();
    return this.animation.start('reaction', WHIRLPOOL_REACTION_DURATION);
  }

  update(time: number, delta: number): void {
    if (this.disposed || !this.staged) return;
    if (this.animation.active) {
      this.animation.update(time, Number.isFinite(delta) ? delta : 0);
      return;
    }
    this.applySample(time);
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.animation.settle();
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
    time: number,
    progress: number,
  ): void {
    if (kind === 'reveal') {
      sampleWhirlpoolReveal(progress, this.sample);
    } else if (kind === 'item') {
      if (this.activeChoiceId === null) return;
      this.cameraLook?.apply(0, 0);
      sampleWhirlpoolItemUse(this.activeChoiceId, progress, this.sample);
    } else {
      this.cameraLook?.apply(0, 0);
      sampleWhirlpoolReaction(this.reactionState, progress, this.sample);
      this.applyReactionPoses();
    }
    this.applySample(time);
  }

  private finishAnimation(kind: 'reveal' | 'item' | 'reaction'): void {
    this.activeChoiceId = null;
    if (kind === 'reaction') this.releaseLostActors(true);
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
    const centerX = VORTEX_X + this.rimWave.displacementX * 0.08;
    const centerY = WATERLINE + this.rimWave.height + VORTEX_SURFACE_OFFSET;
    const centerZ = VORTEX_Z + this.rimWave.displacementZ * 0.08;
    this.funnel.visible = visible;
    this.funnel.position.set(centerX, centerY - 4.75, centerZ);
    this.funnel.rotation.y = -this.sample.vortexPhase * 0.11 - time * 0.18;
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
    for (let index = 0; index < this.streams.length; index += 1) {
      this.streams[index]!.mesh.visible = false;
    }
  }
}

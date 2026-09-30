import { Group, Vector3 } from 'three';
import { WhirlpoolVortex } from './WhirlpoolVortex';
import type { ItemInstanceId } from '../../game/ItemState';
import { createInactiveVortexWaveState, createWaveSample, type WaveSample } from '../../ocean/WaveField';
import { runCleanupSteps } from '../../world/SceneResources';
import { smoothstep } from '../animationMath';
import type { BorrowedSupplyActor, MutableSupplyPose } from '../BoatSupplyDisplay';
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
} from './whirlpoolChoreography';

const MAX_LOST_ACTORS = 2;
// Open water separates the boat from the vortex on its right.
const CENTER_X = 16;
const CENTER_Z = -14;
const CENTER_DISTANCE = Math.hypot(CENTER_X, CENTER_Z);
const RADIUS = 17;
const DEPRESSION = 6;
const TANGENT_STRENGTH = 1.2;
const THROAT_DEPTH = 7;
// Matches the ocean core cut-out at full strength.
const CORE_RADIUS = RADIUS * 0.56;
const AIM_RADIUS = CORE_RADIUS + 1.8;
const IDENTITY_ITEM_POSE: MutableSupplyPose = {
  x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scaleX: 1, scaleY: 1, scaleZ: 1,
};

function supportedChoice(choiceId: string): boolean {
  return choiceId === 'anchor' || choiceId === 'swimRing';
}

interface LostSupply {
  actor: BorrowedSupplyActor | null;
  readonly pose: MutableSupplyPose;
  /** Parent-local rest position of the borrowed supply. */
  readonly rest: Vector3;
  startAngle: number;
  startRadius: number;
}

export class WhirlpoolPresentation implements DedicatedEventPresentation {
  readonly eventId = 'whirlpool' as const;
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();
  readonly itemAimTarget = new Group();

  private readonly vortex: WhirlpoolVortex;
  private readonly surfaceWave: WaveSample = createWaveSample();
  private readonly sample = createWhirlpoolSample();
  private readonly reactionState = { lostItemCount: 0 };
  private readonly lost: LostSupply[] = Array.from({ length: MAX_LOST_ACTORS }, () => ({
    actor: null,
    pose: { ...IDENTITY_ITEM_POSE },
    rest: new Vector3(),
    startAngle: 0,
    startRadius: 0,
  }));
  private readonly scratch = new Vector3();
  private readonly animation = new TimedPresentationAnimation<'reveal' | 'item' | 'reaction'>(
    (kind, _time, progress) => this.applyAnimation(kind, progress),
    (kind) => this.finishAnimation(kind),
    1e-9,
  );
  private activeChoiceId: string | null = null;
  private waveTime = 0;
  private flowTime = 0;
  private staged = false;
  private disposed = false;

  constructor(private readonly environment: DedicatedEventEnvironment) {
    this.vortex = new WhirlpoolVortex(RADIUS, THROAT_DEPTH, environment.boatEffectsRoot);
    this.worldRoot.name = 'whirlpool-world';
    this.boatRoot.name = 'whirlpool-boat';
    this.worldRoot.position.set(CENTER_X, 0, CENTER_Z);
    this.itemAimTarget.name = 'whirlpool-item-aim-target';
    // Throws land on the near wall of the funnel.
    const aim = AIM_RADIUS / CENTER_DISTANCE;
    this.itemAimTarget.position.set(
      -CENTER_X * aim,
      -1.4,
      -CENTER_Z * aim,
    );
    this.worldRoot.add(this.vortex.root, this.itemAimTarget);
    this.hideScene();
  }

  stage(context: EventSceneContext): void {
    if (this.disposed || context.eventId !== this.eventId) return;
    this.clear();
    this.staged = true;
    this.worldRoot.visible = true;
    this.boatRoot.visible = true;
    sampleWhirlpoolReveal(this.sample);
    this.applySample(this.waveTime);
  }

  reveal(): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    this.animation.cancel();
    this.activeChoiceId = null;
    sampleWhirlpoolReveal(this.sample);
    this.applySample(this.waveTime);
    return this.animation.start('reveal', WHIRLPOOL_REVEAL_DURATION);
  }

  playItemUse(choiceId: string, _instanceId: ItemInstanceId): Promise<boolean> {
    if (this.disposed || !this.staged || !supportedChoice(choiceId)) {
      return Promise.resolve(false);
    }
    this.animation.cancel();
    this.activeChoiceId = choiceId;
    sampleWhirlpoolItemUse(this.sample);
    this.applySample(this.waveTime);
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
    this.reactionState.lostItemCount = 0;
    const selectedId = result.selectedInstanceId;
    for (const id of result.lostInstanceIds) {
      if (id === selectedId || this.reactionState.lostItemCount >= MAX_LOST_ACTORS) continue;
      const actor = this.environment.supplies.borrowEventActor(id);
      if (actor === null) continue;
      this.captureLostSupply(this.lost[this.reactionState.lostItemCount]!, actor);
      this.reactionState.lostItemCount += 1;
    }
    sampleWhirlpoolReaction(this.reactionState, 0, this.sample);
    this.applySample(this.waveTime);
    return this.animation.start('reaction', WHIRLPOOL_REACTION_DURATION);
  }

  update(time: number, delta: number): void {
    if (this.disposed || !this.staged) return;
    const safeDelta = Number.isFinite(delta) && delta > 0 ? delta : 0;
    if (this.animation.active) this.animation.update(time, safeDelta);
    this.flowTime += safeDelta * (0.25 + 0.75 * this.sample.strength);
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
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.animation.cancel();
    this.activeChoiceId = null;
    runCleanupSteps([
      () => this.releaseLostActors(false),
      () => this.resetPresentationState(),
      () => this.boatRoot.clear(),
      () => this.worldRoot.clear(),
      () => this.boatRoot.removeFromParent(),
      () => this.worldRoot.removeFromParent(),
      () => this.vortex.dispose(),
    ]);
  }

  private captureLostSupply(lost: LostSupply, actor: BorrowedSupplyActor): void {
    lost.actor = actor;
    actor.applyPose(IDENTITY_ITEM_POSE);
    lost.rest.copy(actor.root.position);
    actor.root.getWorldPosition(this.scratch);
    lost.startAngle = Math.atan2(this.scratch.z - CENTER_Z, this.scratch.x - CENTER_X);
    lost.startRadius = Math.hypot(this.scratch.x - CENTER_X, this.scratch.z - CENTER_Z);
  }

  private releaseLostActors(onNextSync: boolean): void {
    for (const lost of this.lost) {
      const actor = lost.actor;
      lost.actor = null;
      if (onNextSync) actor?.releaseOnNextSync();
      else actor?.release();
    }
  }

  private applyAnimation(kind: 'reveal' | 'item' | 'reaction', progress: number): void {
    if (kind === 'reveal') {
      sampleWhirlpoolReveal(this.sample);
    } else if (kind === 'item') {
      if (this.activeChoiceId === null) return;
      sampleWhirlpoolItemUse(this.sample);
    } else {
      sampleWhirlpoolReaction(this.reactionState, progress, this.sample);
    }
  }

  private finishAnimation(kind: 'reveal' | 'item' | 'reaction'): void {
    this.activeChoiceId = null;
    if (kind === 'reaction') this.releaseLostActors(true);
  }

  private applySample(time: number): void {
    if (Number.isFinite(time)) this.waveTime = time;
    const vortex = this.environment.vortexWave;
    vortex.centerX = CENTER_X;
    vortex.centerZ = CENTER_Z;
    vortex.radius = RADIUS;
    vortex.depression = DEPRESSION;
    vortex.tangentStrength = TANGENT_STRENGTH;
    vortex.phase = this.flowTime * 1.6;
    vortex.strength = this.sample.strength;
    this.vortex.update(
      this.waveTime,
      this.environment.readWorldWaveAmplitudeScale(),
      this.flowTime,
      vortex,
    );
    this.applyLostPoses();
  }

  private applyLostPoses(): void {
    const travel = this.sample.supplyTravel;
    if (travel <= 0) return;
    const amplitude = this.environment.readWorldWaveAmplitudeScale();
    for (let index = 0; index < this.reactionState.lostItemCount; index += 1) {
      const lost = this.lost[index]!;
      const actor = lost.actor;
      const parent = actor?.root.parent;
      if (actor === null || parent === null || parent === undefined) continue;
      const u = Math.max(0, Math.min(1, travel * 1.2 - index * 0.2));
      const radius = lost.startRadius * Math.pow(1 - u, 0.75);
      const angle = lost.startAngle + u * (3.2 + index * 0.6);
      const x = CENTER_X + Math.cos(angle) * radius;
      const z = CENTER_Z + Math.sin(angle) * radius;
      this.environment.sampleWorldWaveInto(this.surfaceWave, this.waveTime, x, z, amplitude);
      const inside = Math.max(0, 1 - radius / CORE_RADIUS);
      const y = this.surfaceWave.height + 0.1
        - THROAT_DEPTH * this.sample.strength * Math.pow(inside, 1.7);
      parent.updateWorldMatrix(true, false);
      parent.worldToLocal(this.scratch.set(x, y, z));
      const pose = lost.pose;
      pose.x = this.scratch.x - lost.rest.x;
      pose.y = this.scratch.y - lost.rest.y;
      pose.z = this.scratch.z - lost.rest.z;
      pose.yaw = u * (5 + index);
      pose.pitch = u * 0.8;
      pose.roll = u * (index === 0 ? -2.4 : 2.1);
      const scale = 1 - smoothstep((u - 0.7) / 0.3);
      pose.scaleX = scale;
      pose.scaleY = scale;
      pose.scaleZ = scale;
      actor.applyPose(pose);
    }
  }

  private resetPresentationState(): void {
    this.staged = false;
    this.reactionState.lostItemCount = 0;
    this.waveTime = 0;
    this.flowTime = 0;
    resetWhirlpoolSample(this.sample);
    this.hideScene();
    Object.assign(this.environment.vortexWave, createInactiveVortexWaveState());
    this.vortex.update(0, 1, 0, this.environment.vortexWave);
  }

  private hideScene(): void {
    this.worldRoot.visible = false;
    this.boatRoot.visible = false;
  }
}

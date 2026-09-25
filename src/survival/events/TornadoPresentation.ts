import { Group } from 'three';
import { TornadoVortex } from './TornadoVortex';
import type { ItemInstanceId } from '../../game/ItemState';
import { createWaveSample as waveSample, type WaveSample } from '../../ocean/WaveField';
import { runCleanupSteps } from '../../world/SceneResources';
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

const MAX_LOST_ACTORS = 2;
const WATERLINE = 0.04;
const TORNADO_SCALE = 3;
const TORNADO_HEIGHT_SCALE = 4.2;
const TORNADO_X = 12.8;
const TORNADO_Z = -19;
const TORNADO_DISTANCE = Math.hypot(TORNADO_X, TORNADO_Z);
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

  private readonly vortex = new TornadoVortex();
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
  private flowTime = 0;
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
    this.worldRoot.scale.set(TORNADO_SCALE, TORNADO_HEIGHT_SCALE, TORNADO_SCALE);
    this.worldRoot.userData.distanceFromBoat = TORNADO_DISTANCE;

    this.itemAimTarget.name = 'tornado-item-aim-target';
    this.itemAimTarget.position.set(0, 5.25, 0);
    this.worldRoot.add(this.vortex.root, this.itemAimTarget);
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
      this.flowTime += safeDelta * this.sample.spinRate;
      this.applySample(time);
      return;
    }
    this.flowTime += safeDelta * this.sample.spinRate;
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
      () => this.vortex.dispose(),
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
    this.vortex.update(this.flowTime, this.sample.visibility, this.sample.effectStrength, this.sample.funnelScale);
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
    this.flowTime = 0;
    resetTornadoSample(this.sample);
    this.hideScene();
  }

  private hideScene(): void {
    this.worldRoot.visible = false;
    this.boatRoot.visible = false;
    this.vortex.update(0, 0, 0, 1);
  }
}

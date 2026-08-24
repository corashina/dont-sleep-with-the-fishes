import type { Object3D, PerspectiveCamera } from 'three';
import type { ItemInstanceId } from '../game/ItemState';
import type { MoonFacePresentation, Skybox } from '../world/Skybox';
import { runCleanupSteps } from '../world/SceneResources';
import type { BoatCameraController } from './BoatCameraController';
import type { BoatSupplyDisplay } from './BoatSupplyDisplay';
import {
  sampleEventPhysicalResponsePose,
  type EventPhysicalResponsePose,
} from './eventPhysicalResponseChoreography';
import type {
  EventOutcomePresentation,
  EventPresentationContext,
} from './eventPresentationTypes';
import type { ActionOutcome, ItemCondition } from './survivalTypes';

const MOON_FACE_REVEAL_DURATION = 5.8;
const MOON_FACE_REACTION_DURATION = 1.1;
const MOON_FACE_HOLD_FRACTION = 0.2;
const MOON_FACE_SHOCK_START = 0.7;
const MOON_FACE_SHOCK_END = 0.84;
const MOON_FACE_BASE_GRIN = 0.74;
const MOON_FACE_STAR_SCALE = 0.16;
const MOON_FACE_MOON_SCALE = 4.15;
const MOON_FACE_BASE_DIM = 0.18;
const MOON_FACE_PRESSURE_GRIN = 0.96;
const MOON_FACE_ENERGY_DIM = 0.48;
const MOON_FACE_CAMERA_LOWER = 0.2;
const MOON_ITEM_AIM_DISTANCE = 60;
const MOON_ITEM_AIM_DIRECTION = Object.freeze({ x: 0, y: 0.24, z: -1 });

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));
const easeInOut = (value: number): number => value * value * (3 - 2 * value);
const smootherStep = (value: number): number =>
  value * value * value * (value * (value * 6 - 15) + 10);

export interface MoonEventPresentationEnvironment {
  readonly sky: Pick<Skybox, 'resetTransient' | 'setMoonFace'>;
  readonly camera: PerspectiveCamera;
  readonly cameraControl: Pick<BoatCameraController, 'restoreBasePose'>;
  readonly supplies: Pick<
    BoatSupplyDisplay,
    'clearEventPose' | 'pinEventActor' | 'applyEventItemPose' | 'releaseEventActor'
  >;
  readonly itemAimTarget: Object3D;
}

interface MoonPhysicalResponseActor {
  readonly instanceId: ItemInstanceId;
  readonly choiceId: string;
  readonly condition: ItemCondition;
}

interface MutableMoonFacePresentation {
  reveal: number;
  grin: number;
  starScale: number;
  dim: number;
  scale: number;
}

interface ActiveMoonAnimation {
  readonly kind: 'reveal' | 'reaction';
  elapsed: number;
  readonly duration: number;
  readonly fromReveal: number;
  readonly fromGrin: number;
  readonly fromStarScale: number;
  readonly fromDim: number;
  readonly fromMoonScale: number;
  readonly fromCameraLower: number;
  readonly targetReveal: number;
  readonly targetGrin: number;
  readonly targetStarScale: number;
  readonly targetDim: number;
  readonly targetMoonScale: number;
  readonly targetCameraLower: number;
  readonly responseActor: MoonPhysicalResponseActor | null;
  readonly resolve: () => void;
}

export class MoonEventPresentation {
  readonly itemAimTarget: Object3D;
  private activeAnimation: ActiveMoonAnimation | null = null;
  private readonly face: MutableMoonFacePresentation = {
    reveal: 0,
    grin: 0,
    starScale: 1,
    dim: 0,
    scale: 1,
  };
  private readonly display: MutableMoonFacePresentation = {
    reveal: 0,
    grin: 0,
    starScale: 1,
    dim: 0,
    scale: 1,
  };
  private readonly physicalResponsePose: EventPhysicalResponsePose = {
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
  private pulseElapsed = 0;
  private cameraLower = 0;
  private staged = false;
  private disposed = false;

  constructor(private readonly environment: MoonEventPresentationEnvironment) {
    this.itemAimTarget = environment.itemAimTarget;
    this.itemAimTarget.name = 'moon-event-item-aim-target';
    this.itemAimTarget.position
      .set(
        MOON_ITEM_AIM_DIRECTION.x,
        MOON_ITEM_AIM_DIRECTION.y,
        MOON_ITEM_AIM_DIRECTION.z,
      )
      .normalize()
      .multiplyScalar(MOON_ITEM_AIM_DISTANCE);
  }

  stage(context: EventPresentationContext): void {
    if (this.disposed) return;
    runCleanupSteps([
      () => this.cancelAnimation(),
      () => {
        this.staged = context.eventId === 'face-on-the-moon';
        this.resetValues();
      },
      () => this.environment.sky.resetTransient(),
      () => this.environment.cameraControl.restoreBasePose(),
    ]);
  }

  reveal(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.staged) this.stageMoon();
    this.cancelAnimation();
    this.resetValues();
    return new Promise((resolve) => {
      this.activeAnimation = {
        kind: 'reveal',
        elapsed: 0,
        duration: MOON_FACE_REVEAL_DURATION,
        fromReveal: 0,
        fromGrin: 0,
        fromStarScale: 1,
        fromDim: 0,
        fromMoonScale: 1,
        fromCameraLower: 0,
        targetReveal: 1,
        targetGrin: MOON_FACE_BASE_GRIN,
        targetStarScale: MOON_FACE_STAR_SCALE,
        targetDim: MOON_FACE_BASE_DIM,
        targetMoonScale: MOON_FACE_MOON_SCALE,
        targetCameraLower: 0,
        responseActor: null,
        resolve,
      };
    });
  }

  react(
    result: EventOutcomePresentation,
    outcome: ActionOutcome,
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (!this.staged) this.stageMoon();
    this.cancelAnimation();
    const pressureGain = (outcome.deltas.pressure ?? 0) > 0;
    const energyLoss = (outcome.deltas.energy ?? 0) < 0;
    const responseActor = this.preparePhysicalResponse(result, outcome);
    if (!pressureGain && !energyLoss && responseActor === null) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.activeAnimation = {
        kind: 'reaction',
        elapsed: 0,
        duration: MOON_FACE_REACTION_DURATION,
        fromReveal: this.face.reveal,
        fromGrin: this.face.grin,
        fromStarScale: this.face.starScale,
        fromDim: this.face.dim,
        fromMoonScale: this.face.scale,
        fromCameraLower: this.cameraLower,
        targetReveal: 1,
        targetGrin: pressureGain
          ? Math.max(this.face.grin, MOON_FACE_PRESSURE_GRIN)
          : this.face.grin,
        targetStarScale: this.face.starScale,
        targetDim: energyLoss
          ? Math.max(this.face.dim, MOON_FACE_ENERGY_DIM)
          : this.face.dim,
        targetMoonScale: this.face.scale,
        targetCameraLower: energyLoss
          ? Math.max(this.cameraLower, MOON_FACE_CAMERA_LOWER)
          : this.cameraLower,
        responseActor,
        resolve,
      };
    });
  }

  update(_time: number, delta: number): void {
    if (this.disposed || !this.staged) return;
    const step = Math.max(0, Number.isFinite(delta) ? delta : 0);
    this.pulseElapsed += step;
    const animation = this.activeAnimation;
    if (animation !== null) {
      animation.elapsed = Math.min(animation.duration, animation.elapsed + step);
      const progress = animation.elapsed / animation.duration;
      if (animation.kind === 'reveal') {
        this.updateReveal(progress);
      } else {
        this.updateReaction(animation, progress);
      }
      if (progress >= 1) {
        this.finishAndApplyPresentation();
        return;
      }
    }
    this.applyPresentation();
  }

  settleForVisibilityChange(): void {
    if (this.disposed || this.activeAnimation === null) return;
    this.finishAndApplyPresentation();
  }

  clear(): void {
    if (this.disposed) return;
    runCleanupSteps([
      () => this.cancelAnimation(),
      () => {
        this.staged = false;
        this.resetValues();
      },
      () => this.environment.sky.resetTransient(),
      () => this.environment.cameraControl.restoreBasePose(),
    ]);
  }

  dispose(): void {
    if (this.disposed) return;
    try {
      this.clear();
    } finally {
      this.disposed = true;
    }
  }

  private stageMoon(): void {
    this.staged = true;
    this.resetValues();
    this.environment.sky.resetTransient();
    this.environment.cameraControl.restoreBasePose();
  }

  private preparePhysicalResponse(
    result: EventOutcomePresentation,
    outcome: ActionOutcome,
  ): MoonPhysicalResponseActor | null {
    const instanceId = result.selectedInstanceId;
    const condition = result.selectedCondition;
    const choiceId = outcome.eventResult?.choiceId;
    if (instanceId === null || condition === null || choiceId === undefined) return null;
    const actor: MoonPhysicalResponseActor = { instanceId, choiceId, condition };
    if (!sampleEventPhysicalResponsePose(
      'face-on-the-moon',
      actor,
      0,
      this.physicalResponsePose,
    )) return null;
    this.environment.supplies.clearEventPose();
    return this.environment.supplies.pinEventActor(instanceId) ? actor : null;
  }

  private updateReveal(progress: number): void {
    const revealProgress = smootherStep(clamp(
      (progress - MOON_FACE_HOLD_FRACTION) / (1 - MOON_FACE_HOLD_FRACTION),
      0,
      1,
    ));
    const faceProgress = smootherStep(clamp(
      (revealProgress - MOON_FACE_SHOCK_START)
        / (MOON_FACE_SHOCK_END - MOON_FACE_SHOCK_START),
      0,
      1,
    ));
    const grinProgress = smootherStep(clamp(
      (faceProgress - 0.52) / 0.48,
      0,
      1,
    ));
    this.face.reveal = faceProgress;
    this.face.grin = MOON_FACE_BASE_GRIN * grinProgress;
    this.face.starScale = 1
      - (1 - MOON_FACE_STAR_SCALE) * easeInOut(revealProgress);
    this.face.dim = MOON_FACE_BASE_DIM * easeInOut(revealProgress);
    this.face.scale = 1
      + (MOON_FACE_MOON_SCALE - 1) * easeInOut(revealProgress);
  }

  private updateReaction(animation: ActiveMoonAnimation, progress: number): void {
    const eased = easeInOut(progress);
    this.face.reveal = animation.fromReveal
      + (animation.targetReveal - animation.fromReveal) * eased;
    this.face.grin = animation.fromGrin
      + (animation.targetGrin - animation.fromGrin) * eased;
    this.face.starScale = animation.fromStarScale
      + (animation.targetStarScale - animation.fromStarScale) * eased;
    this.face.dim = animation.fromDim
      + (animation.targetDim - animation.fromDim) * eased;
    this.face.scale = animation.fromMoonScale
      + (animation.targetMoonScale - animation.fromMoonScale) * eased;
    this.cameraLower = animation.fromCameraLower
      + (animation.targetCameraLower - animation.fromCameraLower) * eased;
    const actor = animation.responseActor;
    if (
      actor !== null
      && sampleEventPhysicalResponsePose(
        'face-on-the-moon',
        actor,
        progress,
        this.physicalResponsePose,
      )
    ) {
      this.environment.supplies.applyEventItemPose(
        actor.instanceId,
        this.physicalResponsePose,
      );
    }
  }

  private finishAnimation(): void {
    const animation = this.activeAnimation;
    if (animation === null) return;
    this.activeAnimation = null;
    this.face.reveal = animation.targetReveal;
    this.face.grin = animation.targetGrin;
    this.face.starScale = animation.targetStarScale;
    this.face.dim = animation.targetDim;
    this.face.scale = animation.targetMoonScale;
    this.cameraLower = animation.targetCameraLower;
    try {
      this.releasePhysicalResponse(animation);
    } finally {
      animation.resolve();
    }
  }

  private finishAndApplyPresentation(): void {
    let firstError: unknown;
    let failed = false;
    try {
      this.finishAnimation();
    } catch (error) {
      failed = true;
      firstError = error;
    }
    try {
      this.applyPresentation();
    } catch (error) {
      if (!failed) {
        failed = true;
        firstError = error;
      }
    }
    if (failed) throw firstError;
  }

  private resetValues(): void {
    this.face.reveal = 0;
    this.face.grin = 0;
    this.face.starScale = 1;
    this.face.dim = 0;
    this.face.scale = 1;
    this.cameraLower = 0;
    this.pulseElapsed = 0;
  }

  private applyPresentation(): void {
    const twitchGate = Math.max(0, Math.sin(this.pulseElapsed * 0.61 - 1.1));
    const pulse = this.face.reveal * (
      Math.sin(this.pulseElapsed * 1.13) * 0.018
      + Math.sin(this.pulseElapsed * 4.73 + 1.1) * 0.01
      + Math.pow(twitchGate, 18) * 0.055
    );
    this.display.reveal = this.face.reveal;
    this.display.grin = clamp(
      this.face.grin + pulse,
      0,
      MOON_FACE_PRESSURE_GRIN,
    );
    this.display.starScale = this.face.starScale;
    this.display.dim = this.face.dim;
    this.display.scale = this.face.scale;
    this.environment.sky.setMoonFace(this.display);
    this.environment.camera.rotateX(this.cameraLower);
  }

  private cancelAnimation(): void {
    const animation = this.activeAnimation;
    this.activeAnimation = null;
    if (animation === null) return;
    try {
      this.releasePhysicalResponse(animation);
    } finally {
      animation.resolve();
    }
  }

  private releasePhysicalResponse(animation: ActiveMoonAnimation): void {
    if (animation.responseActor === null) return;
    runCleanupSteps([
      () => this.environment.supplies.clearEventPose(),
      () => this.environment.supplies.releaseEventActor(),
    ]);
  }
}

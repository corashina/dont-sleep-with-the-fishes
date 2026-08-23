import {
  type Group,
  Matrix4,
  type Object3D,
  type PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';
import type { TimedAnimation } from './animationMath';

const DRIFTING_ITEM_CAMERA_DURATION = 1.1;
const REAR_CAMERA_TURN_DURATION = 0.65;
const REAR_CAMERA_PITCH = -0.75;
const BASE_CAMERA_POSITION = Object.freeze({ x: 0, y: 0.88, z: 1.56 });
const DRIFTING_ITEM_CAMERA_POSITION = Object.freeze({ x: 0, y: 1.38, z: -1.42 });

type DriftingItemCameraPhase = 'idle' | 'entering' | 'focused' | 'returning';
type DriftingItemCameraAnimation = TimedAnimation<'enter' | 'return'>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function easeInOut(value: number): number {
  return value * value * (3 - 2 * value);
}

function smootherStep(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

export class BoatCameraController {
  private readonly basePosition = new Vector3(
    BASE_CAMERA_POSITION.x,
    BASE_CAMERA_POSITION.y,
    BASE_CAMERA_POSITION.z,
  );
  private readonly baseQuaternion = new Quaternion();
  private readonly driftingPosition = new Vector3(
    DRIFTING_ITEM_CAMERA_POSITION.x,
    DRIFTING_ITEM_CAMERA_POSITION.y,
    DRIFTING_ITEM_CAMERA_POSITION.z,
  );
  private readonly driftingStartPosition = new Vector3();
  private readonly driftingStartQuaternion = new Quaternion();
  private readonly driftingTargetQuaternion = new Quaternion();
  private readonly worldTarget = new Vector3();
  private readonly worldPosition = new Vector3();
  private readonly parentQuaternion = new Quaternion();
  private readonly lookMatrix = new Matrix4();
  private rearYaw = 0;
  private rearPitch = 0;
  private rearTurnStartYaw = 0;
  private rearTurnStartPitch = 0;
  private rearTurnTargetYaw = 0;
  private rearTurnTargetPitch = 0;
  private rearTurnElapsed = REAR_CAMERA_TURN_DURATION;
  private driftingTarget: Object3D | null = null;
  private driftingPhase: DriftingItemCameraPhase = 'idle';
  private activeDriftingAnimation: DriftingItemCameraAnimation | null = null;
  private disposed = false;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly cameraRig: Group,
    baseLookTarget: Readonly<Vector3>,
  ) {
    this.camera.position.copy(this.basePosition);
    this.camera.lookAt(baseLookTarget.x, baseLookTarget.y, baseLookTarget.z);
    this.baseQuaternion.copy(this.camera.quaternion);
  }

  setRearView(rear: boolean, instant = false): void {
    if (this.disposed) return;
    const targetYaw = rear ? Math.PI : 0;
    const targetPitch = rear ? REAR_CAMERA_PITCH : 0;
    if (instant) {
      this.rearYaw = targetYaw;
      this.rearPitch = targetPitch;
      this.rearTurnStartYaw = targetYaw;
      this.rearTurnStartPitch = targetPitch;
      this.rearTurnTargetYaw = targetYaw;
      this.rearTurnTargetPitch = targetPitch;
      this.rearTurnElapsed = REAR_CAMERA_TURN_DURATION;
      return;
    }
    if (targetYaw === this.rearTurnTargetYaw) return;
    this.rearTurnStartYaw = this.rearYaw;
    this.rearTurnStartPitch = this.rearPitch;
    this.rearTurnTargetYaw = targetYaw;
    this.rearTurnTargetPitch = targetPitch;
    this.rearTurnElapsed = 0;
  }

  beginDriftingItemView(target: Object3D): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.cancelDriftingAnimation();
    this.driftingTarget = target;
    this.driftingStartPosition.copy(this.camera.position);
    this.driftingStartQuaternion.copy(this.camera.quaternion);
    this.updateDriftingTarget();
    this.driftingPhase = 'entering';
    return this.startDriftingAnimation('enter');
  }

  endDriftingItemView(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (
      this.driftingPhase === 'idle'
      && this.activeDriftingAnimation === null
    ) {
      this.restoreBasePose();
      return Promise.resolve();
    }
    this.cancelDriftingAnimation();
    this.driftingStartPosition.copy(this.camera.position);
    this.driftingStartQuaternion.copy(this.camera.quaternion);
    this.driftingPhase = 'returning';
    return this.startDriftingAnimation('return');
  }

  restoreBasePose(): void {
    if (this.disposed) return;
    this.applyExactBasePose();
  }

  cancelDriftingItemView(): void {
    if (this.disposed) return;
    this.cancelDriftingAnimation();
    this.driftingPhase = 'idle';
    this.driftingTarget = null;
    this.applyExactBasePose();
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    const animation = this.activeDriftingAnimation;
    if (animation === null) return;
    this.activeDriftingAnimation = null;
    this.applyDriftingAnimation(animation.kind, 1);
    this.finishDriftingAnimation(animation.kind);
    animation.resolve();
  }

  update(delta: number): void {
    if (this.disposed) return;
    this.advanceRearTurn(delta);
    this.cameraRig.position.set(0, 0, 0);
    this.cameraRig.rotation.set(0, 0, 0);
    this.applyBasePresentationPose();
  }

  updateDriftingItemView(delta: number, target: Object3D | null): void {
    if (this.disposed) return;
    if (!this.prepareCurrentDriftingTarget(target)) return;
    this.advanceDriftingAnimation(delta);
  }

  applyDriftingItemView(target: Object3D | null): void {
    if (this.disposed) return;
    if (!this.prepareCurrentDriftingTarget(target)) return;
    this.applyDriftingPose();
  }

  requiresDriftingItemTarget(): boolean {
    return !this.disposed && (
      this.driftingPhase === 'entering'
      || this.driftingPhase === 'focused'
    );
  }

  interpolateToBasePose(
    startPosition: Readonly<Vector3>,
    startQuaternion: Readonly<Quaternion>,
    progress: number,
  ): void {
    if (this.disposed) return;
    this.camera.position.lerpVectors(startPosition, this.basePosition, progress);
    this.camera.quaternion.copy(startQuaternion).slerp(this.baseQuaternion, progress);
  }

  copyBaseQuaternion(target: Quaternion): Quaternion {
    return target.copy(this.baseQuaternion);
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancelDriftingAnimation();
    this.driftingPhase = 'idle';
    this.driftingTarget = null;
    this.applyExactBasePose();
    this.disposed = true;
  }

  private advanceRearTurn(delta: number): void {
    if (this.rearTurnElapsed >= REAR_CAMERA_TURN_DURATION) return;
    this.rearTurnElapsed = Math.min(
      REAR_CAMERA_TURN_DURATION,
      this.rearTurnElapsed + delta,
    );
    const progress = easeInOut(this.rearTurnElapsed / REAR_CAMERA_TURN_DURATION);
    this.rearYaw = this.rearTurnStartYaw
      + (this.rearTurnTargetYaw - this.rearTurnStartYaw) * progress;
    this.rearPitch = this.rearTurnStartPitch
      + (this.rearTurnTargetPitch - this.rearTurnStartPitch) * progress;
  }

  private applyBasePresentationPose(): void {
    this.applyExactBasePose();
    this.camera.rotateY(this.rearYaw);
    this.camera.rotateX(this.rearPitch);
  }

  private applyExactBasePose(): void {
    this.camera.position.copy(this.basePosition);
    this.camera.quaternion.copy(this.baseQuaternion);
  }

  private startDriftingAnimation(kind: 'enter' | 'return'): Promise<void> {
    this.cancelDriftingAnimation();
    return new Promise<void>((resolve) => {
      this.activeDriftingAnimation = {
        kind,
        duration: DRIFTING_ITEM_CAMERA_DURATION,
        elapsed: 0,
        resolve,
      };
      this.applyDriftingAnimation(kind, 0);
    });
  }

  private advanceDriftingAnimation(delta: number): void {
    const animation = this.activeDriftingAnimation;
    if (animation === null) {
      this.applyDriftingPose();
      return;
    }
    animation.elapsed = Math.min(animation.duration, animation.elapsed + delta);
    const progress = animation.duration <= 0 ? 1 : animation.elapsed / animation.duration;
    this.applyDriftingAnimation(animation.kind, progress);
    if (progress < 1) return;
    this.activeDriftingAnimation = null;
    this.finishDriftingAnimation(animation.kind);
    animation.resolve();
  }

  private applyDriftingPose(): void {
    if (this.driftingPhase !== 'focused') return;
    this.camera.position.copy(this.driftingPosition);
    this.camera.quaternion.copy(this.driftingTargetQuaternion);
  }

  private applyDriftingAnimation(kind: 'enter' | 'return', progress: number): void {
    const travel = smootherStep(clamp(progress, 0, 1));
    if (kind === 'enter') {
      this.camera.position.lerpVectors(
        this.driftingStartPosition,
        this.driftingPosition,
        travel,
      );
      this.camera.quaternion.copy(this.driftingStartQuaternion)
        .slerp(this.driftingTargetQuaternion, travel);
      return;
    }
    this.interpolateToBasePose(
      this.driftingStartPosition,
      this.driftingStartQuaternion,
      travel,
    );
  }

  private finishDriftingAnimation(kind: 'enter' | 'return'): void {
    if (kind === 'enter') {
      this.driftingPhase = 'focused';
      this.applyDriftingPose();
      return;
    }
    this.driftingPhase = 'idle';
    this.driftingTarget = null;
    this.applyExactBasePose();
  }

  private updateDriftingTarget(): boolean {
    const target = this.driftingTarget;
    if (target === null) return false;
    target.getWorldPosition(this.worldTarget);
    this.worldPosition.copy(this.driftingPosition);
    const parent = this.camera.parent;
    if (parent !== null) parent.localToWorld(this.worldPosition);
    this.lookMatrix.lookAt(
      this.worldPosition,
      this.worldTarget,
      this.camera.up,
    );
    this.driftingTargetQuaternion.setFromRotationMatrix(this.lookMatrix);
    if (parent !== null) {
      parent.getWorldQuaternion(this.parentQuaternion).invert();
      this.driftingTargetQuaternion.premultiply(this.parentQuaternion);
    }
    return true;
  }

  private prepareCurrentDriftingTarget(target: Object3D | null): boolean {
    if (
      this.driftingPhase !== 'entering'
      && this.driftingPhase !== 'focused'
    ) {
      return true;
    }
    this.driftingTarget = target;
    if (this.updateDriftingTarget()) return true;
    this.cancelDriftingItemView();
    return false;
  }

  private cancelDriftingAnimation(): void {
    const animation = this.activeDriftingAnimation;
    this.activeDriftingAnimation = null;
    animation?.resolve();
  }
}

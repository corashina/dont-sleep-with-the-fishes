import {
  type Group,
  Matrix4,
  type Object3D,
  type PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';
import type { TimedAnimation } from './animationMath';

const FOCUSED_EVENT_CAMERA_DURATION = 1.1;
const REAR_CAMERA_TURN_DURATION = 0.65;
const REAR_CAMERA_PITCH = -0.75;
const BASE_CAMERA_POSITION = Object.freeze({ x: 0, y: 0.88, z: 1.56 });
const FOCUSED_EVENT_CAMERA_POSITION = Object.freeze({ x: 0, y: 1.38, z: -1.42 });

type FocusedEventCameraPhase = 'idle' | 'entering' | 'focused' | 'returning';
type FocusedEventCameraAnimation = TimedAnimation<'enter' | 'return'>;

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
  private readonly focusedEventPosition = new Vector3(
    FOCUSED_EVENT_CAMERA_POSITION.x,
    FOCUSED_EVENT_CAMERA_POSITION.y,
    FOCUSED_EVENT_CAMERA_POSITION.z,
  );
  private readonly focusedEventStartPosition = new Vector3();
  private readonly focusedEventStartQuaternion = new Quaternion();
  private readonly focusedEventTargetQuaternion = new Quaternion();
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
  private itemAnimationLabYaw = 0;
  private itemAnimationLabPitch = 0;
  private focusedEventTarget: Object3D | null = null;
  private focusedEventPhase: FocusedEventCameraPhase = 'idle';
  private activeFocusedEventAnimation: FocusedEventCameraAnimation | null = null;
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

  setItemAnimationLabLook(yaw: number, pitch: number): void {
    if (this.disposed) return;
    this.itemAnimationLabYaw = yaw;
    this.itemAnimationLabPitch = pitch;
  }

  beginFocusedEventView(target: Object3D): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.cancelFocusedEventAnimation();
    this.focusedEventTarget = target;
    this.focusedEventStartPosition.copy(this.camera.position);
    this.focusedEventStartQuaternion.copy(this.camera.quaternion);
    this.updateFocusedEventTarget();
    this.focusedEventPhase = 'entering';
    return this.startFocusedEventAnimation('enter');
  }

  endFocusedEventView(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (
      this.focusedEventPhase === 'idle'
      && this.activeFocusedEventAnimation === null
    ) {
      this.restoreBasePose();
      return Promise.resolve();
    }
    this.cancelFocusedEventAnimation();
    this.focusedEventStartPosition.copy(this.camera.position);
    this.focusedEventStartQuaternion.copy(this.camera.quaternion);
    this.focusedEventPhase = 'returning';
    return this.startFocusedEventAnimation('return');
  }

  restoreBasePose(): void {
    if (this.disposed) return;
    this.applyExactBasePose();
  }

  cancelFocusedEventView(): void {
    if (this.disposed) return;
    this.cancelFocusedEventAnimation();
    this.focusedEventPhase = 'idle';
    this.focusedEventTarget = null;
    this.applyExactBasePose();
  }

  handoffFocusedEventView(): void {
    if (this.disposed) return;
    this.cancelFocusedEventAnimation();
    this.focusedEventPhase = 'idle';
    this.focusedEventTarget = null;
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    const animation = this.activeFocusedEventAnimation;
    if (animation === null) return;
    this.activeFocusedEventAnimation = null;
    this.applyFocusedEventAnimation(animation.kind, 1);
    this.finishFocusedEventAnimation(animation.kind);
    animation.resolve();
  }

  update(delta: number): void {
    if (this.disposed) return;
    this.advanceRearTurn(delta);
    this.cameraRig.position.set(0, 0, 0);
    this.cameraRig.rotation.set(0, 0, 0);
    this.applyBasePresentationPose();
  }

  updateFocusedEventView(delta: number, target: Object3D | null): void {
    if (this.disposed) return;
    if (!this.prepareCurrentFocusedEventTarget(target)) return;
    this.advanceFocusedEventAnimation(delta);
  }

  applyFocusedEventView(target: Object3D | null): void {
    if (this.disposed) return;
    if (!this.prepareCurrentFocusedEventTarget(target)) return;
    this.applyFocusedEventPose();
  }

  requiresFocusedEventTarget(): boolean {
    return !this.disposed && (
      this.focusedEventPhase === 'entering'
      || this.focusedEventPhase === 'focused'
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
    this.cancelFocusedEventAnimation();
    this.focusedEventPhase = 'idle';
    this.focusedEventTarget = null;
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
    this.camera.rotateY(this.itemAnimationLabYaw);
    this.camera.rotateX(this.itemAnimationLabPitch);
  }

  private applyExactBasePose(): void {
    this.camera.position.copy(this.basePosition);
    this.camera.quaternion.copy(this.baseQuaternion);
  }

  private startFocusedEventAnimation(kind: 'enter' | 'return'): Promise<void> {
    this.cancelFocusedEventAnimation();
    return new Promise<void>((resolve) => {
      this.activeFocusedEventAnimation = {
        kind,
        duration: FOCUSED_EVENT_CAMERA_DURATION,
        elapsed: 0,
        resolve,
      };
      this.applyFocusedEventAnimation(kind, 0);
    });
  }

  private advanceFocusedEventAnimation(delta: number): void {
    const animation = this.activeFocusedEventAnimation;
    if (animation === null) {
      this.applyFocusedEventPose();
      return;
    }
    animation.elapsed = Math.min(animation.duration, animation.elapsed + delta);
    const progress = animation.duration <= 0 ? 1 : animation.elapsed / animation.duration;
    this.applyFocusedEventAnimation(animation.kind, progress);
    if (progress < 1) return;
    this.activeFocusedEventAnimation = null;
    this.finishFocusedEventAnimation(animation.kind);
    animation.resolve();
  }

  private applyFocusedEventPose(): void {
    if (this.focusedEventPhase !== 'focused') return;
    this.camera.position.copy(this.focusedEventPosition);
    this.camera.quaternion.copy(this.focusedEventTargetQuaternion);
  }

  private applyFocusedEventAnimation(kind: 'enter' | 'return', progress: number): void {
    const travel = smootherStep(clamp(progress, 0, 1));
    if (kind === 'enter') {
      this.camera.position.lerpVectors(
        this.focusedEventStartPosition,
        this.focusedEventPosition,
        travel,
      );
      this.camera.quaternion.copy(this.focusedEventStartQuaternion)
        .slerp(this.focusedEventTargetQuaternion, travel);
      return;
    }
    this.interpolateToBasePose(
      this.focusedEventStartPosition,
      this.focusedEventStartQuaternion,
      travel,
    );
  }

  private finishFocusedEventAnimation(kind: 'enter' | 'return'): void {
    if (kind === 'enter') {
      this.focusedEventPhase = 'focused';
      this.applyFocusedEventPose();
      return;
    }
    this.focusedEventPhase = 'idle';
    this.focusedEventTarget = null;
    this.applyExactBasePose();
  }

  private updateFocusedEventTarget(): boolean {
    const target = this.focusedEventTarget;
    if (target === null) return false;
    target.getWorldPosition(this.worldTarget);
    this.worldPosition.copy(this.focusedEventPosition);
    const parent = this.camera.parent;
    if (parent !== null) parent.localToWorld(this.worldPosition);
    this.lookMatrix.lookAt(
      this.worldPosition,
      this.worldTarget,
      this.camera.up,
    );
    this.focusedEventTargetQuaternion.setFromRotationMatrix(this.lookMatrix);
    if (parent !== null) {
      parent.getWorldQuaternion(this.parentQuaternion).invert();
      this.focusedEventTargetQuaternion.premultiply(this.parentQuaternion);
    }
    return true;
  }

  private prepareCurrentFocusedEventTarget(target: Object3D | null): boolean {
    if (
      this.focusedEventPhase !== 'entering'
      && this.focusedEventPhase !== 'focused'
    ) {
      return true;
    }
    this.focusedEventTarget = target;
    if (this.updateFocusedEventTarget()) return true;
    this.cancelFocusedEventView();
    return false;
  }

  private cancelFocusedEventAnimation(): void {
    const animation = this.activeFocusedEventAnimation;
    this.activeFocusedEventAnimation = null;
    animation?.resolve();
  }
}

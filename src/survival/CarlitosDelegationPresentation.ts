import { type Object3D, Vector3 } from 'three';
import { ignoreCleanupError, runCleanupSteps } from '../world/SceneResources';
import type { EventSide } from './eventVariant';

const CARLITOS_DELEGATE_DURATION = 1.45;
const CARLITOS_DELEGATE_OFFSET = Object.freeze({
  x: 0.08,
  y: -0.04,
  z: 2.08,
});

interface CarlitosDelegationAnimation {
  elapsed: number;
  readonly duration: number;
  readonly direction: EventSide;
  readonly resolve: () => void;
}

export interface CarlitosDelegationActor {
  readonly root: Object3D;
  setSeatSide(side: EventSide): void;
}

const easeInOut = (value: number): number => value * value * (3 - 2 * value);

export class CarlitosDelegationPresentation {
  private readonly basePosition = new Vector3();
  private readonly baseRotation = new Vector3();
  private ambientSide: EventSide = 1;
  private eventSide: EventSide | null = null;
  private activeAnimation: CarlitosDelegationAnimation | null = null;
  private disposed = false;

  constructor(private readonly carlitos: CarlitosDelegationActor) {
    this.captureBase();
  }

  setAmbientSide(side: EventSide): void {
    if (this.disposed) return;
    this.ambientSide = side;
    if (this.eventSide === null) this.setSeatSide(side);
  }

  setEventSide(side: EventSide | null): void {
    if (this.disposed) return;
    this.finish();
    this.eventSide = side;
    this.setSeatSide(side ?? this.ambientSide);
  }

  delegate(retrieve: () => Promise<void>): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.finish();
    this.captureBase();
    const companionMotion = new Promise<void>((resolve) => {
      this.activeAnimation = {
        elapsed: 0,
        duration: CARLITOS_DELEGATE_DURATION,
        direction: this.basePosition.x < 0 ? -1 : 1,
        resolve,
      };
    });
    let lootMotion: Promise<void>;
    try {
      lootMotion = retrieve();
    } catch (error) {
      ignoreCleanupError(() => this.finish());
      return Promise.reject(error);
    }
    return Promise.all([companionMotion, lootMotion]).then(() => undefined);
  }

  update(delta: number): void {
    const animation = this.activeAnimation;
    if (this.disposed || animation === null) return;
    const safeDelta = Number.isFinite(delta) && delta > 0 ? delta : 0;
    const direction = animation.direction;
    animation.elapsed = Math.min(animation.duration, animation.elapsed + safeDelta);
    const progress = animation.duration === 0 ? 1 : animation.elapsed / animation.duration;
    let x = 0;
    let y = 0;
    let z = 0;
    let yaw = 0;
    let roll = 0;
    if (progress < 0.12) {
      const travel = easeInOut(progress / 0.12);
      x = -0.08 * travel;
      y = -0.025 * travel;
      z = -0.07 * travel;
      yaw = -0.08 * travel;
      roll = 0.1 * travel;
    } else if (progress < 0.56) {
      const travel = easeInOut((progress - 0.12) / 0.44);
      x = -0.08 + (CARLITOS_DELEGATE_OFFSET.x + 0.08) * travel;
      y = -0.025 + (CARLITOS_DELEGATE_OFFSET.y + 0.025) * travel;
      z = -0.07 + (CARLITOS_DELEGATE_OFFSET.z + 0.07) * travel;
      yaw = -0.08 + 0.28 * travel;
      roll = 0.1 - 0.18 * travel;
    } else if (progress < 0.74) {
      const pull = Math.sin((progress - 0.56) / 0.18 * Math.PI);
      x = CARLITOS_DELEGATE_OFFSET.x - pull * 0.04;
      y = CARLITOS_DELEGATE_OFFSET.y - pull * 0.025;
      z = CARLITOS_DELEGATE_OFFSET.z;
      yaw = 0.2;
      roll = -0.08 - pull * 0.08;
    } else {
      const travel = 1 - easeInOut((progress - 0.74) / 0.26);
      x = CARLITOS_DELEGATE_OFFSET.x * travel;
      y = CARLITOS_DELEGATE_OFFSET.y * travel;
      z = CARLITOS_DELEGATE_OFFSET.z * travel;
      yaw = 0.2 * travel;
      roll = -0.08 * travel;
    }
    this.carlitos.root.position.set(
      this.basePosition.x + x * direction,
      this.basePosition.y + y,
      this.basePosition.z + z,
    );
    this.carlitos.root.rotation.set(
      this.baseRotation.x,
      this.baseRotation.y + yaw * direction,
      this.baseRotation.z + roll * direction,
    );
    if (progress === 1) this.finish();
  }

  finish(): void {
    const animation = this.activeAnimation;
    if (animation === null) return;
    this.activeAnimation = null;
    runCleanupSteps([
      () => this.carlitos.root.position.copy(this.basePosition),
      () => this.carlitos.root.rotation.set(
        this.baseRotation.x,
        this.baseRotation.y,
        this.baseRotation.z,
      ),
      () => animation.resolve(),
    ]);
  }

  dispose(): void {
    if (this.disposed) return;
    try {
      this.finish();
    } finally {
      this.disposed = true;
    }
  }

  private setSeatSide(side: EventSide): void {
    this.carlitos.setSeatSide(side);
    this.captureBase();
  }

  private captureBase(): void {
    this.basePosition.copy(this.carlitos.root.position);
    this.baseRotation.set(
      this.carlitos.root.rotation.x,
      this.carlitos.root.rotation.y,
      this.carlitos.root.rotation.z,
    );
  }

}

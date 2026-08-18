import {
  Group,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';
import {
  type WaveSample,
} from '../ocean/WaveField';
import {
  projectBoatObjectBounds,
  type ProjectedBoatBounds,
} from './BoatInteraction';
import {
  smoothstepUnchecked as smoothstep,
  type TimedAnimation,
} from './animationMath';
import {
  applyDriftingWavePose,
  type DriftingWater,
} from './DriftingWaveMotion';
import type { DriftingCargoKind } from './survivalTypes';

type DriftingCargoAnimationKind = 'retrieve' | 'recede';

type ActiveDriftingCargoAnimation = TimedAnimation<DriftingCargoAnimationKind>;

export interface DriftingCargoModels {
  readonly barrel: Group;
  readonly chest: Group;
}

export interface DriftingCargoInteractionProjection {
  readonly variant: DriftingCargoKind;
  readonly bounds: ProjectedBoatBounds;
}

const FLOAT_POSITION = Object.freeze({ x: -3, y: 0.02, z: -4.2 });
const RECEDE_OFFSET = Object.freeze({ x: -1.8, y: -0.25, z: 1.6 });
const RETRIEVE_DURATIONS: Readonly<Record<DriftingCargoKind, number>> =
  Object.freeze({ barrel: 1.35, chest: 1.55 });
const RECEDE_DURATION = 0.8;

type DriftingCargoState = 'idle' | 'floating' | 'retrieving' | 'held' | 'receding';

function keyedRetrieveProgress(progress: number): number {
  if (progress < 0.14) return -0.045 * smoothstep(progress / 0.14);
  if (progress < 0.82) {
    return -0.045 + 1.085 * smoothstep((progress - 0.14) / 0.68);
  }
  return 1.04 + (1 - 1.04) * smoothstep((progress - 0.82) / 0.18);
}

export class DriftingCargoPresentation {
  readonly root = new Group();
  private readonly roots: Readonly<Record<DriftingCargoKind, Group>>;
  private readonly basePositions: Readonly<Record<DriftingCargoKind, Vector3>>;
  private readonly baseQuaternions: Readonly<Record<DriftingCargoKind, Quaternion>>;
  private readonly targetPositionScratch = new Vector3();
  private readonly animationStartPosition = new Vector3();
  private readonly quaternionScratch = new Quaternion();
  private readonly targetQuaternionScratch = new Quaternion();
  private readonly animationStartQuaternion = new Quaternion();
  private readonly waveSample: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };
  private activeAnimation: ActiveDriftingCargoAnimation | null = null;
  private activeVariant: DriftingCargoKind | null = null;
  private state: DriftingCargoState = 'idle';
  private disposed = false;

  constructor(
    models: DriftingCargoModels,
    private readonly bowTarget: Object3D,
    private readonly water: DriftingWater,
  ) {
    this.root.name = 'drifting-cargo-presentation';
    const barrel = new Group();
    barrel.name = 'drifting-barrel:model';
    barrel.position.set(FLOAT_POSITION.x, FLOAT_POSITION.y, FLOAT_POSITION.z);
    barrel.rotation.z = Math.PI / 2;
    barrel.scale.setScalar(0.9);
    barrel.visible = false;
    barrel.userData.motionSource = 'shared-wave-field';
    barrel.userData.waterlineY = 0;
    barrel.add(models.barrel);

    const chest = new Group();
    chest.name = 'drifting-chest:model';
    chest.position.set(FLOAT_POSITION.x, FLOAT_POSITION.y, FLOAT_POSITION.z);
    chest.rotation.set(0.08, -0.18, -0.06);
    chest.scale.setScalar(0.82);
    chest.visible = false;
    chest.userData.motionSource = 'shared-wave-field';
    chest.userData.waterlineY = 0;
    chest.add(models.chest);

    this.roots = { barrel, chest };
    this.basePositions = {
      barrel: barrel.position.clone(),
      chest: chest.position.clone(),
    };
    this.baseQuaternions = {
      barrel: barrel.quaternion.clone(),
      chest: chest.quaternion.clone(),
    };
    this.root.add(barrel, chest);
  }

  stage(variant: DriftingCargoKind): void {
    if (this.disposed) return;
    this.cancelActiveAnimation();
    this.activeVariant = variant;
    this.state = 'floating';
    this.resetAll();
    this.roots[variant].visible = true;
    this.applyFloatingPose(variant, 0);
  }

  reveal(): Promise<void> {
    return Promise.resolve();
  }

  retrieve(): Promise<void> {
    if (this.disposed || this.activeVariant === null) return Promise.resolve();
    const root = this.roots[this.activeVariant];
    this.animationStartPosition.copy(root.position);
    this.animationStartQuaternion.copy(root.quaternion);
    this.state = 'retrieving';
    return this.startAnimation('retrieve', RETRIEVE_DURATIONS[this.activeVariant]);
  }

  recede(): Promise<void> {
    if (this.disposed || this.activeVariant === null) return Promise.resolve();
    const root = this.roots[this.activeVariant];
    this.animationStartPosition.copy(root.position);
    this.animationStartQuaternion.copy(root.quaternion);
    this.state = 'receding';
    return this.startAnimation('recede', RECEDE_DURATION);
  }

  projectInteraction(
    camera: PerspectiveCamera,
    width: number,
    height: number,
  ): DriftingCargoInteractionProjection | null {
    if (
      this.disposed
      || this.state !== 'floating'
      || this.activeVariant === null
      || width <= 0
      || height <= 0
    ) return null;
    return {
      variant: this.activeVariant,
      bounds: projectBoatObjectBounds(
        this.roots[this.activeVariant],
        camera,
        width,
        height,
      ),
    };
  }

  interactionRoot(): Group | null {
    return this.disposed || this.state !== 'floating' || this.activeVariant === null
      ? null
      : this.roots[this.activeVariant];
  }

  itemAimTarget(): Group | null {
    return this.resultRoot();
  }

  resultRoot(): Group | null {
    return this.disposed || this.activeVariant === null
      ? null
      : this.roots[this.activeVariant];
  }

  settleForVisibilityChange(): void {
    if (this.disposed || this.activeAnimation === null || this.activeVariant === null) return;
    const animation = this.activeAnimation;
    this.activeAnimation = null;
    if (animation.kind === 'retrieve') {
      this.state = 'held';
      this.applyBowPose(this.activeVariant);
    } else if (animation.kind === 'recede') {
      this.state = 'idle';
      this.roots[this.activeVariant].visible = false;
    }
    animation.resolve();
  }

  clear(): void {
    if (this.disposed) return;
    this.cancelActiveAnimation();
    this.activeVariant = null;
    this.state = 'idle';
    this.resetAll();
  }

  update(time: number, delta: number): void {
    if (this.disposed || delta < 0) return;
    const variant = this.activeVariant;
    if (variant === null) return;

    const animation = this.activeAnimation;
    if (animation === null) {
      if (this.state === 'floating') this.applyFloatingPose(variant, time);
      else if (this.state === 'held') this.applyBowPose(variant);
      return;
    }

    animation.elapsed = Math.min(
      animation.duration,
      animation.elapsed + Math.max(0, delta),
    );
    const progress = animation.duration <= 0 ? 1 : animation.elapsed / animation.duration;
    if (animation.kind === 'retrieve') this.applyRetrievePose(variant, progress);
    else this.applyRecedePose(variant, progress);
    if (progress < 1) return;

    this.activeAnimation = null;
    if (animation.kind === 'retrieve') {
      this.state = 'held';
      this.applyBowPose(variant);
    } else {
      this.state = 'idle';
      this.resetPose(variant);
      this.roots[variant].visible = false;
    }
    animation.resolve();
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancelActiveAnimation();
    this.disposed = true;
    this.root.removeFromParent();
  }

  private startAnimation(
    kind: DriftingCargoAnimationKind,
    duration: number,
  ): Promise<void> {
    this.cancelActiveAnimation();
    return new Promise<void>((resolve) => {
      this.activeAnimation = { kind, elapsed: 0, duration, resolve };
    });
  }

  private applyFloatingPose(variant: DriftingCargoKind, time: number): void {
    applyDriftingWavePose(
      this.roots[variant],
      this.basePositions[variant],
      this.baseQuaternions[variant],
      this.waveSample,
      time,
      this.water,
    );
  }

  private applyRetrievePose(variant: DriftingCargoKind, progress: number): void {
    this.readBowPose();
    const travel = keyedRetrieveProgress(Math.min(1, Math.max(0, progress)));
    const root = this.roots[variant];
    root.position.lerpVectors(
      this.animationStartPosition,
      this.targetPositionScratch,
      travel,
    );
    root.quaternion.slerpQuaternions(
      this.animationStartQuaternion,
      this.targetQuaternionScratch,
      Math.min(1, Math.max(0, travel)),
    );
  }

  private applyRecedePose(variant: DriftingCargoKind, progress: number): void {
    const travel = smoothstep(Math.min(1, Math.max(0, progress)));
    this.targetPositionScratch.copy(this.basePositions[variant]);
    this.targetPositionScratch.x += RECEDE_OFFSET.x;
    this.targetPositionScratch.y += RECEDE_OFFSET.y;
    this.targetPositionScratch.z += RECEDE_OFFSET.z;
    const root = this.roots[variant];
    root.position.lerpVectors(
      this.animationStartPosition,
      this.targetPositionScratch,
      travel,
    );
    root.quaternion.slerpQuaternions(
      this.animationStartQuaternion,
      this.baseQuaternions[variant],
      travel,
    );
  }

  private applyBowPose(variant: DriftingCargoKind): void {
    this.readBowPose();
    this.roots[variant].position.copy(this.targetPositionScratch);
    this.roots[variant].quaternion.copy(this.targetQuaternionScratch);
  }

  private readBowPose(): void {
    this.bowTarget.getWorldPosition(this.targetPositionScratch);
    this.bowTarget.getWorldQuaternion(this.targetQuaternionScratch);
    this.root.worldToLocal(this.targetPositionScratch);
    this.root.getWorldQuaternion(this.quaternionScratch).invert();
    this.targetQuaternionScratch.premultiply(this.quaternionScratch);
  }

  private resetAll(): void {
    this.resetPose('barrel');
    this.resetPose('chest');
    this.roots.barrel.visible = false;
    this.roots.chest.visible = false;
  }

  private resetPose(variant: DriftingCargoKind): void {
    this.roots[variant].position.copy(this.basePositions[variant]);
    this.roots[variant].quaternion.copy(this.baseQuaternions[variant]);
  }

  private cancelActiveAnimation(): void {
    const animation = this.activeAnimation;
    this.activeAnimation = null;
    animation?.resolve();
  }
}

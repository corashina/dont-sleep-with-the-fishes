import {
  Group,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';
import {
  DEFAULT_WAVES,
  sampleWaveFieldInto,
  type WaveSample,
} from '../ocean/WaveField';
import {
  projectBoatObjectBounds,
  type ProjectedBoatBounds,
} from './BoatInteraction';
import {
  keyedRevealProgress,
  smoothstepUnchecked as smoothstep,
  type TimedAnimation,
} from './animationMath';
import type { DriftingLootVariant } from './survivalTypes';

type DriftingLootAnimationKind = 'reveal' | 'retrieve' | 'recede';

type ActiveDriftingLootAnimation = TimedAnimation<DriftingLootAnimationKind>;

export interface DriftingLootModels {
  readonly barrel: Group;
  readonly crate: Group;
}

export interface DriftingLootInteractionProjection {
  readonly variant: DriftingLootVariant;
  readonly bounds: ProjectedBoatBounds;
}

const FLOAT_POSITION = Object.freeze({ x: -3, y: 0.02, z: -4.2 });
const REVEAL_OFFSET = Object.freeze({ x: -1.1, y: -0.35, z: 0.3 });
const RECEDE_OFFSET = Object.freeze({ x: -1.8, y: -0.25, z: 1.6 });
const REVEAL_DURATION = 0.9;
const RETRIEVE_DURATION = 1.1;
const RECEDE_DURATION = 0.8;

type DriftingLootState = 'idle' | 'floating' | 'revealing' | 'retrieving' | 'held' | 'receding';

function keyedRetrieveProgress(progress: number): number {
  if (progress < 0.14) return -0.045 * smoothstep(progress / 0.14);
  if (progress < 0.82) {
    return -0.045 + 1.085 * smoothstep((progress - 0.14) / 0.68);
  }
  return 1.04 + (1 - 1.04) * smoothstep((progress - 0.82) / 0.18);
}

export class DriftingLootPresentation {
  readonly root = new Group();
  private readonly roots: Readonly<Record<DriftingLootVariant, Group>>;
  private readonly basePositions: Readonly<Record<DriftingLootVariant, Vector3>>;
  private readonly baseQuaternions: Readonly<Record<DriftingLootVariant, Quaternion>>;
  private readonly positionScratch = new Vector3();
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
  private activeAnimation: ActiveDriftingLootAnimation | null = null;
  private activeVariant: DriftingLootVariant | null = null;
  private state: DriftingLootState = 'idle';
  private disposed = false;

  constructor(
    models: DriftingLootModels,
    private readonly sternTarget: Object3D,
  ) {
    this.root.name = 'drifting-loot-presentation';
    const barrel = new Group();
    barrel.name = 'drifting-loot:barrel';
    barrel.position.set(FLOAT_POSITION.x, FLOAT_POSITION.y, FLOAT_POSITION.z);
    barrel.rotation.z = Math.PI / 2;
    barrel.scale.setScalar(0.9);
    barrel.visible = false;
    barrel.add(models.barrel);

    const crate = new Group();
    crate.name = 'drifting-loot:crate';
    crate.position.set(FLOAT_POSITION.x, FLOAT_POSITION.y, FLOAT_POSITION.z);
    crate.rotation.set(0.08, -0.18, -0.06);
    crate.scale.setScalar(0.82);
    crate.visible = false;
    crate.add(models.crate);

    this.roots = { barrel, crate };
    this.basePositions = {
      barrel: barrel.position.clone(),
      crate: crate.position.clone(),
    };
    this.baseQuaternions = {
      barrel: barrel.quaternion.clone(),
      crate: crate.quaternion.clone(),
    };
    this.root.add(barrel, crate);
  }

  stage(variant: DriftingLootVariant): void {
    if (this.disposed) return;
    this.cancelActiveAnimation();
    this.activeVariant = variant;
    this.state = 'floating';
    this.resetAll();
    this.roots[variant].visible = true;
  }

  reveal(): Promise<void> {
    if (this.disposed || this.activeVariant === null) return Promise.resolve();
    const root = this.roots[this.activeVariant];
    this.resetPose(this.activeVariant);
    root.position.x += REVEAL_OFFSET.x;
    root.position.y += REVEAL_OFFSET.y;
    root.position.z += REVEAL_OFFSET.z;
    this.state = 'revealing';
    return this.startAnimation('reveal', REVEAL_DURATION);
  }

  retrieve(): Promise<void> {
    if (this.disposed || this.activeVariant === null) return Promise.resolve();
    const root = this.roots[this.activeVariant];
    this.animationStartPosition.copy(root.position);
    this.animationStartQuaternion.copy(root.quaternion);
    this.state = 'retrieving';
    return this.startAnimation('retrieve', RETRIEVE_DURATION);
  }

  recede(): Promise<void> {
    if (this.disposed || this.activeVariant === null) return Promise.resolve();
    const root = this.roots[this.activeVariant];
    this.animationStartPosition.copy(root.position);
    this.animationStartQuaternion.copy(root.quaternion);
    this.state = 'receding';
    return this.startAnimation('recede', RECEDE_DURATION);
  }

  projectHeld(
    camera: PerspectiveCamera,
    width: number,
    height: number,
  ): ProjectedBoatBounds | null {
    if (
      this.disposed
      || this.state !== 'held'
      || this.activeVariant === null
      || width <= 0
      || height <= 0
    ) return null;
    return projectBoatObjectBounds(this.roots[this.activeVariant], camera, width, height);
  }

  projectInteraction(
    camera: PerspectiveCamera,
    width: number,
    height: number,
  ): DriftingLootInteractionProjection | null {
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
      this.applySternPose(this.activeVariant);
    } else if (animation.kind === 'recede') {
      this.state = 'idle';
      this.roots[this.activeVariant].visible = false;
    } else {
      this.state = 'floating';
      this.applyFloatingPose(this.activeVariant, 0);
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
      else if (this.state === 'held') this.applySternPose(variant);
      return;
    }

    animation.elapsed = Math.min(
      animation.duration,
      animation.elapsed + Math.max(0, delta),
    );
    const progress = animation.duration <= 0 ? 1 : animation.elapsed / animation.duration;
    if (animation.kind === 'reveal') this.applyRevealPose(variant, time, progress);
    else if (animation.kind === 'retrieve') this.applyRetrievePose(variant, progress);
    else this.applyRecedePose(variant, progress);
    if (progress < 1) return;

    this.activeAnimation = null;
    if (animation.kind === 'reveal') {
      this.state = 'floating';
      this.applyFloatingPose(variant, time);
    } else if (animation.kind === 'retrieve') {
      this.state = 'held';
      this.applySternPose(variant);
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
    kind: DriftingLootAnimationKind,
    duration: number,
  ): Promise<void> {
    this.cancelActiveAnimation();
    return new Promise<void>((resolve) => {
      this.activeAnimation = { kind, elapsed: 0, duration, resolve };
    });
  }

  private applyFloatingPose(variant: DriftingLootVariant, time: number): void {
    const root = this.roots[variant];
    const basePosition = this.basePositions[variant];
    sampleWaveFieldInto(
      this.waveSample,
      DEFAULT_WAVES,
      time,
      basePosition.x,
      basePosition.z,
      1,
    );
    root.position.copy(basePosition);
    root.position.x += this.waveSample.displacementX * 0.12;
    root.position.y += this.waveSample.height * 0.34;
    root.position.z += this.waveSample.displacementZ * 0.12;
    root.quaternion.copy(this.baseQuaternions[variant]);
    root.rotateX(this.waveSample.normal.z * 0.12);
    root.rotateZ(-this.waveSample.normal.x * 0.12);
  }

  private applyRevealPose(
    variant: DriftingLootVariant,
    time: number,
    progress: number,
  ): void {
    this.applyFloatingPose(variant, time);
    const travel = keyedRevealProgress(Math.min(1, Math.max(0, progress)));
    this.positionScratch.set(REVEAL_OFFSET.x, REVEAL_OFFSET.y, REVEAL_OFFSET.z);
    this.positionScratch.multiplyScalar(1 - travel);
    this.roots[variant].position.add(this.positionScratch);
  }

  private applyRetrievePose(variant: DriftingLootVariant, progress: number): void {
    this.readSternPose();
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

  private applyRecedePose(variant: DriftingLootVariant, progress: number): void {
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

  private applySternPose(variant: DriftingLootVariant): void {
    this.readSternPose();
    this.roots[variant].position.copy(this.targetPositionScratch);
    this.roots[variant].quaternion.copy(this.targetQuaternionScratch);
  }

  private readSternPose(): void {
    this.sternTarget.getWorldPosition(this.targetPositionScratch);
    this.sternTarget.getWorldQuaternion(this.targetQuaternionScratch);
    this.root.worldToLocal(this.targetPositionScratch);
    this.root.getWorldQuaternion(this.quaternionScratch).invert();
    this.targetQuaternionScratch.premultiply(this.quaternionScratch);
  }

  private resetAll(): void {
    this.resetPose('barrel');
    this.resetPose('crate');
    this.roots.barrel.visible = false;
    this.roots.crate.visible = false;
  }

  private resetPose(variant: DriftingLootVariant): void {
    this.roots[variant].position.copy(this.basePositions[variant]);
    this.roots[variant].quaternion.copy(this.baseQuaternions[variant]);
  }

  private cancelActiveAnimation(): void {
    const animation = this.activeAnimation;
    this.activeAnimation = null;
    animation?.resolve();
  }
}

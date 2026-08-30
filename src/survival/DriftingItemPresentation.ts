import {
  Group,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';
import type { WaveSample } from '../ocean/WaveField';
import {
  projectBoatObjectBounds,
  type ProjectedBoatBounds,
} from './BoatInteraction';
import {
  smoothstepUnchecked as smoothstep,
  type TimedAnimation,
} from './animationMath';
import { CHEST_DISPLAY_SCALE } from './ChestDisplay';
import {
  applyDriftingWavePose,
  type DriftingWater,
} from './DriftingWaveMotion';
import {
  driftingSupplyDistanceFromSeed,
  driftingSupplyKindFromSeed,
  type DriftingSupplyDistance,
  type DriftingSupplyKind,
} from './driftingSupplies';
import type { DriftingItemEventId } from './eventCatalog';
import { eventSideFromSeed, type EventSide } from './eventVariant';
import type { DriftingCargoKind } from './survivalTypes';

type DriftingItemAnimationKind = 'retrieve' | 'recede';
type ActiveDriftingItemAnimation = TimedAnimation<DriftingItemAnimationKind>;
type DriftingItemState = 'idle' | 'floating' | 'retrieving' | 'held' | 'receding';

export interface DriftingItemModels {
  readonly barrel: Group;
  readonly chest: Group;
  readonly lifeboat: Group;
  readonly lifeboatCooler: Group;
  readonly shippingContainer: Group;
}

export interface DriftingItemInteractionProjection {
  readonly variant: DriftingCargoKind;
  readonly bounds: ProjectedBoatBounds;
}

const SUPPLY_POSITIONS: Readonly<Record<
  DriftingSupplyDistance,
  Readonly<{ x: number; z: number }>
>> = Object.freeze({
  near: Object.freeze({ x: 3, z: -4.2 }),
  middle: Object.freeze({ x: 4.4, z: -5.7 }),
  far: Object.freeze({ x: 5.8, z: -7.2 }),
});
const CHEST_POSITION = Object.freeze({ x: 3, y: 0.02, z: -4.2 });
const WATERLINE_Y: Readonly<Record<DriftingSupplyKind, number>> = Object.freeze({
  barrel: 0.02,
  lifeboat: 0.24,
  container: 0.08,
});
const LIFEBOAT_COOLER_POSITION = Object.freeze({ x: 0, y: 0.18, z: 0.65 });
const RECEDE_OFFSET = Object.freeze({ x: 5.2, y: -0.28, z: -2 });
const RETRIEVE_DURATIONS: Readonly<Record<Exclude<DriftingCargoKind, 'container'>, number>> =
  Object.freeze({ barrel: 1.35, chest: 1.55, lifeboat: 1.8 });
const RECEDE_DURATION = 0.8;

function keyedRetrieveProgress(progress: number): number {
  if (progress < 0.14) return -0.045 * smoothstep(progress / 0.14);
  if (progress < 0.82) {
    return -0.045 + 1.085 * smoothstep((progress - 0.14) / 0.68);
  }
  return 1.04 + (1 - 1.04) * smoothstep((progress - 0.82) / 0.18);
}

export class DriftingItemPresentation {
  readonly root = new Group();
  private readonly roots: Readonly<Record<DriftingCargoKind, Group>>;
  private readonly basePositions: Readonly<Record<DriftingCargoKind, Vector3>>;
  private readonly baseQuaternions: Readonly<Record<DriftingCargoKind, Quaternion>>;
  private readonly baseScales: Readonly<Record<DriftingCargoKind, number>>;
  private readonly lifeboatCooler: Group;
  private readonly coolerBaseScale: number;
  private readonly targetPositionScratch = new Vector3();
  private readonly animationStartPosition = new Vector3();
  private readonly quaternionScratch = new Quaternion();
  private readonly targetQuaternionScratch = new Quaternion();
  private readonly animationStartQuaternion = new Quaternion();
  private readonly lifeboatExitStartPosition = new Vector3();
  private readonly lifeboatExitStartQuaternion = new Quaternion();
  private animationStartScale = 1;
  private readonly waveSample: WaveSample = {
    height: 0,
    displacementX: 0,
    displacementZ: 0,
    normal: { x: 0, y: 1, z: 0 },
  };
  private activeAnimation: ActiveDriftingItemAnimation | null = null;
  private activeEventId: DriftingItemEventId | null = null;
  private activeVariant: DriftingCargoKind | null = null;
  private side: EventSide = -1;
  private state: DriftingItemState = 'idle';
  private disposed = false;

  constructor(
    models: DriftingItemModels,
    private readonly sternTarget: Object3D,
    private readonly water: DriftingWater,
  ) {
    this.root.name = 'drifting-item-presentation';

    const barrel = this.createRoot('drifting-supplies:barrel', models.barrel);
    barrel.rotation.z = Math.PI / 2;
    barrel.scale.setScalar(0.9);

    const chest = this.createRoot('drifting-chest:model', models.chest);
    chest.rotation.set(0.08, -0.18, -0.06);
    chest.scale.setScalar(0.82 * CHEST_DISPLAY_SCALE);

    const lifeboat = this.createRoot('drifting-supplies:lifeboat', models.lifeboat);
    lifeboat.rotation.y = Math.PI / 4;
    this.lifeboatCooler = models.lifeboatCooler;
    this.lifeboatCooler.name = 'drifting-supplies:lifeboat-cooler';
    this.lifeboatCooler.position.set(
      LIFEBOAT_COOLER_POSITION.x,
      LIFEBOAT_COOLER_POSITION.y,
      LIFEBOAT_COOLER_POSITION.z,
    );
    lifeboat.add(this.lifeboatCooler);

    const container = this.createRoot(
      'drifting-supplies:container',
      models.shippingContainer,
    );
    container.rotation.set(0.04, -0.16, -0.035);
    container.scale.setScalar(0.92);

    this.roots = { barrel, chest, lifeboat, container };
    this.basePositions = {
      barrel: barrel.position.clone(),
      chest: chest.position.clone(),
      lifeboat: lifeboat.position.clone(),
      container: container.position.clone(),
    };
    this.baseQuaternions = {
      barrel: barrel.quaternion.clone(),
      chest: chest.quaternion.clone(),
      lifeboat: lifeboat.quaternion.clone(),
      container: container.quaternion.clone(),
    };
    this.baseScales = {
      barrel: barrel.scale.x,
      chest: chest.scale.x,
      lifeboat: lifeboat.scale.x,
      container: container.scale.x,
    };
    this.coolerBaseScale = this.lifeboatCooler.scale.x;
    this.root.add(barrel, chest, lifeboat, container);
    this.resetAll();
  }

  stage(eventId: DriftingItemEventId, variantSeed = 0): void {
    if (this.disposed) return;
    this.cancelActiveAnimation();
    this.activeEventId = eventId;
    const supplyKind = eventId === 'drifting-supplies'
      ? driftingSupplyKindFromSeed(variantSeed)
      : null;
    this.activeVariant = supplyKind ?? 'chest';
    this.side = eventSideFromSeed(variantSeed);
    if (eventId === 'drifting-supplies') {
      const distance = driftingSupplyDistanceFromSeed(variantSeed);
      const position = SUPPLY_POSITIONS[distance];
      const basePosition = this.basePositions[supplyKind!];
      basePosition.set(position.x * this.side, WATERLINE_Y[supplyKind!], position.z);
      this.root.userData.supplyKind = supplyKind;
      this.root.userData.supplyDistance = distance;
    } else {
      this.basePositions.chest.set(
        CHEST_POSITION.x * this.side,
        CHEST_POSITION.y,
        CHEST_POSITION.z,
      );
      delete this.root.userData.supplyKind;
      delete this.root.userData.supplyDistance;
    }
    this.state = 'floating';
    this.resetAll();
    this.roots[this.activeVariant].visible = true;
    this.applyFloatingPose(this.activeVariant, 0);
  }

  reveal(): Promise<void> {
    return Promise.resolve();
  }

  retrieve(): Promise<void> {
    const variant = this.activeVariant;
    if (this.disposed || variant === null) return Promise.resolve();
    if (variant === 'container') {
      this.state = 'held';
      return Promise.resolve();
    }
    const target = variant === 'lifeboat' ? this.lifeboatCooler : this.roots[variant];
    if (variant === 'lifeboat') {
      this.lifeboatExitStartPosition.copy(this.roots.lifeboat.position);
      this.lifeboatExitStartQuaternion.copy(this.roots.lifeboat.quaternion);
      this.root.updateMatrixWorld(true);
      this.root.attach(this.lifeboatCooler);
    }
    this.animationStartPosition.copy(target.position);
    this.animationStartQuaternion.copy(target.quaternion);
    this.animationStartScale = target.scale.x;
    this.state = 'retrieving';
    return this.startAnimation('retrieve', RETRIEVE_DURATIONS[variant]);
  }

  recede(): Promise<void> {
    const variant = this.activeVariant;
    if (this.disposed || variant === null) return Promise.resolve();
    const root = this.roots[variant];
    this.animationStartPosition.copy(root.position);
    this.animationStartQuaternion.copy(root.quaternion);
    this.state = 'receding';
    return this.startAnimation('recede', RECEDE_DURATION);
  }

  projectInteraction(
    camera: PerspectiveCamera,
    width: number,
    height: number,
  ): DriftingItemInteractionProjection | null {
    const variant = this.activeVariant;
    if (this.disposed || this.state !== 'floating' || variant === null || width <= 0 || height <= 0) {
      return null;
    }
    return {
      variant,
      bounds: projectBoatObjectBounds(this.roots[variant], camera, width, height),
    };
  }

  interactionRoot(): Group | null {
    return this.disposed || this.state !== 'floating' || this.activeVariant === null
      ? null
      : this.roots[this.activeVariant];
  }

  itemAimTarget(): Group | null {
    return this.disposed || this.activeVariant === null
      ? null
      : this.roots[this.activeVariant];
  }

  resultRoot(): Group | null {
    if (this.disposed || this.activeVariant === null) return null;
    return this.activeVariant === 'lifeboat'
      ? this.lifeboatCooler
      : this.roots[this.activeVariant];
  }

  settleForVisibilityChange(): void {
    const variant = this.activeVariant;
    if (this.disposed || this.activeAnimation === null || variant === null) return;
    const animation = this.activeAnimation;
    this.activeAnimation = null;
    if (animation.kind === 'retrieve') {
      if (variant !== 'container') this.finishRetrieve(variant);
      else this.state = 'held';
    } else {
      this.state = 'idle';
      this.roots[variant].visible = false;
    }
    animation.resolve();
  }

  clear(): void {
    if (this.disposed) return;
    this.cancelActiveAnimation();
    this.activeEventId = null;
    this.activeVariant = null;
    this.state = 'idle';
    this.resetAll();
  }

  update(time: number, delta: number): void {
    if (this.disposed || delta < 0 || this.activeVariant === null) return;
    const variant = this.activeVariant;
    const animation = this.activeAnimation;
    if (animation === null) {
      this.updateIdlePose(variant, time);
      return;
    }

    animation.elapsed = Math.min(animation.duration, animation.elapsed + Math.max(0, delta));
    const progress = animation.duration <= 0 ? 1 : animation.elapsed / animation.duration;
    this.updateAnimationPose(animation, variant, progress);
    if (progress < 1) return;

    this.finishAnimation(animation, variant);
  }

  private updateIdlePose(variant: DriftingCargoKind, time: number): void {
    if (this.state === 'floating') this.applyFloatingPose(variant, time);
    else if (this.state === 'held' && variant !== 'container') this.applyHeldPose(variant);
  }

  private updateAnimationPose(
    animation: ActiveDriftingItemAnimation,
    variant: DriftingCargoKind,
    progress: number,
  ): void {
    if (animation.kind === 'retrieve' && variant !== 'container') {
      this.applyRetrievePose(variant, progress);
    } else this.applyRecedePose(variant, progress);
  }

  private finishAnimation(
    animation: ActiveDriftingItemAnimation,
    variant: DriftingCargoKind,
  ): void {
    this.activeAnimation = null;
    if (animation.kind === 'retrieve') {
      if (variant !== 'container') this.finishRetrieve(variant);
      else this.state = 'held';
    }
    else {
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

  private createRoot(name: string, model: Group): Group {
    const root = new Group();
    root.name = name;
    root.visible = false;
    root.userData.motionSource = 'shared-wave-field';
    root.userData.waterlineY = 0;
    root.add(model);
    return root;
  }

  private startAnimation(kind: DriftingItemAnimationKind, duration: number): Promise<void> {
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

  private applyRetrievePose(variant: Exclude<DriftingCargoKind, 'container'>, progress: number): void {
    this.readTargetPose();
    const travel = keyedRetrieveProgress(Math.min(1, Math.max(0, progress)));
    const target = variant === 'lifeboat' ? this.lifeboatCooler : this.roots[variant];
    target.position.lerpVectors(this.animationStartPosition, this.targetPositionScratch, travel);
    target.quaternion.slerpQuaternions(
      this.animationStartQuaternion,
      this.targetQuaternionScratch,
      Math.min(1, Math.max(0, travel)),
    );
    target.scale.setScalar(
      this.animationStartScale + (this.targetScale(variant) - this.animationStartScale) * travel,
    );
    if (variant === 'lifeboat') {
      const recede = smoothstep(Math.max(0, (progress - 0.38) / 0.62));
      this.applyLifeboatExit(recede);
    }
  }

  private applyLifeboatExit(progress: number): void {
    this.targetPositionScratch.copy(this.basePositions.lifeboat);
    this.targetPositionScratch.x += RECEDE_OFFSET.x * this.side;
    this.targetPositionScratch.y += RECEDE_OFFSET.y;
    this.targetPositionScratch.z += RECEDE_OFFSET.z;
    this.roots.lifeboat.position.lerpVectors(
      this.lifeboatExitStartPosition,
      this.targetPositionScratch,
      progress,
    );
    this.roots.lifeboat.quaternion.slerpQuaternions(
      this.lifeboatExitStartQuaternion,
      this.baseQuaternions.lifeboat,
      progress,
    );
  }

  private applyRecedePose(variant: DriftingCargoKind, progress: number): void {
    const travel = smoothstep(Math.min(1, Math.max(0, progress)));
    this.targetPositionScratch.copy(this.basePositions[variant]);
    this.targetPositionScratch.x += RECEDE_OFFSET.x * this.side;
    this.targetPositionScratch.y += RECEDE_OFFSET.y;
    this.targetPositionScratch.z += RECEDE_OFFSET.z;
    const root = this.roots[variant];
    root.position.lerpVectors(this.animationStartPosition, this.targetPositionScratch, travel);
    root.quaternion.slerpQuaternions(
      this.animationStartQuaternion,
      this.baseQuaternions[variant],
      travel,
    );
  }

  private finishRetrieve(variant: Exclude<DriftingCargoKind, 'container'>): void {
    this.state = 'held';
    this.applyHeldPose(variant);
    if (variant === 'lifeboat') this.roots.lifeboat.visible = false;
  }

  private applyHeldPose(variant: Exclude<DriftingCargoKind, 'container'>): void {
    this.readTargetPose();
    const target = variant === 'lifeboat' ? this.lifeboatCooler : this.roots[variant];
    target.position.copy(this.targetPositionScratch);
    target.quaternion.copy(this.targetQuaternionScratch);
    target.scale.setScalar(this.targetScale(variant));
  }

  private readTargetPose(): void {
    this.sternTarget.getWorldPosition(this.targetPositionScratch);
    this.sternTarget.getWorldQuaternion(this.targetQuaternionScratch);
    this.root.worldToLocal(this.targetPositionScratch);
    this.root.getWorldQuaternion(this.quaternionScratch).invert();
    this.targetQuaternionScratch.premultiply(this.quaternionScratch);
  }

  private targetScale(variant: Exclude<DriftingCargoKind, 'container'>): number {
    if (variant === 'chest') return CHEST_DISPLAY_SCALE;
    if (variant === 'lifeboat') return this.coolerBaseScale;
    return this.baseScales.barrel;
  }

  private resetAll(): void {
    this.resetCooler();
    this.resetPose('barrel');
    this.resetPose('chest');
    this.resetPose('lifeboat');
    this.resetPose('container');
    this.roots.barrel.visible = false;
    this.roots.chest.visible = false;
    this.roots.lifeboat.visible = false;
    this.roots.container.visible = false;
  }

  private resetCooler(): void {
    this.roots.lifeboat.add(this.lifeboatCooler);
    this.lifeboatCooler.position.set(
      LIFEBOAT_COOLER_POSITION.x,
      LIFEBOAT_COOLER_POSITION.y,
      LIFEBOAT_COOLER_POSITION.z,
    );
    this.lifeboatCooler.quaternion.identity();
    this.lifeboatCooler.scale.setScalar(this.coolerBaseScale);
    this.lifeboatCooler.visible = true;
  }

  private resetPose(variant: DriftingCargoKind): void {
    this.roots[variant].position.copy(this.basePositions[variant]);
    this.roots[variant].quaternion.copy(this.baseQuaternions[variant]);
    this.roots[variant].scale.setScalar(this.baseScales[variant]);
  }

  private cancelActiveAnimation(): void {
    const animation = this.activeAnimation;
    this.activeAnimation = null;
    animation?.resolve();
  }
}

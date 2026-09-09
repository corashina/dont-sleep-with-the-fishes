import { DriftingDebris } from './DriftingDebris';
import {
  Box3,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Shape,
  Vector3,
} from 'three';
import type { WaveSample } from '../ocean/WaveField';
import { runCleanupSteps } from '../world/SceneResources';
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

type DriftingItemAnimationKind = 'retrieve';
type ActiveDriftingItemAnimation = TimedAnimation<DriftingItemAnimationKind>;
type DriftingItemState = 'idle' | 'floating' | 'retrieving' | 'held';

export interface DriftingItemModels {
  readonly barrel: Group;
  readonly chest: Group;
  readonly lifeboat: Group;
  readonly lifeboatCooler: Group;
  readonly shippingContainer: Group;
  readonly debrisBox: Group;
  readonly debrisCrate: Group;
  readonly debrisPallet: Group;
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
  debris: 0.02,
});
const LIFEBOAT_COOLER_POSITION = Object.freeze({ x: 0, y: 0.18, z: 0.65 });
const LIFEBOAT_FLOOR_Y = -0.1;
const LIFEBOAT_FLOOR_THICKNESS = 0.1;
const LIFEBOAT_FLOOR_OUTLINE = Object.freeze([
  Object.freeze({ x: -0.48, z: -1.92 }),
  Object.freeze({ x: 0.48, z: -1.92 }),
  Object.freeze({ x: 0.82, z: -1.35 }),
  Object.freeze({ x: 0.88, z: -0.6 }),
  Object.freeze({ x: 0.88, z: 0.85 }),
  Object.freeze({ x: 0.78, z: 1.45 }),
  Object.freeze({ x: 0.48, z: 1.92 }),
  Object.freeze({ x: -0.48, z: 1.92 }),
  Object.freeze({ x: -0.78, z: 1.45 }),
  Object.freeze({ x: -0.88, z: 0.85 }),
  Object.freeze({ x: -0.88, z: -0.6 }),
  Object.freeze({ x: -0.82, z: -1.35 }),
]);
const RECEDE_OFFSET = Object.freeze({ x: 5.2, y: -0.28, z: -2 });
const RETRIEVE_DURATIONS: Readonly<Record<DriftingCargoKind, number>> =
  Object.freeze({ barrel: 1.35, chest: 1.55, lifeboat: 1.8, container: 1.8, debris: 2 });

function keyedRetrieveProgress(progress: number): number {
  if (progress < 0.14) return -0.045 * smoothstep(progress / 0.14);
  if (progress < 0.82) {
    return -0.045 + 1.085 * smoothstep((progress - 0.14) / 0.68);
  }
  return 1.04 + (1 - 1.04) * smoothstep((progress - 0.82) / 0.18);
}

function createLifeboatFloorMaterial(model: Object3D): MeshStandardMaterial {
  const sources: MeshStandardMaterial[] = [];
  model.traverse((object) => {
    if (sources.length > 0 || !(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const source = materials.find((material): material is MeshStandardMaterial => (
      material instanceof MeshStandardMaterial && material.name === 'BrightYellow'
    ));
    if (source !== undefined) sources.push(source);
  });
  const material = sources[0]?.clone() ?? new MeshStandardMaterial({
    color: 0x574506,
    roughness: 0.72,
    metalness: 0.08,
    flatShading: true,
  });
  material.name = 'drifting-lifeboat-floor-material';
  return material;
}

function createLifeboatFloor(model: Object3D): Mesh<ExtrudeGeometry, MeshStandardMaterial> {
  const shape = new Shape();
  const [first, ...remaining] = LIFEBOAT_FLOOR_OUTLINE;
  shape.moveTo(first!.x, first!.z);
  remaining.forEach(({ x, z }) => shape.lineTo(x, z));
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: LIFEBOAT_FLOOR_THICKNESS,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geometry.rotateX(Math.PI / 2);
  const floor = new Mesh(geometry, createLifeboatFloorMaterial(model));
  floor.name = 'drifting-supplies:lifeboat-floor';
  floor.position.y = LIFEBOAT_FLOOR_Y;
  floor.castShadow = true;
  floor.receiveShadow = true;
  return floor;
}

export class DriftingItemPresentation {
  readonly root = new Group();
  private readonly roots: Readonly<Record<DriftingCargoKind, Group>>;
  private readonly basePositions: Readonly<Record<DriftingCargoKind, Vector3>>;
  private readonly baseQuaternions: Readonly<Record<DriftingCargoKind, Quaternion>>;
  private readonly baseScales: Readonly<Record<DriftingCargoKind, number>>;
  private readonly lifeboatCooler: Group;
  private readonly debris: DriftingDebris;
  private readonly lifeboatFloor: Mesh<ExtrudeGeometry, MeshStandardMaterial>;
  private readonly coolerBaseScale: number;
  private readonly targetPositionScratch = new Vector3();
  private readonly contactBounds = new Box3();
  private readonly retrievalAimTarget = new Group();
  private playerContactDistance = 0.65;
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
  private activeVariant: DriftingCargoKind | null = null;
  private side: EventSide = -1;
  private state: DriftingItemState = 'idle';
  private disposed = false;

  constructor(
    models: DriftingItemModels,
    private readonly sternTarget: Object3D,
    private readonly playerTarget: Object3D,
    private readonly water: DriftingWater,
  ) {
    this.root.name = 'drifting-item-presentation';
    this.retrievalAimTarget.name = 'drifting-item-retrieval-aim';
    this.root.add(this.retrievalAimTarget);

    const barrel = this.createRoot('drifting-supplies:barrel', models.barrel);
    barrel.rotation.z = Math.PI / 2;
    barrel.scale.setScalar(0.9);

    const chest = this.createRoot('drifting-chest:model', models.chest);
    chest.rotation.set(0.08, -0.18, -0.06);
    chest.scale.setScalar(0.82 * CHEST_DISPLAY_SCALE);

    const lifeboat = this.createRoot('drifting-supplies:lifeboat', models.lifeboat);
    lifeboat.rotation.y = Math.PI / 4;
    this.lifeboatFloor = createLifeboatFloor(models.lifeboat);
    lifeboat.add(this.lifeboatFloor);
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

    this.debris = new DriftingDebris(models.debrisBox, models.debrisCrate, models.debrisPallet);
    const debris = this.createRoot('drifting-supplies:debris', this.debris.root);
    this.roots = { barrel, chest, lifeboat, container, debris };
    this.basePositions = {
      barrel: barrel.position.clone(),
      chest: chest.position.clone(),
      lifeboat: lifeboat.position.clone(),
      container: container.position.clone(),
      debris: debris.position.clone(),
    };
    this.baseQuaternions = {
      barrel: barrel.quaternion.clone(),
      chest: chest.quaternion.clone(),
      lifeboat: lifeboat.quaternion.clone(),
      container: container.quaternion.clone(),
      debris: debris.quaternion.clone(),
    };
    this.baseScales = {
      barrel: barrel.scale.x,
      chest: chest.scale.x,
      lifeboat: lifeboat.scale.x,
      container: container.scale.x,
      debris: debris.scale.x,
    };
    this.coolerBaseScale = this.lifeboatCooler.scale.x;
    this.root.add(barrel, chest, lifeboat, container, debris);
    this.resetAll();
  }

  stage(eventId: DriftingItemEventId, variantSeed = 0): void {
    if (this.disposed) return;
    this.cancelActiveAnimation();
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
    this.debris.setPose(this.side, 0);
  }

  reveal(): Promise<void> {
    return Promise.resolve();
  }

  retrieve(): Promise<void> {
    const variant = this.activeVariant;
    if (this.disposed || variant === null) return Promise.resolve();
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
    if (variant !== 'chest') {
      this.retrievalAimTarget.position.copy(this.roots[variant].position);
      this.contactBounds.setFromObject(target, true).getSize(this.targetPositionScratch);
      // Stop the item's surface in front of the player, including large containers.
      this.playerContactDistance = Math.max(0.65, this.targetPositionScratch.length() / 2 + 0.2);
    }
    this.state = 'retrieving';
    return this.startAnimation('retrieve', RETRIEVE_DURATIONS[variant]);
  }

  interactionRoot(): Group | null {
    return this.disposed || this.state !== 'floating' || this.activeVariant === null
      ? null
      : this.roots[this.activeVariant];
  }

  itemAimTarget(): Group | null {
    if (this.disposed || this.activeVariant === null) return null;
    // Keep the view steady instead of following loot into the player's hands.
    return this.activeVariant !== 'chest' && this.state !== 'floating'
      ? this.retrievalAimTarget
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
    this.finishRetrieve(variant);
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
    if (this.disposed || delta < 0 || this.activeVariant === null) return;
    const variant = this.activeVariant;
    const animation = this.activeAnimation;
    if (animation === null) {
      this.updateIdlePose(variant, time);
      return;
    }

    animation.elapsed = Math.min(animation.duration, animation.elapsed + Math.max(0, delta));
    const progress = animation.duration <= 0 ? 1 : animation.elapsed / animation.duration;
    if (variant === 'debris') this.applyFloatingPose(variant, time);
    this.applyRetrievePose(variant, progress);
    if (progress < 1) return;

    this.finishAnimation(animation, variant);
  }

  private updateIdlePose(variant: DriftingCargoKind, time: number): void {
    if (this.state === 'floating') this.applyFloatingPose(variant, time);
    else if (this.state === 'held' && variant === 'chest') this.applyHeldPose(variant);
  }

  private finishAnimation(
    animation: ActiveDriftingItemAnimation,
    variant: DriftingCargoKind,
  ): void {
    this.activeAnimation = null;
    this.finishRetrieve(variant);
    animation.resolve();
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancelActiveAnimation();
    this.disposed = true;
    this.root.removeFromParent();
    runCleanupSteps([
      () => this.debris.dispose(),
      () => this.lifeboatFloor.geometry.dispose(),
      () => this.lifeboatFloor.material.dispose(),
    ]);
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

  private applyRetrievePose(variant: DriftingCargoKind, progress: number): void {
    if (variant === 'debris') {
      this.debris.setPose(this.side, progress);
      return;
    }
    this.readTargetPose(variant);
    const clampedProgress = Math.min(1, Math.max(0, progress));
    const travel = variant === 'chest'
      ? keyedRetrieveProgress(clampedProgress)
      : smoothstep(clampedProgress);
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

  private finishRetrieve(variant: DriftingCargoKind): void {
    this.state = 'held';
    if (variant === 'debris') this.debris.setPose(this.side, 1);
    else this.applyHeldPose(variant);
    if (variant !== 'chest') this.resultRoot()!.visible = false;
    if (variant === 'lifeboat') this.roots.lifeboat.visible = false;
  }

  private applyHeldPose(variant: DriftingCargoKind): void {
    this.readTargetPose(variant);
    const target = variant === 'lifeboat' ? this.lifeboatCooler : this.roots[variant];
    target.position.copy(this.targetPositionScratch);
    target.quaternion.copy(this.targetQuaternionScratch);
    target.scale.setScalar(this.targetScale(variant));
  }

  private readTargetPose(variant: DriftingCargoKind): void {
    if (variant === 'chest') {
      this.sternTarget.getWorldPosition(this.targetPositionScratch);
      this.sternTarget.getWorldQuaternion(this.targetQuaternionScratch);
    } else {
      this.playerTarget.updateWorldMatrix(true, false);
      this.targetPositionScratch.set(0, -0.2, -this.playerContactDistance);
      this.playerTarget.localToWorld(this.targetPositionScratch);
      this.playerTarget.getWorldQuaternion(this.targetQuaternionScratch);
    }
    this.root.worldToLocal(this.targetPositionScratch);
    this.root.getWorldQuaternion(this.quaternionScratch).invert();
    this.targetQuaternionScratch.premultiply(this.quaternionScratch);
  }

  private targetScale(variant: DriftingCargoKind): number {
    if (variant === 'chest') return CHEST_DISPLAY_SCALE;
    if (variant === 'lifeboat') return this.coolerBaseScale;
    return this.baseScales[variant];
  }

  private resetAll(): void {
    this.resetCooler();
    this.resetPose('barrel');
    this.resetPose('chest');
    this.resetPose('lifeboat');
    this.resetPose('container');
    this.resetPose('debris');
    this.debris.setPose(this.side, 0);
    this.roots.barrel.visible = false;
    this.roots.chest.visible = false;
    this.roots.lifeboat.visible = false;
    this.roots.container.visible = false;
    this.roots.debris.visible = false;
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

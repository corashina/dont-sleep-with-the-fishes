import {
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { ItemInstanceId } from '../../game/ItemState';
import {
  disposeResourceSets,
  runCleanupSteps,
} from '../../world/SceneResources';
import { clamp01, keyedRevealProgress, pulse } from '../animationMath';
import type { DedicatedEventId } from '../eventPresentationRoutes';
import type {
  DedicatedEventEnvironment,
  DedicatedEventPresentation,
  EventOutcomePresentation,
  EventSceneContext,
} from '../eventPresentationTypes';
import { StationaryEventCamera } from '../StationaryEventCamera';

export const CARLITOS_EVENT_IDS = [
  'shadow-figure',
  'guarded-sleep',
] as const satisfies readonly DedicatedEventId[];

export type CarlitosEventId = typeof CARLITOS_EVENT_IDS[number];

const REVEAL_DURATION = 0.9;
const CHOICE_DURATION = 0.65;
const REACTION_DURATION = 0.8;

type AnimationKind = 'reveal' | 'choice' | 'item' | 'reaction';

interface ActiveAnimation {
  readonly kind: AnimationKind;
  elapsed: number;
  readonly duration: number;
  readonly resolve: (played?: boolean) => void;
}

function isCarlitosEventId(id: DedicatedEventId): id is CarlitosEventId {
  return (CARLITOS_EVENT_IDS as readonly string[]).includes(id);
}

export class CarlitosEventPresentation implements DedicatedEventPresentation {
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();
  readonly itemAimTarget = new Group();

  private readonly ownedMaterials = new Set<Material>();
  private readonly cameraLook: StationaryEventCamera | null;
  private readonly poseRoot: Group;
  private readonly headRoot: Group;
  private readonly falseCat: Group | null;
  private readonly basePosePosition = new Float64Array(3);
  private readonly basePoseRotation = new Float64Array(3);
  private readonly baseHeadRotation = new Float64Array(3);
  private readonly cameraLocalPosition = new Vector3();
  private guardedBodyYaw = 0;
  private active: ActiveAnimation | null = null;
  private staged = false;
  private disposed = false;

  constructor(
    readonly eventId: CarlitosEventId,
    private readonly environment: DedicatedEventEnvironment,
  ) {
    if (!isCarlitosEventId(eventId)) {
      throw new Error(`Unsupported Carlitos event: ${eventId}`);
    }
    const poseRoot = environment.carlitos.root
      .getObjectByName('carlitos-pose');
    const headRoot = environment.carlitos.root
      .getObjectByName('carlitos-head-pose');
    if (!(poseRoot instanceof Group) || !(headRoot instanceof Group)) {
      throw new Error('Carlitos event presentation requires pose roots.');
    }
    this.poseRoot = poseRoot;
    this.headRoot = headRoot;
    this.cameraLook = environment.camera === undefined
      ? null
      : new StationaryEventCamera(environment.camera);
    this.worldRoot.name = `${eventId}-world`;
    this.boatRoot.name = `${eventId}-boat`;
    this.captureBasePose();

    let falseCat: Group | null = null;
    try {
      if (eventId === 'shadow-figure') falseCat = this.createFalseCat();
      this.falseCat = falseCat;
      this.itemAimTarget.name = `${eventId}-item-aim-target`;
      if (eventId === 'guarded-sleep' || eventId === 'shadow-figure') {
        this.itemAimTarget.position.y = 0.3;
      }
      if (eventId === 'shadow-figure' && this.falseCat !== null) {
        this.falseCat.add(this.itemAimTarget);
      } else {
        this.poseRoot.add(this.itemAimTarget);
      }
      this.hideScene();
    } catch (error) {
      try {
        runCleanupSteps([
          () => this.itemAimTarget.removeFromParent(),
          () => this.worldRoot.clear(),
          () => this.boatRoot.clear(),
          () => disposeResourceSets(this.ownedMaterials),
        ]);
      } catch {
        // Preserve the construction error after all owned resources run.
      }
      throw error;
    }
  }

  stage(context: EventSceneContext): void {
    if (this.disposed || context.eventId !== this.eventId) return;
    if (this.staged) this.clear();
    this.captureBasePose();
    this.cameraLook?.capture();
    this.captureGuardedFacing();
    this.placeFalseCatOppositeCarlitos();
    this.staged = true;
    this.worldRoot.visible = true;
    this.boatRoot.visible = true;
    this.applyStrength(0, 0);
  }

  reveal(): Promise<void> {
    if (!this.canAnimate()) return Promise.resolve();
    this.cancelActive();
    this.applyStrength(0, 0);
    return this.startAnimation('reveal', REVEAL_DURATION) as Promise<void>;
  }

  playChoice(_choiceId: string): Promise<void> {
    if (!this.canAnimate()) return Promise.resolve();
    this.cancelActive();
    return this.startAnimation('choice', CHOICE_DURATION) as Promise<void>;
  }

  playItemUse(_choiceId: string, _instanceId: ItemInstanceId): Promise<boolean> {
    if (!this.canAnimate()) return Promise.resolve(false);
    this.cancelActive();
    return this.startAnimation('item', CHOICE_DURATION) as Promise<boolean>;
  }

  react(_result: EventOutcomePresentation): Promise<void> {
    if (!this.canAnimate()) return Promise.resolve();
    this.cancelActive();
    return this.startAnimation('reaction', REACTION_DURATION) as Promise<void>;
  }

  skip(): void {
    if (this.disposed || !this.staged) return;
    this.cancelActive();
    this.restoreAndHide();
  }

  update(_time: number, delta: number): void {
    if (this.disposed || !this.staged) return;
    const active = this.active;
    if (active === null) {
      this.applyStrength(1, 1);
      return;
    }
    const safeDelta = Number.isFinite(delta) && delta > 0 ? delta : 0;
    active.elapsed = Math.min(active.duration, active.elapsed + safeDelta);
    const progress = active.duration === 0 ? 1 : active.elapsed / active.duration;
    let strength = 1;
    if (active.kind === 'reveal') strength = keyedRevealProgress(progress);
    else if (active.kind === 'reaction') strength = 1 - pulse(progress, 0, 0.38, 0.78) * 0.28;
    else strength = 1 + pulse(progress, 0, 0.38, 0.82) * 0.12;
    this.applyStrength(
      strength,
      active.kind === 'reveal' ? strength : 1,
    );
    if (progress === 1) this.finishActive();
  }

  settleForVisibilityChange(): void {
    if (this.disposed || !this.staged) return;
    this.cancelActive();
    this.restoreAndHide();
  }

  clear(): void {
    if (this.disposed) return;
    this.cancelActive();
    this.restoreAndHide();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const active = this.active;
    this.active = null;
    active?.resolve(active.kind === 'item' ? false : undefined);
    runCleanupSteps([
      () => this.restoreBaseState(),
      () => this.hideScene(),
      () => this.itemAimTarget.removeFromParent(),
      () => this.boatRoot.clear(),
      () => this.worldRoot.clear(),
      () => this.boatRoot.removeFromParent(),
      () => this.worldRoot.removeFromParent(),
      () => disposeResourceSets(this.ownedMaterials),
    ]);
  }

  private canAnimate(): boolean {
    return !this.disposed && this.staged;
  }

  private startAnimation(kind: AnimationKind, duration: number): Promise<void | boolean> {
    return new Promise((resolve) => {
      this.active = { kind, elapsed: 0, duration, resolve };
    });
  }

  private finishActive(): void {
    const active = this.active;
    if (active === null) return;
    this.active = null;
    this.applyStrength(1, 1);
    active.resolve(active.kind === 'item' ? true : undefined);
  }

  private cancelActive(): void {
    const active = this.active;
    this.active = null;
    active?.resolve(active.kind === 'item' ? false : undefined);
  }

  private captureBasePose(): void {
    this.basePosePosition[0] = this.poseRoot.position.x;
    this.basePosePosition[1] = this.poseRoot.position.y;
    this.basePosePosition[2] = this.poseRoot.position.z;
    this.basePoseRotation[0] = this.poseRoot.rotation.x;
    this.basePoseRotation[1] = this.poseRoot.rotation.y;
    this.basePoseRotation[2] = this.poseRoot.rotation.z;
    this.baseHeadRotation[0] = this.headRoot.rotation.x;
    this.baseHeadRotation[1] = this.headRoot.rotation.y;
    this.baseHeadRotation[2] = this.headRoot.rotation.z;
  }

  private captureGuardedFacing(): void {
    if (this.eventId !== 'guarded-sleep') return;
    const camera = this.environment.camera;
    const parent = this.poseRoot.parent;
    if (camera === undefined || parent === null) {
      this.guardedBodyYaw = this.basePoseRotation[1]!;
      return;
    }
    camera.updateWorldMatrix(true, false);
    parent.updateWorldMatrix(true, false);
    camera.getWorldPosition(this.cameraLocalPosition);
    parent.worldToLocal(this.cameraLocalPosition);
    const x = this.cameraLocalPosition.x - this.poseRoot.position.x;
    const z = this.cameraLocalPosition.z - this.poseRoot.position.z;
    this.guardedBodyYaw = Math.atan2(-x, -z);
  }

  private restoreBaseState(): void {
    this.poseRoot.position.set(
      this.basePosePosition[0]!,
      this.basePosePosition[1]!,
      this.basePosePosition[2]!,
    );
    this.poseRoot.rotation.set(
      this.basePoseRotation[0]!,
      this.basePoseRotation[1]!,
      this.basePoseRotation[2]!,
    );
    this.headRoot.rotation.set(
      this.baseHeadRotation[0]!,
      this.baseHeadRotation[1]!,
      this.baseHeadRotation[2]!,
    );
    this.cameraLook?.restore();
  }

  private restoreAndHide(): void {
    this.restoreBaseState();
    this.staged = false;
    this.hideScene();
  }

  private hideScene(): void {
    this.worldRoot.visible = false;
    this.boatRoot.visible = false;
    if (this.falseCat !== null) this.falseCat.visible = false;
  }

  private applyStrength(strength: number, facingStrength = strength): void {
    const value = Number.isFinite(strength) ? strength : 0;
    if (this.eventId === 'guarded-sleep') {
      const facing = clamp01(facingStrength);
      this.poseRoot.position.y = this.basePosePosition[1]! + value * 0.055;
      this.poseRoot.rotation.x = this.basePoseRotation[0]! - value * 0.18;
      this.poseRoot.rotation.y = this.basePoseRotation[1]!
        + (this.guardedBodyYaw - this.basePoseRotation[1]!) * facing;
      this.headRoot.rotation.x = this.baseHeadRotation[0]! - value * 0.11;
      this.headRoot.rotation.y = this.baseHeadRotation[1]! * (1 - facing);
      this.cameraLook?.applyLookAt(this.itemAimTarget, facing);
      return;
    }
    if (this.eventId === 'shadow-figure') {
      if (this.falseCat === null) return;
      this.falseCat.visible = true;
    }
  }

  private placeFalseCatOppositeCarlitos(): void {
    if (this.falseCat === null) return;
    const carlitos = this.environment.carlitos.root;
    this.falseCat.position.copy(carlitos.position);
    this.falseCat.position.x = -this.falseCat.position.x;
    this.falseCat.rotation.copy(carlitos.rotation);
    this.falseCat.scale.copy(carlitos.scale);
  }

  private createFalseCat(): Group {
    const clone = cloneSkeleton(this.environment.carlitos.root) as Group;
    clone.name = 'shadow-figure:false-cat';
    clone.visible = false;
    clone.getObjectByName('carlitos-interaction')!.visible = true;
    clone.getObjectByName('carlitos-petting-hand')!.visible = false;
    clone.getObjectByName('carlitos-food')!.visible = false;
    const silhouetteMaterial = new MeshStandardMaterial({
      name: 'shadow-figure-silhouette-material',
      color: 0x030506,
      emissive: 0x111b1e,
      emissiveIntensity: 0.22,
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });
    this.ownedMaterials.add(silhouetteMaterial);
    clone.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.material = Array.isArray(object.material)
        ? object.material.map(() => silhouetteMaterial)
        : silhouetteMaterial;
    });
    this.boatRoot.add(clone);
    return clone;
  }

}

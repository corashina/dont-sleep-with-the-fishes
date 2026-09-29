import {
  Euler,
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
import { clamp01, keyedRevealProgress, pulse, smoothstep } from '../animationMath';
import type { DedicatedEventId } from '../eventPresentationRoutes';
import type {
  DedicatedEventEnvironment,
  DedicatedEventPresentation,
  EventOutcomePresentation,
  EventSceneContext,
} from '../eventPresentationTypes';
import { StationaryEventCamera } from '../StationaryEventCamera';
import {
  identityShadowFigureSample,
  isShadowFigureWeapon,
  resetShadowFigureSample,
  sampleShadowFigureReaction,
  sampleShadowFigureWeapon,
  SHADOW_FIGURE_REACTION_DURATION,
  shadowFigureWeaponDuration,
  type ShadowFigureReaction,
  type ShadowFigureWeapon,
} from './shadowFigureChoreography';
import { ItemAimTarget } from '../ItemAimTarget';

export const CARLITOS_EVENT_IDS = [
  'shadow-figure',
  'guarded-sleep',
] as const satisfies readonly DedicatedEventId[];

export type CarlitosEventId = typeof CARLITOS_EVENT_IDS[number];

const REVEAL_DURATION = 0.9;
const GUARDED_SLEEP_TURN_DURATION = 2.4;
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
  readonly itemAimTarget: ItemAimTarget;

  private readonly ownedMaterials = new Set<Material>();
  private readonly cameraLook: StationaryEventCamera | null;
  private readonly poseRoot: Group;
  private readonly headRoot: Group;
  private readonly falseCat: Group | null;
  private readonly basePosePosition = new Float64Array(3);
  private readonly basePoseRotation = new Float64Array(3);
  private readonly baseHeadRotation = new Float64Array(3);
  private readonly falseCatBasePosition = new Vector3();
  private readonly falseCatBaseRotation = new Euler();
  private readonly falseCatBaseScale = new Vector3();
  private readonly falseCatLungeDirection = new Vector3();
  private readonly shadowSample = identityShadowFigureSample();
  private silhouetteMaterial: MeshStandardMaterial | null = null;
  private falseCatOutwardSign = 1;
  private weapon: ShadowFigureWeapon | null = null;
  private weaponReaction: ShadowFigureReaction | null = null;
  private active: ActiveAnimation | null = null;
  private staged = false;
  private facingStrength = 0;
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
    this.itemAimTarget = new ItemAimTarget(eventId === 'shadow-figure' ? this.boatRoot : poseRoot);
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
      this.itemAimTarget.position.y = 0.3;
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
    this.placeFalseCatOppositeCarlitos();
    this.resetWeapon();
    this.staged = true;
    this.worldRoot.visible = true;
    this.boatRoot.visible = true;
    this.applyStrength(0, 0);
  }

  reveal(): Promise<void> {
    if (!this.canAnimate()) return Promise.resolve();
    this.cancelActive();
    this.applyStrength(0, 0);
    const duration = this.eventId === 'guarded-sleep' ? GUARDED_SLEEP_TURN_DURATION : REVEAL_DURATION;
    return this.startAnimation('reveal', duration) as Promise<void>;
  }

  playChoice(_choiceId: string): Promise<void> {
    if (!this.canAnimate()) return Promise.resolve();
    this.cancelActive();
    return this.startAnimation('choice', CHOICE_DURATION) as Promise<void>;
  }

  playItemUse(choiceId: string, _instanceId: ItemInstanceId): Promise<boolean> {
    if (!this.canAnimate()) return Promise.resolve(false);
    this.cancelActive();
    if (this.falseCat !== null && isShadowFigureWeapon(choiceId)) {
      this.weapon = choiceId;
      this.weaponReaction = null;
      return this.startAnimation('item', shadowFigureWeaponDuration(choiceId)) as Promise<boolean>;
    }
    return this.startAnimation('item', CHOICE_DURATION) as Promise<boolean>;
  }

  react(result: EventOutcomePresentation): Promise<void> {
    if (!this.canAnimate()) return Promise.resolve();
    this.cancelActive();
    if (this.weapon !== null) {
      this.weaponReaction = (result.resourceDeltas.health ?? 0) < 0 ? 'claw' : 'scatter';
      return this.startAnimation('reaction', SHADOW_FIGURE_REACTION_DURATION) as Promise<void>;
    }
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
      this.applyStrength(1, this.facingStrength);
      return;
    }
    const safeDelta = Number.isFinite(delta) && delta > 0 ? delta : 0;
    active.elapsed = Math.min(active.duration, active.elapsed + safeDelta);
    const progress = active.duration === 0 ? 1 : active.elapsed / active.duration;
    let strength = 1;
    if (active.kind === 'reveal') strength = keyedRevealProgress(progress);
    else if (active.kind === 'reaction') strength = 1 - pulse(progress, 0, 0.38, 0.78) * 0.28;
    else strength = 1 + pulse(progress, 0, 0.38, 0.82) * 0.12;
    this.sampleWeapon(active.kind, progress);
    this.applyStrength(
      strength,
      active.kind === 'reveal' ? smoothstep(progress) : 1,
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
    this.resetWeapon();
    this.applyFalseCatSample();
    this.staged = false;
    this.hideScene();
  }

  private resetWeapon(): void {
    this.weapon = null;
    this.weaponReaction = null;
    resetShadowFigureSample(this.shadowSample);
  }

  private sampleWeapon(kind: AnimationKind, progress: number): void {
    const weapon = this.weapon;
    if (weapon === null) return;
    if (kind === 'item') {
      sampleShadowFigureWeapon(weapon, progress, this.shadowSample);
    } else if (kind === 'reaction' && this.weaponReaction !== null) {
      sampleShadowFigureReaction(weapon, this.weaponReaction, progress, this.shadowSample);
    }
  }

  private hideScene(): void {
    this.worldRoot.visible = false;
    this.boatRoot.visible = false;
    if (this.falseCat !== null) this.falseCat.visible = false;
  }

  private applyStrength(strength: number, facingStrength = strength): void {
    this.facingStrength = clamp01(facingStrength);
    if (this.eventId === 'guarded-sleep') {
      this.cameraLook?.applyLookAt(this.itemAimTarget, this.facingStrength);
      return;
    }
    if (this.eventId === 'shadow-figure') this.applyFalseCatSample();
  }

  private applyFalseCatSample(): void {
    const falseCat = this.falseCat;
    if (falseCat === null) return;
    const sample = this.shadowSample;
    const side = this.falseCatOutwardSign;
    falseCat.position.copy(this.falseCatBasePosition);
    falseCat.position.x += sample.outward * side;
    falseCat.position.y += sample.lift;
    falseCat.position.addScaledVector(this.falseCatLungeDirection, sample.lunge);
    falseCat.rotation.set(
      this.falseCatBaseRotation.x + sample.pitch,
      this.falseCatBaseRotation.y,
      this.falseCatBaseRotation.z - sample.roll * side,
    );
    falseCat.scale.set(
      this.falseCatBaseScale.x * sample.scaleX,
      this.falseCatBaseScale.y * sample.scaleY,
      this.falseCatBaseScale.z * sample.scaleZ,
    );
    if (this.silhouetteMaterial !== null) this.silhouetteMaterial.opacity = sample.opacity;
    falseCat.visible = sample.opacity > 0.01;
  }

  private placeFalseCatOppositeCarlitos(): void {
    if (this.falseCat === null) return;
    const carlitos = this.environment.carlitos.root;
    this.falseCat.position.copy(carlitos.position);
    this.falseCat.position.x = -this.falseCat.position.x;
    this.falseCat.rotation.copy(carlitos.rotation);
    this.falseCat.scale.copy(carlitos.scale);
    this.falseCatBasePosition.copy(this.falseCat.position);
    this.falseCatBaseRotation.copy(this.falseCat.rotation);
    this.falseCatBaseScale.copy(this.falseCat.scale);
    this.falseCatOutwardSign = this.falseCat.position.x < 0 ? -1 : 1;
    this.falseCatLungeDirection.set(0, 0, 0);
    const camera = this.environment.camera;
    if (camera === undefined) return;
    // Lunge along the deck toward the player's view.
    camera.getWorldPosition(this.falseCatLungeDirection);
    this.boatRoot.updateWorldMatrix(true, false);
    this.boatRoot.worldToLocal(this.falseCatLungeDirection);
    this.falseCatLungeDirection.sub(this.falseCatBasePosition);
    this.falseCatLungeDirection.y = 0;
    if (this.falseCatLungeDirection.lengthSq() > 0) this.falseCatLungeDirection.normalize();
  }

  private createFalseCat(): Group {
    const clone = cloneSkeleton(this.environment.carlitos.root) as Group;
    clone.name = 'shadow-figure:false-cat';
    clone.visible = false;
    clone.getObjectByName('carlitos-interaction')!.visible = true;
    clone.getObjectByName('carlitos-care-hand')!.visible = false;
    const silhouetteMaterial = new MeshStandardMaterial({
      name: 'shadow-figure-silhouette-material',
      color: 0x030506,
      emissive: 0x111b1e,
      emissiveIntensity: 0.22,
      roughness: 1,
      metalness: 0,
      flatShading: true,
      transparent: true,
    });
    this.ownedMaterials.add(silhouetteMaterial);
    this.silhouetteMaterial = silhouetteMaterial;
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

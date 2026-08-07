import {
  AnimationMixer,
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  Vector3,
} from 'three';
import type { AnimationAction } from 'three';
import type { ItemInstanceId } from '../../game/ItemState';
import { disposeResourceSets, runCleanupSteps } from '../../world/SceneResources';
import type {
  BorrowedSupplyActor,
  MutableSupplyPose,
} from '../BoatSupplyDisplay';
import { borrowSupplyActor, releaseSupplyActor } from '../BoatSupplyDisplay';
import type {
  DedicatedEventEnvironment,
  DedicatedEventPresentation,
  EventOutcomePresentation,
  EventSceneContext,
} from '../eventPresentationTypes';
import { TimedPresentationAnimation } from '../TimedPresentationAnimation';
import {
  identitySnatcherSample,
  sampleSnatcherItemUse,
  sampleSnatcherReaction,
  sampleSnatcherReveal,
  snatcherItemDuration,
  SNATCHER_REACTION_DURATION,
  SNATCHER_REVEAL_DURATION,
  type SnatcherSample,
} from './snatcherChoreography';

const TENTACLE_X = 2.05;
const TENTACLE_Y = -0.62;
const TENTACLE_Z = -0.66;
const TENTACLE_SCALE = 0.94;
const WARNING_PADDING = 0.02;

function setTentacleMaterial(root: Group): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      material.color.multiplyScalar(0.62);
      material.roughness = 0.82;
      material.metalness = 0.02;
      material.flatShading = true;
      material.needsUpdate = true;
    }
  });
}

export class SnatcherTargetOutline {
  private readonly root = new Group();
  private readonly geometry = new BoxGeometry(1.08, 0.72, 0.92, 2, 2, 2);
  private readonly warningGeometry = new OctahedronGeometry(0.075, 0);
  private readonly material = new MeshStandardMaterial({
    color: 0xd89b4a,
    emissive: 0x9e3b1f,
    emissiveIntensity: 1.15,
    roughness: 0.62,
    metalness: 0.08,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    wireframe: true,
  });
  private readonly warningMaterial = new MeshStandardMaterial({
    color: 0xf1bd62,
    emissive: 0xa83e20,
    emissiveIntensity: 1.3,
    roughness: 0.56,
    metalness: 0.06,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    flatShading: true,
  });
  private readonly warnings: readonly Mesh[];
  private readonly fittedScale = new Vector3(1, 1, 1);
  private readonly bounds = new Box3();
  private readonly worldCenter = new Vector3();
  private readonly worldSize = new Vector3();
  private readonly worldScale = new Vector3();
  private targetId: ItemInstanceId | null = null;
  private disposed = false;

  constructor() {
    this.root.name = 'snatcher-target-outline';
    this.root.userData.warningValue = 'threatened-supply';

    const cage = new Mesh(this.geometry, this.material);
    cage.name = 'snatcher-warning-cage';
    cage.renderOrder = 4;
    this.root.add(cage);

    const warnings: Mesh[] = [];
    for (let index = 0; index < 4; index += 1) {
      const warning = new Mesh(this.warningGeometry, this.warningMaterial);
      warning.name = `snatcher-warning-mark-${index + 1}`;
      warning.position.set(
        index < 2 ? -0.58 : 0.58,
        index % 2 === 0 ? -0.42 : 0.42,
        0.48,
      );
      warning.rotation.z = Math.PI / 4 + index * 0.11;
      warning.renderOrder = 5;
      warnings.push(warning);
      this.root.add(warning);
    }
    this.warnings = warnings;
    this.root.visible = false;
  }

  setTarget(targetId: ItemInstanceId, target: Group): void {
    if (this.disposed) return;
    this.root.removeFromParent();
    target.updateWorldMatrix(true, true);
    const visibleCopy = target.children.find(({ visible }) => visible) ?? target;
    this.bounds.setFromObject(visibleCopy, true);
    if (this.bounds.isEmpty()) {
      this.root.position.set(0, 0, 0);
      this.fittedScale.set(1, 1, 1);
    } else {
      this.bounds.getCenter(this.worldCenter);
      this.bounds.getSize(this.worldSize);
      target.getWorldScale(this.worldScale);
      target.worldToLocal(this.worldCenter);
      this.root.position.copy(this.worldCenter);
      this.fittedScale.set(
        (this.worldSize.x / Math.max(0.001, Math.abs(this.worldScale.x))
          + WARNING_PADDING) / 1.08,
        (this.worldSize.y / Math.max(0.001, Math.abs(this.worldScale.y))
          + WARNING_PADDING) / 0.72,
        (this.worldSize.z / Math.max(0.001, Math.abs(this.worldScale.z))
          + WARNING_PADDING) / 0.92,
      );
    }
    this.targetId = targetId;
    this.root.userData.targetInstanceId = targetId;
    this.root.visible = true;
    target.add(this.root);
  }

  applyStrength(strength: number): void {
    if (this.disposed) return;
    const safeStrength = Math.max(0, Math.min(1, strength));
    this.root.visible = this.targetId !== null && safeStrength > 0.008;
    this.material.opacity = 0.34 + safeStrength * 0.48;
    this.warningMaterial.opacity = 0.42 + safeStrength * 0.44;
    const cageScale = 0.96 + safeStrength * 0.08;
    this.root.scale.set(
      this.fittedScale.x * cageScale,
      this.fittedScale.y * cageScale,
      this.fittedScale.z * cageScale,
    );
    for (let index = 0; index < this.warnings.length; index += 1) {
      const scale = 0.72 + safeStrength * (0.35 + index * 0.035);
      this.warnings[index]!.scale.set(scale, scale, scale);
    }
  }

  clear(): void {
    if (this.disposed) return;
    this.root.removeFromParent();
    this.root.visible = false;
    this.targetId = null;
    this.root.position.set(0, 0, 0);
    this.root.scale.set(1, 1, 1);
    this.fittedScale.set(1, 1, 1);
    delete this.root.userData.targetInstanceId;
  }

  targetIdForTest(): ItemInstanceId | null {
    return this.targetId;
  }

  visibleForTest(): boolean {
    return this.root.visible && this.root.parent !== null;
  }

  objectForTest(): Group {
    return this.root;
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.root.clear();
    disposeResourceSets(
      new Set([this.geometry, this.warningGeometry]),
      new Set([this.material, this.warningMaterial]),
    );
  }
}

export class SnatcherPresentation implements DedicatedEventPresentation {
  readonly eventId = 'snatcher' as const;
  readonly worldRoot = new Group();
  readonly boatRoot = new Group();
  readonly itemAimTarget = new Group();
  readonly targetOutline = new SnatcherTargetOutline();

  private readonly modelInstance;
  private readonly mixer: AnimationMixer | null;
  private readonly idleAction: AnimationAction | null;
  private readonly tentacle = new Group();
  private readonly sample: SnatcherSample = identitySnatcherSample();
  private readonly itemPose: MutableSupplyPose = {
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
  private readonly reactionState = { targetLost: false };
  private readonly animation = new TimedPresentationAnimation<
    'reveal' | 'item' | 'reaction'
  >(
    (kind, _time, progress) => this.applyAnimation(kind, progress),
    (kind) => this.finishAnimation(kind),
  );
  private activeChoiceId: string | null = null;
  private borrowedActor: BorrowedSupplyActor | null = null;
  private targetInstanceId: ItemInstanceId | null = null;
  private staged = false;
  private disposed = false;

  constructor(private readonly environment: DedicatedEventEnvironment) {
    this.worldRoot.name = 'tentacle-attack-world';
    this.boatRoot.name = 'tentacle-attack-boat';
    this.tentacle.name = 'tentacle-attack-tentacle';
    this.tentacle.position.set(TENTACLE_X, TENTACLE_Y, TENTACLE_Z);

    this.modelInstance = environment.eventModels.create('snatcher');
    this.modelInstance.root.name = 'tentacle-attack-model';
    setTentacleMaterial(this.modelInstance.root);
    const idleClip = this.modelInstance.root.animations.find(
      ({ name }) => name.toLowerCase().includes('idle'),
    ) ?? this.modelInstance.root.animations[0];
    this.mixer = idleClip === undefined
      ? null
      : new AnimationMixer(this.modelInstance.root);
    this.idleAction = idleClip === undefined
      ? null
      : this.mixer!.clipAction(idleClip);
    this.tentacle.add(this.modelInstance.root);
    this.itemAimTarget.name = 'snatcher-item-aim-target';
    this.itemAimTarget.position.set(0, 0.18, 0.44);
    this.tentacle.add(this.itemAimTarget);
    this.boatRoot.add(this.tentacle);
    this.hideScene();
  }

  stage(context: EventSceneContext): void {
    if (this.disposed || context.eventId !== 'snatcher') return;
    this.clear();
    this.activeChoiceId = null;
    this.staged = true;
    this.targetInstanceId = context.targetInstanceId;
    this.boatRoot.visible = true;
    this.tentacle.visible = false;
    this.idleAction?.reset().play();
    if (this.targetInstanceId !== null && this.borrowActor(this.targetInstanceId)) {
      this.targetOutline.setTarget(this.targetInstanceId, this.borrowedActor!.root);
      this.targetOutline.applyStrength(1);
    }
  }

  reveal(): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    this.animation.cancel();
    this.activeChoiceId = null;
    sampleSnatcherReveal(0, this.sample);
    this.applySample();
    return this.animation.start('reveal', SNATCHER_REVEAL_DURATION);
  }

  playItemUse(choiceId: string, _instanceId: ItemInstanceId): Promise<boolean> {
    if (
      this.disposed
      || !this.staged
      || (
        choiceId !== 'spyglass'
        && choiceId !== 'swimRing'
        && choiceId !== 'fishingNet'
        && choiceId !== 'shotgun'
      )
    ) {
      return Promise.resolve(false);
    }
    this.animation.cancel();
    this.activeChoiceId = choiceId;
    sampleSnatcherItemUse(choiceId, 0, this.sample);
    this.applySample();
    return this.animation.start('item', snatcherItemDuration(choiceId), {
      complete: true,
      cancel: false,
    });
  }

  react(result: EventOutcomePresentation): Promise<void> {
    if (this.disposed || !this.staged) return Promise.resolve();
    this.animation.cancel();
    this.activeChoiceId = null;
    const targetId = this.targetInstanceId;
    this.reactionState.targetLost = targetId !== null
      && result.lostInstanceIds.includes(targetId);
    if (targetId !== null && this.borrowActor(targetId)) {
      this.targetOutline.setTarget(targetId, this.borrowedActor!.root);
    }
    sampleSnatcherReaction(this.reactionState, 0, this.sample);
    this.applyBorrowedPose();
    this.applySample();
    return this.animation.start('reaction', SNATCHER_REACTION_DURATION);
  }

  update(_time: number, delta: number): void {
    if (this.disposed || !this.staged) return;
    const safeDelta = Number.isFinite(delta) && delta > 0 ? delta : 0;
    this.mixer?.update(safeDelta);
    this.animation.update(_time, safeDelta);
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    this.animation.settle();
  }

  skip(): void {
    this.settleForVisibilityChange();
  }

  clear(): void {
    if (this.disposed) return;
    this.animation.cancel();
    this.activeChoiceId = null;
    this.targetOutline.clear();
    this.releaseActor();
    this.targetInstanceId = null;
    this.staged = false;
    this.idleAction?.stop();
    this.hideScene();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const actor = this.borrowedActor;
    this.borrowedActor = null;
    this.animation.cancel();
    this.activeChoiceId = null;
    this.mixer?.stopAllAction();
    this.mixer?.uncacheRoot(this.modelInstance.root);

    runCleanupSteps([
      () => this.targetOutline.dispose(),
      () => actor?.release(),
      () => this.hideScene(),
      () => this.boatRoot.clear(),
      () => this.worldRoot.clear(),
      () => this.boatRoot.removeFromParent(),
      () => this.worldRoot.removeFromParent(),
      () => this.modelInstance.dispose(),
    ]);
  }

  private borrowActor(instanceId: ItemInstanceId): boolean {
    this.borrowedActor = borrowSupplyActor(
      this.borrowedActor, this.environment.supplies, instanceId,
    );
    return this.borrowedActor !== null;
  }

  private releaseActor(): void {
    this.borrowedActor = releaseSupplyActor(this.borrowedActor);
  }

  private applyBorrowedPose(): void {
    const actor = this.borrowedActor;
    if (actor === null) return;
    this.itemPose.x = this.sample.itemX;
    this.itemPose.y = this.sample.itemY;
    this.itemPose.z = this.sample.itemZ;
    this.itemPose.yaw = this.sample.itemYaw;
    this.itemPose.pitch = this.sample.itemPitch;
    this.itemPose.roll = this.sample.itemRoll;
    this.itemPose.scaleX = this.sample.itemScaleX;
    this.itemPose.scaleY = this.sample.itemScaleY;
    this.itemPose.scaleZ = this.sample.itemScaleZ;
    actor.applyPose(this.itemPose);
  }

  private applyAnimation(
    kind: 'reveal' | 'item' | 'reaction',
    progress: number,
  ): void {
    if (kind === 'reveal') {
      sampleSnatcherReveal(progress, this.sample);
    } else if (kind === 'item') {
      if (this.activeChoiceId === null) return;
      sampleSnatcherItemUse(this.activeChoiceId, progress, this.sample);
    } else {
      sampleSnatcherReaction(this.reactionState, progress, this.sample);
      this.applyBorrowedPose();
    }
    this.applySample();
  }

  private finishAnimation(kind: 'reveal' | 'item' | 'reaction'): void {
    this.activeChoiceId = null;
    if (kind === 'reaction' && this.reactionState.targetLost) {
      const actor = this.borrowedActor;
      this.borrowedActor = null;
      actor?.releaseOnNextSync();
    }
  }

  private applySample(): void {
    const visibility = Math.max(this.sample.headVisibility, this.sample.fingerVisibility);
    this.tentacle.visible = visibility > 0.008;
    this.modelInstance.root.visible = visibility > 0.008;
    this.tentacle.position.set(
      TENTACLE_X + this.sample.creatureX,
      TENTACLE_Y + this.sample.creatureY,
      TENTACLE_Z + this.sample.creatureZ,
    );
    this.tentacle.rotation.set(
      -0.12 + this.sample.creaturePitch,
      -0.32 + this.sample.creatureYaw,
      -0.2 + this.sample.creatureRoll,
    );
    const riseScale = 0.72 + this.sample.crouchStrength * 0.28;
    this.tentacle.scale.set(
      TENTACLE_SCALE * (0.9 + this.sample.pointStrength * 0.1),
      TENTACLE_SCALE * riseScale,
      TENTACLE_SCALE * (0.92 + this.sample.pointStrength * 0.08),
    );
    this.targetOutline.applyStrength(this.sample.warningStrength);
  }

  private hideScene(): void {
    this.boatRoot.visible = false;
    this.worldRoot.visible = false;
    this.tentacle.visible = false;
    this.modelInstance.root.visible = false;
    this.tentacle.position.set(TENTACLE_X, TENTACLE_Y, TENTACLE_Z);
    this.tentacle.rotation.set(-0.12, -0.32, -0.2);
    this.tentacle.scale.setScalar(TENTACLE_SCALE);
  }
}

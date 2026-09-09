import {
  BufferGeometry,
  Color,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Skeleton,
  Vector3,
} from 'three';
import type { ItemInstance, ItemInstanceId } from '../game/ItemState';
import { enableItemAmbientOcclusion } from '../rendering/ItemAmbientOcclusion';
import {
  collectOwnedSkeletons,
  disposeSkeletons,
} from '../rendering/modelPresentation';
import {
  applyHandJointCurl,
  findImportedHandRig,
  type HandJoint,
} from '../rendering/RiggedHandRig';
import { boatStorageTransform } from '../world/BoatStorage';
import type {
  PropModelLibrary,
  PropPresentation,
} from '../world/PropModelLibrary';
import {
  collectMeshResources,
  disposeResourceSets,
  runCleanupSteps,
} from '../world/SceneResources';
import { eventItemUseDurationForItem } from './eventItemUseChoreography';
import type { CarlitosSnapshot } from './CarlitosState';
import type { EventSide } from './eventVariant';
import {
  carlitosPoseState,
  createCarlitosPose,
  sampleCarlitosPoseInto,
  type CarlitosAction,
  type CarlitosPoseSample,
  type CarlitosPoseState,
  type MutableCarlitosPose,
} from './carlitosMotion';

const CARLITOS_INSTANCE = Object.freeze({
  instanceId: 'carlitos-1' as ItemInstanceId,
  type: 'carlitos',
} satisfies ItemInstance);

export const CARLITOS_PET_DURATION = 2.4;
export const CARLITOS_FEED_DURATION = eventItemUseDurationForItem('throw-target', 'cannedFood') * 0.8;
const PET_CONTACT_PROGRESS = 0.18;

interface ActiveAction {
  readonly id: CarlitosAction;
  readonly duration: number;
  elapsed: number;
  contactSignaled: boolean;
  readonly onContact?: () => void;
  readonly resolve: () => void;
}

export class CarlitosPresentation {
  readonly root = new Group();
  readonly interactionRoot = new Group();
  readonly foodTarget = new Group();
  private readonly poseRoot = new Group();
  private readonly headPoseRoot = new Group();
  private readonly hand: Group;
  private readonly handJoints: readonly HandJoint[];
  private readonly handMaterials = new Set<Material>();
  private readonly head: Object3D;
  private readonly headPosition = new Vector3();
  private readonly tailTip: Object3D | null;
  private readonly tailAnimationQuaternion = new Quaternion();
  private readonly modelPresentation: PropPresentation;
  private readonly seatPositionX: number;
  private readonly seatRotationY: number;
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly ownedSkeletons = new Set<Skeleton>();
  private readonly pose: MutableCarlitosPose = createCarlitosPose();
  private readonly poseSample: CarlitosPoseSample = {
    status: 'content',
    action: null,
    elapsed: 0,
    duration: CARLITOS_PET_DURATION,
  };
  private status: CarlitosPoseState = 'content';
  private activeAction: ActiveAction | null = null;
  private aboard = false;
  private disposed = false;

  constructor(
    propModels: Pick<PropModelLibrary, 'createPresentation' | 'createEventModel'>,
  ) {
    this.root.name = 'carlitos-companion';
    const transform = boatStorageTransform(CARLITOS_INSTANCE);
    this.seatPositionX = Math.abs(transform.position.x);
    this.seatRotationY = Math.abs(transform.rotation.y);
    this.root.position.copy(transform.position);
    this.root.rotation.copy(transform.rotation);
    this.root.scale.setScalar(transform.scale);

    this.poseRoot.name = 'carlitos-pose';
    this.headPoseRoot.name = 'carlitos-head-pose';
    this.interactionRoot.name = 'carlitos-interaction';
    this.interactionRoot.userData.companionId = 'carlitos';
    this.modelPresentation = propModels.createPresentation(CARLITOS_INSTANCE);
    try {
      collectMeshResources(
        this.modelPresentation.root,
        this.ownedGeometries,
        this.ownedMaterials,
      );
      this.modelPresentation.root.name = 'carlitos-model';
      this.head = this.modelPresentation.root.getObjectByName('Head_22') ?? this.modelPresentation.root;
      this.tailTip = this.modelPresentation.root.getObjectByName('TailTip_8') ?? null;
      if (this.tailTip !== null) {
        this.tailAnimationQuaternion.copy(this.tailTip.quaternion);
      }
      this.headPoseRoot.add(this.modelPresentation.root);
      this.poseRoot.add(this.headPoseRoot);
      this.interactionRoot.add(this.poseRoot);
      this.root.add(this.interactionRoot);

      const handModel = propModels.createEventModel('riggedHand');
      this.hand = new Group();
      this.hand.name = 'carlitos-care-hand';
      this.hand.scale.setScalar(0.32);
      if (handModel === null) {
        this.handJoints = [];
        this.hand.userData.modelKind = 'unavailable';
      } else {
        this.hand.add(handModel.root);
        const handRig = findImportedHandRig(handModel.root);
        this.handJoints = handRig?.joints ?? [];
        this.hand.userData.modelKind = handRig === null ? 'model' : 'rigged';
        preparePettingHand(handModel.root, this.handMaterials);
        collectMeshResources(
          handModel.root,
          this.ownedGeometries,
          this.ownedMaterials,
        );
        collectOwnedSkeletons(handModel.root, this.ownedSkeletons);
      }
      this.foodTarget.name = 'carlitos-food-target';
      this.root.add(this.foodTarget);
      this.headPoseRoot.add(this.hand);
      this.setAboard(false);
      this.applyPose();
    } catch (error) {
      try {
        runCleanupSteps([
          () => this.modelPresentation.dispose(),
          () => this.root.removeFromParent(),
          () => disposeSkeletons(this.ownedSkeletons),
          () => disposeResourceSets(
            this.ownedGeometries,
            this.ownedMaterials,
          ),
        ]);
      } catch {
        // Preserve the construction error after each owned resource runs.
      }
      throw error;
    }
  }

  sync(snapshot: CarlitosSnapshot | null): void {
    if (this.disposed) return;
    this.status = snapshot === null ? 'content' : carlitosPoseState(snapshot);
    this.setAboard(snapshot !== null);
    if (!this.aboard) this.finishAction();
    this.samplePose();
    this.applyPose();
  }

  play(action: CarlitosAction, onContact?: () => void): Promise<void> {
    if (this.disposed || !this.aboard) return Promise.resolve();
    this.finishAction();
    const duration = action === 'pet' ? CARLITOS_PET_DURATION : CARLITOS_FEED_DURATION;
    return new Promise((resolve) => {
      this.activeAction = {
        id: action,
        duration,
        elapsed: 0,
        contactSignaled: false,
        onContact,
        resolve,
      };
      this.samplePose();
      this.applyPose();
    });
  }

  update(deltaSeconds: number): void {
    if (this.disposed) return;
    if (this.tailTip !== null) {
      this.tailTip.quaternion.copy(this.tailAnimationQuaternion);
    }
    this.modelPresentation.update(deltaSeconds);
    if (this.tailTip !== null) {
      this.tailAnimationQuaternion.copy(this.tailTip.quaternion);
    }
    const action = this.activeAction;
    if (action === null) return;
    action.elapsed = Math.min(
      action.duration,
      action.elapsed + Math.max(0, deltaSeconds),
    );
    if (
      action.id === 'pet'
      && !action.contactSignaled
      && action.elapsed >= action.duration * PET_CONTACT_PROGRESS
    ) {
      action.contactSignaled = true;
      action.onContact?.();
    }
    this.samplePose();
    this.applyPose();
    if (action.elapsed < action.duration) return;
    this.activeAction = null;
    action.resolve();
  }

  dispose(): void {
    if (this.disposed) return;
    this.finishAction();
    this.disposed = true;
    runCleanupSteps([
      () => this.modelPresentation.dispose(),
      () => this.root.removeFromParent(),
      () => disposeSkeletons(this.ownedSkeletons),
      () => disposeResourceSets(
        this.ownedGeometries,
        this.ownedMaterials,
      ),
    ]);
  }

  private setAboard(aboard: boolean): void {
    this.aboard = aboard;
    this.root.visible = aboard;
    this.interactionRoot.visible = aboard;
  }

  private finishAction(): void {
    const action = this.activeAction;
    if (action === null) return;
    this.activeAction = null;
    this.samplePose();
    this.applyPose();
    action.resolve();
  }

  private samplePose(): void {
    const action = this.activeAction;
    this.poseSample.status = this.status;
    this.poseSample.action = action?.id ?? null;
    this.poseSample.elapsed = action?.elapsed ?? 0;
    this.poseSample.duration = action?.duration ?? CARLITOS_PET_DURATION;
    sampleCarlitosPoseInto(this.pose, this.poseSample);
  }

  setSeatSide(side: EventSide): void {
    if (this.disposed) return;
    this.root.position.x = this.seatPositionX * side;
    this.root.rotation.y = this.seatRotationY * side;
    this.root.userData.seatSide = side === -1 ? 'left' : 'right';
  }

  private applyPose(): void {
    const pose = this.pose;
    this.poseRoot.position.y = pose.bodyLift;
    this.poseRoot.rotation.x = pose.bodyPitch + pose.actionLean;
    this.poseRoot.rotation.y = pose.bodyYaw;
    this.headPoseRoot.rotation.x = pose.headPitch;
    this.headPoseRoot.rotation.y = pose.headYaw;
    if (this.tailTip !== null) {
      this.tailTip.quaternion.copy(this.tailAnimationQuaternion);
      if (pose.tailSway !== 0) this.tailTip.rotateY(pose.tailSway);
    }

    this.updateHeadPosition();
    this.foodTarget.position.copy(this.headPosition);
    this.foodTarget.position.y += 0.015;
    this.foodTarget.position.z -= 0.1;
    this.hand.visible = this.aboard && this.activeAction?.id === 'pet' && pose.handReach > 0;
    this.updateHandOpacity();
    if (!this.hand.visible) return;
    this.head.getWorldPosition(this.headPosition);
    this.headPoseRoot.worldToLocal(this.headPosition);
    this.applyPettingPose();
    applyHandJointCurl(this.handJoints, pose.handCurl);
  }

  private updateHeadPosition(): void {
    this.head.getWorldPosition(this.headPosition);
    this.root.worldToLocal(this.headPosition);
  }

  private updateHandOpacity(): void {
    const opacity = this.activeAction?.id === 'pet' ? this.pose.handReach : 1;
    for (const material of this.handMaterials) {
      material.opacity = opacity;
      material.depthWrite = opacity === 1;
    }
  }

  private applyPettingPose(): void {
    const pose = this.pose;
    this.hand.position.copy(this.headPosition);
    this.hand.position.y += 0.14 + pose.handLift * 0.08 + (1 - pose.handReach) * 0.08;
    this.hand.position.z += -0.025 + pose.handStroke * 0.07 - (1 - pose.handReach) * 0.05;
    this.hand.position.x += 0.025 * Math.sin(pose.handStroke * Math.PI);
    this.hand.rotation.set(
      pose.handStroke * 0.09 - pose.handLift * 0.07,
      Math.PI / 2 - 0.3 * (1 - pose.handReach),
      -0.04 - (1 - pose.handReach) * 0.18,
    );
  }

}

function preparePettingHand(root: Group, handMaterials: Set<Material>): void {
  const skinTint = new Color(0xb78c72);
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = false;
    object.receiveShadow = false;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      handMaterials.add(material);
      material.transparent = true;
      material.depthWrite = false;
      material.color.multiply(skinTint);
      material.roughness = Math.max(material.roughness, 0.92);
      material.metalness = 0;
      material.emissive.setHex(0x241812);
      material.emissiveIntensity = 0.2;
      material.flatShading = true;
      material.needsUpdate = true;
    }
  });
  enableItemAmbientOcclusion(root);
}

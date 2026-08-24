import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Skeleton,
  SphereGeometry,
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
const CARLITOS_FEED_DURATION = 0.8;
const PET_CONTACT_PROGRESS = 0.18;

interface ActiveAction {
  readonly id: CarlitosAction;
  readonly duration: number;
  elapsed: number;
  contactSignaled: boolean;
  readonly onContact?: () => void;
  readonly resolve: () => void;
}

export interface CarlitosPresentationConstructionHooks {
  readonly onPropPartCreated?: (
    prop: 'hand' | 'food',
    part: Mesh,
  ) => void;
}

interface OwnedCompanionProp {
  readonly root: Group;
  readonly geometries: Set<BufferGeometry>;
  readonly materials: Set<Material>;
}

export class CarlitosPresentation {
  readonly root = new Group();
  readonly interactionRoot = new Group();
  private readonly poseRoot = new Group();
  private readonly headPoseRoot = new Group();
  private readonly hand: Group;
  private readonly handJoints: readonly HandJoint[];
  private readonly food: Group;
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
    status: 'healthy',
    action: null,
    elapsed: 0,
    duration: CARLITOS_PET_DURATION,
  };
  private status: CarlitosPoseState = 'healthy';
  private activeAction: ActiveAction | null = null;
  private living = false;
  private disposed = false;

  constructor(
    propModels: Pick<PropModelLibrary, 'createPresentation' | 'createEventModel'>,
    hooks: CarlitosPresentationConstructionHooks = {},
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
      this.hand.name = 'carlitos-petting-hand';
      this.hand.scale.setScalar(0.32);
      if (handModel === null) {
        this.handJoints = [];
        this.hand.userData.modelKind = 'unavailable';
      } else {
        this.hand.add(handModel.root);
        const handRig = findImportedHandRig(handModel.root);
        this.handJoints = handRig?.joints ?? [];
        this.hand.userData.modelKind = handRig === null ? 'model' : 'rigged';
        preparePettingHand(handModel.root);
        collectMeshResources(
          handModel.root,
          this.ownedGeometries,
          this.ownedMaterials,
        );
        collectOwnedSkeletons(handModel.root, this.ownedSkeletons);
      }
      const food = createFoodProp(hooks.onPropPartCreated);
      this.food = food.root;
      this.takePropOwnership(food);
      this.root.add(this.hand, this.food);
      this.setLiving(false);
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
    this.status = snapshot === null ? 'healthy' : carlitosPoseState(snapshot);
    this.setLiving(snapshot?.alive === true);
    if (!this.living) this.finishAction();
    this.samplePose();
    this.applyPose();
  }

  play(action: CarlitosAction, onContact?: () => void): Promise<void> {
    if (this.disposed || !this.living) return Promise.resolve();
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

  private setLiving(living: boolean): void {
    this.living = living;
    this.root.visible = living;
    this.interactionRoot.visible = living;
  }

  private takePropOwnership(prop: OwnedCompanionProp): void {
    for (const geometry of prop.geometries) this.ownedGeometries.add(geometry);
    for (const material of prop.materials) this.ownedMaterials.add(material);
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

    this.hand.visible = this.living && pose.handReach !== 0;
    this.hand.position.x = -0.04;
    this.hand.position.y = 0.46
      + (1 - pose.handReach) * 0.07
      - pose.handStroke * 0.1
      + pose.handLift * 0.1;
    this.hand.position.z = -0.36;
    this.hand.rotation.set(
      0.08 + pose.handStroke * 0.04 - pose.handLift * 0.03,
      -Math.PI / 2 + 0.06 + pose.handReach * 0.02,
      0.04 + pose.handStroke * 0.03 - pose.handLift * 0.02,
    );
    applyHandJointCurl(this.handJoints, pose.handCurl);

    this.food.visible = this.living && pose.foodReach !== 0;
    this.food.position.x = 0.5 - pose.foodReach * 0.3;
    this.food.position.y = 0.18 + pose.foodReach * 0.02;
    this.food.position.z = 0.26 - pose.foodReach * 0.15;
    this.food.rotation.y = -0.22 * pose.foodReach;
  }
}

function preparePettingHand(root: Group): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = false;
    object.receiveShadow = false;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      material.color.multiplyScalar(0.82);
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

function createFoodProp(
  onPartCreated?: CarlitosPresentationConstructionHooks['onPropPartCreated'],
): OwnedCompanionProp {
  const root = new Group();
  root.name = 'carlitos-food';
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  try {
    const bowlMaterial = new MeshStandardMaterial({
      color: 0x53646a,
      roughness: 0.82,
      metalness: 0.18,
      flatShading: true,
    });
    materials.add(bowlMaterial);
    const foodMaterial = new MeshStandardMaterial({
      color: 0x754532,
      roughness: 0.98,
      flatShading: true,
    });
    materials.add(foodMaterial);
    const bowlGeometry = new CylinderGeometry(0.2, 0.145, 0.09, 8, 1, false);
    geometries.add(bowlGeometry);
    const bowl = new Mesh(bowlGeometry, bowlMaterial);
    bowl.name = 'carlitos-food:bowl';
    root.add(bowl);
    onPartCreated?.('food', bowl);

    const rationGeometry = new SphereGeometry(0.12, 7, 4);
    geometries.add(rationGeometry);
    const ration = new Mesh(rationGeometry, foodMaterial);
    ration.name = 'carlitos-food:ration';
    ration.position.y = 0.065;
    ration.scale.set(1, 0.38, 0.78);
    ration.rotation.y = 0.24;
    root.add(ration);
    onPartCreated?.('food', ration);
    enableItemAmbientOcclusion(root);
    return { root, geometries, materials };
  } catch (error) {
    cleanupFailedProp(root, geometries, materials);
    throw error;
  }
}

function cleanupFailedProp(
  root: Group,
  geometries: Set<BufferGeometry>,
  materials: Set<Material>,
): void {
  try {
    runCleanupSteps([
      () => root.clear(),
      () => disposeResourceSets(geometries, materials),
    ]);
  } catch {
    // Preserve the prop construction error after each resource runs.
  }
}

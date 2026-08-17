import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';
import type { ItemInstance, ItemInstanceId } from '../game/ItemState';
import { enableItemAmbientOcclusion } from '../rendering/ItemAmbientOcclusion';
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

const ACTION_DURATION = 0.8;

interface ActiveAction {
  readonly id: CarlitosAction;
  readonly duration: number;
  elapsed: number;
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
  private readonly food: Group;
  private readonly modelPresentation: PropPresentation;
  private readonly ownedGeometries = new Set<BufferGeometry>();
  private readonly ownedMaterials = new Set<Material>();
  private readonly pose: MutableCarlitosPose = createCarlitosPose();
  private readonly poseSample: CarlitosPoseSample = {
    status: 'healthy',
    action: null,
    elapsed: 0,
    duration: ACTION_DURATION,
  };
  private status: CarlitosPoseState = 'healthy';
  private activeAction: ActiveAction | null = null;
  private living = false;
  private disposed = false;

  constructor(
    propModels: Pick<PropModelLibrary, 'createPresentation'>,
    hooks: CarlitosPresentationConstructionHooks = {},
  ) {
    this.root.name = 'carlitos-companion';
    const transform = boatStorageTransform(CARLITOS_INSTANCE);
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
      this.headPoseRoot.add(this.modelPresentation.root);
      this.poseRoot.add(this.headPoseRoot);
      this.interactionRoot.add(this.poseRoot);
      this.root.add(this.interactionRoot);

      const hand = createPettingHand(hooks.onPropPartCreated);
      this.hand = hand.root;
      this.takePropOwnership(hand);
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

  play(action: CarlitosAction, duration = ACTION_DURATION): Promise<void> {
    if (this.disposed || !this.living) return Promise.resolve();
    this.finishAction();
    return new Promise((resolve) => {
      this.activeAction = {
        id: action,
        duration: Math.max(0, duration),
        elapsed: 0,
        resolve,
      };
      this.samplePose();
      this.applyPose();
    });
  }

  update(deltaSeconds: number): void {
    if (this.disposed) return;
    this.modelPresentation.update(deltaSeconds);
    const action = this.activeAction;
    if (action === null) return;
    action.elapsed = Math.min(
      action.duration,
      action.elapsed + Math.max(0, deltaSeconds),
    );
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
    this.poseSample.duration = action?.duration ?? ACTION_DURATION;
    sampleCarlitosPoseInto(this.pose, this.poseSample);
  }

  private applyPose(): void {
    const pose = this.pose;
    this.poseRoot.position.y = pose.bodyLift;
    this.poseRoot.rotation.x = pose.bodyPitch + pose.actionLean;
    this.poseRoot.rotation.y = pose.bodyYaw;
    this.headPoseRoot.rotation.x = pose.headPitch;
    this.headPoseRoot.rotation.y = pose.headYaw;

    this.hand.visible = this.living && pose.handReach !== 0;
    this.hand.position.x = 0.62 - pose.handReach * 0.34;
    this.hand.position.y = 0.78 - pose.handReach * 0.24;
    this.hand.position.z = 0.1 + pose.handReach * 0.03;
    this.hand.rotation.z = -0.28 + pose.handReach * 0.18;

    this.food.visible = this.living && pose.foodReach !== 0;
    this.food.position.x = 0.5 - pose.foodReach * 0.3;
    this.food.position.y = 0.18 + pose.foodReach * 0.02;
    this.food.position.z = 0.26 - pose.foodReach * 0.15;
    this.food.rotation.y = -0.22 * pose.foodReach;
  }
}

function createPettingHand(
  onPartCreated?: CarlitosPresentationConstructionHooks['onPropPartCreated'],
): OwnedCompanionProp {
  const root = new Group();
  root.name = 'carlitos-petting-hand';
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  try {
    const skin = new MeshStandardMaterial({
      color: 0xa77658,
      roughness: 0.88,
      flatShading: true,
    });
    materials.add(skin);
    const cloth = new MeshStandardMaterial({
      color: 0x263f46,
      roughness: 0.96,
      flatShading: true,
    });
    materials.add(cloth);
    const palmGeometry = new BoxGeometry(0.24, 0.075, 0.2, 1, 1, 1);
    geometries.add(palmGeometry);
    const palm = new Mesh(palmGeometry, skin);
    palm.name = 'carlitos-hand:palm';
    palm.rotation.y = -0.08;
    root.add(palm);
    onPartCreated?.('hand', palm);

    const thumbGeometry = new CylinderGeometry(0.025, 0.035, 0.14, 5);
    geometries.add(thumbGeometry);
    const thumb = new Mesh(thumbGeometry, skin);
    thumb.name = 'carlitos-hand:thumb';
    thumb.position.set(-0.12, -0.005, 0.035);
    thumb.rotation.z = 1.08;
    root.add(thumb);
    onPartCreated?.('hand', thumb);

    for (let index = 0; index < 3; index += 1) {
      const fingerGeometry = new BoxGeometry(
        0.055,
        0.045,
        0.2 - index * 0.012,
        1,
        1,
        1,
      );
      geometries.add(fingerGeometry);
      const finger = new Mesh(fingerGeometry, skin);
      finger.name = `carlitos-hand:finger-${index + 1}`;
      finger.position.set(-0.064 + index * 0.066, -0.045, -0.17);
      finger.rotation.x = 0.08 + index * 0.025;
      finger.rotation.y = (index - 1) * 0.035;
      root.add(finger);
      onPartCreated?.('hand', finger);
    }

    const cuffGeometry = new CylinderGeometry(0.13, 0.155, 0.16, 7);
    geometries.add(cuffGeometry);
    const cuff = new Mesh(cuffGeometry, cloth);
    cuff.name = 'carlitos-hand:cuff';
    cuff.position.z = 0.19;
    cuff.rotation.x = Math.PI / 2;
    root.add(cuff);
    onPartCreated?.('hand', cuff);
    enableItemAmbientOcclusion(root);
    return { root, geometries, materials };
  } catch (error) {
    cleanupFailedProp(root, geometries, materials);
    throw error;
  }
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

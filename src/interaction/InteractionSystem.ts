import { interactionText } from '../i18n/interactionMessages';
import {
  Matrix4,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  Vector2,
  Vector3,
  type Intersection,
} from 'three';
import {
  ITEM_DEFINITIONS,
  ITEM_LABELS,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import {
  segmentBoxInterval,
  type CollisionBox,
} from '../player/collisions';

export type RayTarget = 'none' | 'item' | 'deposit';

const STANDARD_INTERACTION_DISTANCE = 3.2;
const LIFEBOAT_INTERACTION_DISTANCE = 6.5;

export interface ContextInput {
  target: RayTarget;
  targetItem: ItemInstance | null;
  dropPoint?: Vector3;
  carriedItem: ItemInstance | null;
  remainingCapacity: number;
  nearEvacuation: boolean;
}

export type ContextAction =
  | { type: 'none'; prompt: '' }
  | { type: 'pickUp'; item: ItemInstance; prompt: string }
  | { type: 'drop'; item: ItemInstance; point: Vector3; prompt: string }
  | { type: 'depositBundle'; prompt: string }
  | { type: 'capacityFull'; prompt: string }
  | { type: 'evacuate'; prompt: string };

export function chooseContextAction(input: ContextInput): ContextAction {
  if (input.target === 'deposit' && input.carriedItem) {
    return {
      type: 'depositBundle',
      get prompt() { return interactionText('store'); },
    };
  }
  if (input.target === 'item' && input.targetItem) {
    const definition = ITEM_DEFINITIONS[input.targetItem.type];
    if (definition.weight > input.remainingCapacity) {
      return {
        type: 'capacityFull',
        get prompt() { return interactionText('capacity', definition.label, definition.weight, input.remainingCapacity); },
      };
    }
    return {
      type: 'pickUp',
      item: input.targetItem,
      get prompt() { return interactionText('pickup', definition.label); },
    };
  }
  if (input.nearEvacuation && !input.carriedItem) {
    return { type: 'evacuate', get prompt() { return interactionText('evacuate'); } };
  }
  if (input.carriedItem && input.dropPoint) {
    return {
      type: 'drop',
      item: input.carriedItem,
      point: input.dropPoint,
      get prompt() { return interactionText('drop', ITEM_LABELS[input.carriedItem!.type]); },
    };
  }
  return { type: 'none', prompt: '' };
}

function findTaggedAncestor(object: Object3D | null): Object3D | null {
  let current = object;
  let item: Object3D | null = null;
  while (current) {
    if (current.name === 'lifeboat' || current.userData.boatDepositTarget === true) {
      return current;
    }
    if (!item && current.userData.instanceId) item = current;
    current = current.parent;
  }
  return item;
}

export interface InteractionTarget {
  target: RayTarget;
  targetItem: ItemInstance | null;
  dropPoint?: Vector3;
}

export interface InteractionDropFloor {
  readonly y: number;
  readonly bounds: {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
  };
  readonly colliders: readonly CollisionBox[];
}

export interface InteractionOcclusion {
  readonly root: Object3D;
  readonly colliders: readonly CollisionBox[];
  readonly dropFloor?: InteractionDropFloor;
}

interface RaycastSelection {
  hit: Intersection<Object3D> | undefined;
  tagged: Object3D | null;
  item: ItemInstance | null;
}

export class InteractionSystem {
  private readonly raycaster = new Raycaster();
  private readonly center = new Vector2(0, 0);
  private readonly targets: Object3D[] = [];
  private readonly hits: Intersection<Object3D>[] = [];
  private readonly inverseOcclusionMatrix = new Matrix4();
  private readonly localRayStart = new Vector3();
  private readonly localRayEnd = new Vector3();
  private readonly localTarget = new Vector3();
  private readonly localDropPoint = new Vector3();
  private readonly worldDropPoint = new Vector3();
  private readonly selection: RaycastSelection = {
    hit: undefined,
    tagged: null,
    item: null,
  };

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly occlusion?: InteractionOcclusion,
  ) {
    this.raycaster.far = STANDARD_INTERACTION_DISTANCE;
  }

  private itemIsOccluded(worldTarget: Vector3): boolean {
    if (!this.occlusion) return false;
    this.occlusion.root.updateWorldMatrix(true, false);
    this.inverseOcclusionMatrix.copy(this.occlusion.root.matrixWorld).invert();
    this.localRayStart.copy(this.raycaster.ray.origin).applyMatrix4(this.inverseOcclusionMatrix);
    this.localTarget.copy(worldTarget).applyMatrix4(this.inverseOcclusionMatrix);
    for (const collider of this.occlusion.colliders) {
      if (segmentBoxInterval(this.localRayStart, this.localTarget, collider)) return true;
    }
    return false;
  }

  private aimedDropPoint(): Vector3 | undefined {
    const floor = this.occlusion?.dropFloor;
    if (!this.occlusion || !floor) return undefined;
    this.occlusion.root.updateWorldMatrix(true, false);
    this.inverseOcclusionMatrix.copy(this.occlusion.root.matrixWorld).invert();
    this.localRayStart.copy(this.raycaster.ray.origin).applyMatrix4(this.inverseOcclusionMatrix);
    this.localRayEnd
      .copy(this.raycaster.ray.direction)
      .multiplyScalar(this.raycaster.far)
      .add(this.raycaster.ray.origin)
      .applyMatrix4(this.inverseOcclusionMatrix);
    const verticalTravel = this.localRayEnd.y - this.localRayStart.y;
    if (Math.abs(verticalTravel) < 1e-9) return undefined;
    const ratio = (floor.y - this.localRayStart.y) / verticalTravel;
    if (ratio <= 0 || ratio > 1) return undefined;
    this.localDropPoint.lerpVectors(this.localRayStart, this.localRayEnd, ratio);
    if (
      this.localDropPoint.x < floor.bounds.minX
      || this.localDropPoint.x > floor.bounds.maxX
      || this.localDropPoint.z < floor.bounds.minZ
      || this.localDropPoint.z > floor.bounds.maxZ
      || floor.colliders.some((collider) =>
        segmentBoxInterval(this.localRayStart, this.localDropPoint, collider))
    ) return undefined;
    return this.worldDropPoint
      .copy(this.localDropPoint)
      .applyMatrix4(this.occlusion.root.matrixWorld);
  }

  update(
    items: readonly Object3D[],
    lifeboat: Object3D,
    depositTarget: Object3D,
    instances: ReadonlyMap<ItemInstanceId, ItemInstance>,
    canReachLifeboat = true,
  ): InteractionTarget {
    this.updateWorldMatrices(items, lifeboat, depositTarget);
    this.raycaster.setFromCamera(this.center, this.camera);
    const dropPoint = this.aimedDropPoint();
    this.selectItemTarget(items, depositTarget, instances);
    this.selectLifeboatTarget(lifeboat, canReachLifeboat);
    return this.interactionTarget(dropPoint);
  }

  private updateWorldMatrices(
    items: readonly Object3D[],
    lifeboat: Object3D,
    depositTarget: Object3D,
  ): void {
    this.camera.updateWorldMatrix(true, false);
    items.forEach((item) => item.updateWorldMatrix(true, true));
    lifeboat.updateWorldMatrix(true, true);
    depositTarget.updateWorldMatrix(true, true);
  }

  private selectItemTarget(
    items: readonly Object3D[],
    depositTarget: Object3D,
    instances: ReadonlyMap<ItemInstanceId, ItemInstance>,
  ): void {
    this.targets.length = 0;
    for (const item of items) this.targets.push(item);
    this.targets.push(depositTarget);
    const hits = this.hits;
    hits.length = 0;
    this.raycaster.intersectObjects(this.targets, true, hits);
    const selection = this.selection;
    selection.hit = hits[0];
    selection.tagged = findTaggedAncestor(selection.hit?.object ?? null);
    if (selection.tagged?.userData.boatDepositTarget === true) {
      this.selectItemBehindDeposit(hits, instances);
    }
    selection.item = this.instanceForTaggedObject(instances);
    if (selection.item !== null && selection.hit && this.itemIsOccluded(selection.hit.point)) {
      selection.tagged = null;
      selection.item = null;
    }
  }

  private selectItemBehindDeposit(
    hits: readonly Intersection<Object3D>[],
    instances: ReadonlyMap<ItemInstanceId, ItemInstance>,
  ): void {
    for (let index = 1; index < hits.length; index += 1) {
      const candidate = findTaggedAncestor(hits[index]!.object);
      if (candidate?.name === 'lifeboat') return;
      const instanceId = candidate?.userData.instanceId as ItemInstanceId | undefined;
      if (instanceId === undefined || !instances.has(instanceId)) continue;
      this.selection.tagged = candidate;
      this.selection.hit = hits[index];
      return;
    }
  }

  private instanceForTaggedObject(
    instances: ReadonlyMap<ItemInstanceId, ItemInstance>,
  ): ItemInstance | null {
    const instanceId = this.selection.tagged?.userData.instanceId as ItemInstanceId | undefined;
    return instanceId === undefined ? null : instances.get(instanceId) ?? null;
  }

  private selectLifeboatTarget(lifeboat: Object3D, canReachLifeboat: boolean): void {
    if (this.selection.tagged !== null || !canReachLifeboat) return;
    this.raycaster.far = LIFEBOAT_INTERACTION_DISTANCE;
    this.hits.length = 0;
    this.raycaster.intersectObject(lifeboat, true, this.hits);
    this.selection.hit = this.hits[0];
    this.raycaster.far = STANDARD_INTERACTION_DISTANCE;
    this.selection.tagged = findTaggedAncestor(this.selection.hit?.object ?? null);
  }

  private interactionTarget(dropPoint: Vector3 | undefined): InteractionTarget {
    const { tagged, item } = this.selection;
    if (tagged === null) return dropPoint
      ? { target: 'none', targetItem: null, dropPoint }
      : { target: 'none', targetItem: null };
    if (tagged.name === 'lifeboat' || tagged.userData.boatDepositTarget === true) {
      return { target: 'deposit', targetItem: null };
    }
    return item ? { target: 'item', targetItem: item } : { target: 'none', targetItem: null };
  }
}

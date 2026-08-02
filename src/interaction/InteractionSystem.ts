import {
  Matrix4,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  Vector2,
  Vector3,
} from 'three';
import {
  ITEM_DEFINITIONS,
  ITEM_LABELS,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import { HoverOutline } from '../rendering/HoverOutline';
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
      prompt: 'LEFT CLICK — STORE CARRIED SUPPLIES',
    };
  }
  if (input.target === 'item' && input.targetItem) {
    const definition = ITEM_DEFINITIONS[input.targetItem.type];
    if (definition.weight > input.remainingCapacity) {
      return {
        type: 'capacityFull',
        prompt: `${definition.label} WEIGHS ${definition.weight} — ${input.remainingCapacity} CAPACITY FREE`,
      };
    }
    return {
      type: 'pickUp',
      item: input.targetItem,
      prompt: `LEFT CLICK — PICK UP ${definition.label}`,
    };
  }
  if (input.nearEvacuation && !input.carriedItem) {
    return { type: 'evacuate', prompt: 'LEFT CLICK — EVACUATE NOW' };
  }
  if (input.carriedItem && input.dropPoint) {
    return {
      type: 'drop',
      item: input.carriedItem,
      point: input.dropPoint,
      prompt: `LEFT CLICK — DROP ${ITEM_LABELS[input.carriedItem.type]}`,
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

export class InteractionSystem {
  private readonly raycaster = new Raycaster();
  private readonly center = new Vector2(0, 0);
  private readonly hoverOutline = new HoverOutline();
  private readonly inverseOcclusionMatrix = new Matrix4();
  private readonly localRayStart = new Vector3();
  private readonly localRayEnd = new Vector3();
  private readonly localTarget = new Vector3();
  private readonly localDropPoint = new Vector3();
  private readonly worldDropPoint = new Vector3();

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
    this.camera.updateWorldMatrix(true, false);
    items.forEach((item) => item.updateWorldMatrix(true, true));
    lifeboat.updateWorldMatrix(true, true);
    depositTarget.updateWorldMatrix(true, true);
    this.raycaster.setFromCamera(this.center, this.camera);
    const dropPoint = this.aimedDropPoint();
    const hits = this.raycaster.intersectObjects([...items, depositTarget], true);
    let selectedHit = hits[0];
    let tagged = findTaggedAncestor(selectedHit?.object ?? null);
    if (tagged?.userData.boatDepositTarget === true) {
      for (let index = 1; index < hits.length; index += 1) {
        const candidate = findTaggedAncestor(hits[index]!.object);
        if (candidate?.name === 'lifeboat') break;
        if (
          candidate?.userData.instanceId
          && instances.has(candidate.userData.instanceId as ItemInstanceId)
        ) {
          tagged = candidate;
          selectedHit = hits[index];
          break;
        }
      }
    }
    let targetItem = tagged?.userData.instanceId
      ? instances.get(tagged.userData.instanceId as ItemInstanceId) ?? null
      : null;
    if (targetItem !== null && selectedHit && this.itemIsOccluded(selectedHit.point)) {
      tagged = null;
      targetItem = null;
    }
    if (!tagged && canReachLifeboat) {
      this.raycaster.far = LIFEBOAT_INTERACTION_DISTANCE;
      selectedHit = this.raycaster.intersectObject(lifeboat, true)[0];
      this.raycaster.far = STANDARD_INTERACTION_DISTANCE;
      tagged = findTaggedAncestor(selectedHit?.object ?? null);
    }
    this.hoverOutline.setTarget(targetItem === null ? null : tagged);

    if (!tagged) {
      return dropPoint
        ? { target: 'none', targetItem: null, dropPoint }
        : { target: 'none', targetItem: null };
    }
    if (tagged.name === 'lifeboat' || tagged.userData.boatDepositTarget === true) {
      return { target: 'deposit', targetItem: null };
    }
    return targetItem
      ? { target: 'item', targetItem }
      : { target: 'none', targetItem: null };
  }

  dispose(): void {
    this.hoverOutline.dispose();
  }
}

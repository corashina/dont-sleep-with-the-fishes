import {
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  Vector2,
} from 'three';
import {
  ITEM_DEFINITIONS,
  ITEM_LABELS,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';

export type RayTarget = 'none' | 'item' | 'deposit';

export interface ContextInput {
  target: RayTarget;
  targetItem: ItemInstance | null;
  carriedItem: ItemInstance | null;
  remainingCapacity: number;
  nearEvacuation: boolean;
}

export type ContextAction =
  | { type: 'none'; prompt: '' }
  | { type: 'pickUp'; item: ItemInstance; prompt: string }
  | { type: 'drop'; item: ItemInstance; prompt: string }
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
  if (input.carriedItem) {
    return {
      type: 'drop',
      item: input.carriedItem,
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
}

export class InteractionSystem {
  private readonly raycaster = new Raycaster();
  private readonly center = new Vector2(0, 0);
  private highlighted: Object3D | null = null;
  private readonly originalMaterials = new Map<Mesh, Material | Material[]>();
  private readonly highlightMaterials = new Set<MeshStandardMaterial>();

  constructor(private readonly camera: PerspectiveCamera) {
    this.raycaster.far = 3.2;
  }

  update(
    items: readonly Object3D[],
    lifeboat: Object3D,
    depositTarget: Object3D,
    instances: ReadonlyMap<ItemInstanceId, ItemInstance>,
  ): InteractionTarget {
    this.camera.updateWorldMatrix(true, false);
    items.forEach((item) => item.updateWorldMatrix(true, true));
    lifeboat.updateWorldMatrix(true, true);
    depositTarget.updateWorldMatrix(true, true);
    this.raycaster.setFromCamera(this.center, this.camera);
    const hits = this.raycaster.intersectObjects([...items, lifeboat, depositTarget], true);
    let tagged = findTaggedAncestor(hits[0]?.object ?? null);
    if (tagged?.userData.boatDepositTarget === true) {
      for (let index = 1; index < hits.length; index += 1) {
        const candidate = findTaggedAncestor(hits[index]!.object);
        if (candidate?.name === 'lifeboat') break;
        if (
          candidate?.userData.instanceId
          && instances.has(candidate.userData.instanceId as ItemInstanceId)
        ) {
          tagged = candidate;
          break;
        }
      }
    }
    this.setHighlight(tagged);

    if (!tagged) return { target: 'none', targetItem: null };
    if (tagged.name === 'lifeboat' || tagged.userData.boatDepositTarget === true) {
      return { target: 'deposit', targetItem: null };
    }
    const targetItem = instances.get(tagged.userData.instanceId as ItemInstanceId) ?? null;
    return targetItem
      ? { target: 'item', targetItem }
      : { target: 'none', targetItem: null };
  }

  dispose(): void {
    this.setHighlight(null);
  }

  private setHighlight(next: Object3D | null): void {
    if (next === this.highlighted) return;
    this.clearHighlight();
    this.highlighted = next;
    if (!next) return;

    const clonesByOriginal = new Map<MeshStandardMaterial, MeshStandardMaterial>();
    next.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const originals = object.material;
      const materials = Array.isArray(originals) ? originals : [originals];
      let changed = false;
      const highlighted = materials.map((material) => {
        if (!(material instanceof MeshStandardMaterial)) return material;
        changed = true;
        let clone = clonesByOriginal.get(material);
        if (!clone) {
          clone = material.clone();
          clone.emissive.setHex(0x8b7650);
          clone.emissiveIntensity = 0.45;
          clonesByOriginal.set(material, clone);
          this.highlightMaterials.add(clone);
        }
        return clone;
      });
      if (!changed) return;
      this.originalMaterials.set(object, originals);
      object.material = Array.isArray(originals) ? highlighted : highlighted[0]!;
    });
  }

  private clearHighlight(): void {
    this.originalMaterials.forEach((material, mesh) => {
      mesh.material = material;
    });
    this.originalMaterials.clear();
    this.highlightMaterials.forEach((material) => material.dispose());
    this.highlightMaterials.clear();
    this.highlighted = null;
  }
}

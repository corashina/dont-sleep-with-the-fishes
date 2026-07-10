import {
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  Vector2,
} from 'three';
import { ITEM_LABELS, type ItemId } from '../game/ItemState';

export type RayTarget = 'none' | 'item' | 'lifeboat';

export type ContextAction =
  | { type: 'none'; prompt: '' }
  | { type: 'pickUp'; itemId: ItemId; prompt: string }
  | { type: 'drop'; itemId: ItemId; prompt: string }
  | { type: 'throwToBoat'; itemId: ItemId; prompt: string }
  | { type: 'boatFull'; prompt: string }
  | { type: 'evacuate'; prompt: string };

export interface ContextInput {
  target: RayTarget;
  itemId: ItemId | null;
  carriedItem: ItemId | null;
  savedCount: number;
  nearEvacuation: boolean;
}

export function chooseContextAction(input: ContextInput): ContextAction {
  if (input.target === 'lifeboat' && input.carriedItem && input.savedCount >= 5) {
    return { type: 'boatFull', prompt: 'LIFEBOAT FULL — DROP SOMETHING ELSE' };
  }
  if (input.target === 'lifeboat' && input.carriedItem) {
    return {
      type: 'throwToBoat',
      itemId: input.carriedItem,
      prompt: `E — THROW ${ITEM_LABELS[input.carriedItem]} TO LIFEBOAT`,
    };
  }
  if (input.target === 'item' && input.itemId && !input.carriedItem) {
    return {
      type: 'pickUp',
      itemId: input.itemId,
      prompt: `E — PICK UP ${ITEM_LABELS[input.itemId]}`,
    };
  }
  if (input.nearEvacuation && !input.carriedItem) {
    return { type: 'evacuate', prompt: 'E — EVACUATE NOW' };
  }
  if (input.carriedItem) {
    return {
      type: 'drop',
      itemId: input.carriedItem,
      prompt: `E — DROP ${ITEM_LABELS[input.carriedItem]}`,
    };
  }
  return { type: 'none', prompt: '' };
}

function findTaggedAncestor(object: Object3D | null): Object3D | null {
  let current = object;
  let item: Object3D | null = null;
  while (current) {
    if (current.name === 'lifeboat') return current;
    if (!item && current.userData.itemId) item = current;
    current = current.parent;
  }
  return item;
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
  ): { target: RayTarget; itemId: ItemId | null } {
    this.camera.updateWorldMatrix(true, false);
    items.forEach((item) => item.updateWorldMatrix(true, true));
    lifeboat.updateWorldMatrix(true, true);
    this.raycaster.setFromCamera(this.center, this.camera);
    const hit = this.raycaster.intersectObjects([...items, lifeboat], true)[0];
    const tagged = findTaggedAncestor(hit?.object ?? null);
    this.setHighlight(tagged?.userData.itemId ? tagged : null);
    if (!tagged) return { target: 'none', itemId: null };
    if (tagged.name === 'lifeboat') return { target: 'lifeboat', itemId: null };
    return { target: 'item', itemId: tagged.userData.itemId as ItemId };
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

import { Group, Material, Mesh, Skeleton, SkinnedMesh } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { HOVER_OUTLINE_NAME } from '../rendering/HoverOutline';
import { disposeResourceSets } from '../world/SceneResources';
import type { BoatSupplyPresentationRecord } from './BoatSupplyDisplay';

export class MimicSupplies {
  readonly root = new Group();
  private readonly materials = new Set<Material>();
  private readonly skeletons = new Set<Skeleton>();

  constructor() {
    this.root.name = 'mimic-supplies';
    // Combined with the boat's half turn, this reflects the layout across the gap.
    this.root.scale.x = -1;
  }

  capture(records: readonly BoatSupplyPresentationRecord[]): void {
    this.clear();
    const copies = new Map<Material, Material>();
    const copyMaterial = (source: Material): Material => {
      let material = copies.get(source);
      if (material === undefined) {
        material = source.clone();
        copies.set(source, material);
        this.materials.add(material);
      }
      return material;
    };
    for (const record of records) {
      if (!record.root.visible || record.visibleCopies === 0) continue;
      const copy = clone(record.root);
      copy.getObjectByName(HOVER_OUTLINE_NAME)?.removeFromParent();
      copy.traverse(object => {
        if (!(object instanceof Mesh)) return;
        object.castShadow = false;
        object.material = Array.isArray(object.material)
          ? object.material.map(copyMaterial) : copyMaterial(object.material);
        if (object instanceof SkinnedMesh) this.skeletons.add(object.skeleton);
      });
      this.root.add(copy);
    }
  }

  clear(): void {
    this.root.clear();
    // Geometry and textures remain owned by the player supply display.
    disposeResourceSets(this.materials, this.skeletons);
  }
}

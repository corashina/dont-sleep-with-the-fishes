import { BackSide, Box3, BufferGeometry, DoubleSide, Material, Matrix4, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { ITEM_DEFINITIONS, type ItemId } from '../game/ItemState';
import { createBrokenGeometry } from './brokenItemGeometry';

export interface ItemConditionBinding {
  readonly mesh: Mesh;
  readonly usableGeometry: BufferGeometry;
  readonly brokenGeometry: BufferGeometry;
  readonly usableMaterial: Material | Material[];
  readonly brokenMaterial: Material | Material[];
}

/** Prepare once. Condition changes only swap owned resources. */
export function prepareItemCondition(
  root: Object3D,
  itemId: ItemId,
  ownedGeometries: Set<BufferGeometry>,
  ownedMaterials: Set<Material>,
): readonly ItemConditionBinding[] {
  if (!ITEM_DEFINITIONS[itemId].breakable) return [];
  root.updateWorldMatrix(true, true);
  const toRoot = root.matrixWorld.clone().invert();
  const bounds = new Box3();
  const meshes: Mesh[] = [];
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    meshes.push(object);
    object.geometry.computeBoundingBox();
    bounds.union(object.geometry.boundingBox!.clone().applyMatrix4(
      new Matrix4().multiplyMatrices(toRoot, object.matrixWorld),
    ));
  });
  if (bounds.isEmpty()) return [];
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const scale = 1 / Math.max(size.x, size.y, size.z);
  const normalize = new Matrix4().makeScale(scale, scale, scale)
    .multiply(new Matrix4().makeTranslation(-center.x, -center.y, -center.z));
  const materials = new Map<Material, Material>();
  const damagedMaterial = (source: Material): Material => {
    const cached = materials.get(source);
    if (cached !== undefined) return cached;
    const clone = source.clone();
    // Open tank walls must show their holes, not bright inward-facing surfaces.
    clone.side = itemId === 'scubaSet' ? source.side : DoubleSide;
    materials.set(source, clone);
    ownedMaterials.add(clone);
    return clone;
  };
  const bindings: ItemConditionBinding[] = [];
  for (const mesh of meshes) {
    const toUnit = normalize.clone().multiply(toRoot).multiply(mesh.matrixWorld);
    const baseMaterials = Array.isArray(mesh.material) ? mesh.material.map(damagedMaterial) : [damagedMaterial(mesh.material)];
    const brokenGeometry = createBrokenGeometry(mesh.geometry, toUnit, itemId);
    const rim = brokenGeometry.groups.at(-1);
    if (itemId === 'scubaSet' && rim?.materialIndex === baseMaterials.length) {
      const edge = new MeshStandardMaterial({ color: 0x62605a, roughness: 0.82, metalness: 0.35, side: DoubleSide });
      const inside = new MeshStandardMaterial({ color: 0x151c20, roughness: 1, side: BackSide });
      brokenGeometry.addGroup(0, rim.start, baseMaterials.length + 1);
      baseMaterials.push(edge, inside);
      ownedMaterials.add(edge);
      ownedMaterials.add(inside);
    }
    ownedGeometries.add(brokenGeometry);
    bindings.push({
      mesh,
      usableGeometry: mesh.geometry,
      brokenGeometry,
      usableMaterial: mesh.material,
      brokenMaterial: baseMaterials.length === 1 ? baseMaterials[0]! : baseMaterials,
    });
  }
  return bindings;
}

export function setItemBroken(bindings: readonly ItemConditionBinding[], broken: boolean): void {
  for (const binding of bindings) {
    binding.mesh.geometry = broken ? binding.brokenGeometry : binding.usableGeometry;
    binding.mesh.material = broken ? binding.brokenMaterial : binding.usableMaterial;
  }
}

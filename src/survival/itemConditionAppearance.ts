import { Box3, BufferGeometry, DoubleSide, Material, Matrix4, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { ITEM_DEFINITIONS, type ItemId } from '../game/ItemState';
import { createBrokenGeometry, type DamageSurface } from './brokenItemGeometry';

function isScubaMask(mesh: Mesh): boolean {
  let part: Object3D | null = mesh;
  while (part !== null) {
    if (part.name.includes('glasses') || part.name.includes('scubaGoggles')) return true;
    part = part.parent;
  }
  return false;
}

function damageSurface(itemId: ItemId, mesh: Mesh): DamageSurface {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const hasMaterial = (name: string): boolean => materials.some((material) => material.name === name);
  switch (itemId) {
    case 'compass': return hasMaterial('mat24') ? 'glass' : 'none';
    case 'scubaSet': {
      if (!isScubaMask(mesh)) return 'none';
      return hasMaterial('Material.016') ? 'glass' : 'body';
    }
    case 'fishingNet': return hasMaterial('fishnet_net') ? 'fabric' : 'none';
    case 'flashlight': return hasMaterial('mat24') ? 'glass' : 'body';
    case 'map': return 'fabric';
    default: return 'body';
  }
}

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
    clone.side = DoubleSide;
    materials.set(source, clone);
    ownedMaterials.add(clone);
    return clone;
  };
  const bindings: ItemConditionBinding[] = [];
  for (const mesh of meshes) {
    const surface = damageSurface(itemId, mesh);
    if (surface === 'none') continue;
    const toUnit = normalize.clone().multiply(toRoot).multiply(mesh.matrixWorld);
    const baseMaterials = Array.isArray(mesh.material) ? mesh.material.map(damagedMaterial) : [damagedMaterial(mesh.material)];
    const brokenGeometry = createBrokenGeometry(mesh.geometry, toUnit, itemId, surface, baseMaterials.length);
    if (surface === 'glass') {
      const crackMaterial = new MeshStandardMaterial({
        color: itemId === 'scubaSet' ? 0xd9cbb0 : 0x342c28,
        roughness: 0.92, side: DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      baseMaterials.push(crackMaterial);
      ownedMaterials.add(crackMaterial);
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

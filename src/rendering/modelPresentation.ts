import {
  Box3,
  BufferGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Skeleton,
  SkinnedMesh,
  Texture,
  Vector3,
} from 'three';
import { collectMeshResources, disposeResourceSets } from '../world/SceneResources';

export function hasRenderableBounds(root: Object3D): boolean {
  try {
    let hasMesh = false;
    root.traverse((object) => {
      if (object instanceof Mesh) hasMesh = true;
    });
    if (!hasMesh) return false;
    const bounds = new Box3().setFromObject(root);
    const size = bounds.getSize(new Vector3());
    return !bounds.isEmpty()
      && [size.x, size.y, size.z].every(Number.isFinite)
      && Math.max(size.x, size.y, size.z) > 0;
  } catch {
    return false;
  }
}

export function collectOwnedSkeletons(root: Object3D, output: Set<Skeleton>): void {
  root.traverse((object) => {
    if (object instanceof SkinnedMesh) output.add(object.skeleton);
  });
}

export function disposeSkeletons(skeletons: Set<Skeleton>): void {
  for (const skeleton of skeletons) skeleton.dispose();
  skeletons.clear();
}

export function disposeRejectedModel(root: Group, includeSkeletons = false): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  collectMeshResources(root, geometries, materials);
  if (includeSkeletons) {
    const skeletons = new Set<Skeleton>();
    collectOwnedSkeletons(root, skeletons);
    disposeSkeletons(skeletons);
  }
  disposeResourceSets(geometries, materials);
  root.clear();
}

export function setFlatShading(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      material.flatShading = true;
      material.needsUpdate = true;
    }
  });
}

export function collectMaterialTextures(
  materials: Iterable<Material>,
  output = new Set<Texture>(),
): Set<Texture> {
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof Texture) output.add(value);
    }
  }
  return output;
}

export function modelTriangleCount(root: Object3D, missingPositionMessage: string): number {
  let triangles = 0;
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const position = object.geometry.getAttribute('position');
    if (!position) throw new Error(missingPositionMessage);
    triangles += (object.geometry.index?.count ?? position.count) / 3;
  });
  return triangles;
}

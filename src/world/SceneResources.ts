import { type BufferGeometry, type Material, Mesh, type Object3D } from 'three';

export type MeshResourceAddition =
  | { readonly kind: 'geometry'; readonly resource: BufferGeometry }
  | { readonly kind: 'material'; readonly resource: Material };

interface DisposableResource {
  dispose(): void;
}

interface OwnedDisposableSet<T extends DisposableResource = DisposableResource> extends Iterable<T> {
  clear(): void;
}

export function collectMeshResources(
  root: Object3D,
  geometries: Set<BufferGeometry>,
  materials: Set<Material>,
  onAdd?: (addition: MeshResourceAddition) => void,
): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    if (!geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      onAdd?.({ kind: 'geometry', resource: object.geometry });
    }
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    meshMaterials.forEach((material) => {
      if (materials.has(material)) return;
      materials.add(material);
      onAdd?.({ kind: 'material', resource: material });
    });
  });
}

export function disposeMeshResources(
  geometries: Set<BufferGeometry>,
  materials: Set<Material>,
): void {
  disposeResourceSets(geometries, materials);
}

export function disposeResourceSets(
  ...sets: readonly OwnedDisposableSet[]
): void {
  let firstError: unknown;
  let failed = false;
  try {
    for (const resources of sets) {
      for (const resource of resources) {
        try {
          resource.dispose();
        } catch (error) {
          if (!failed) {
            failed = true;
            firstError = error;
          }
        }
      }
    }
  } finally {
    sets.forEach((resources) => resources.clear());
  }
  if (failed) throw firstError;
}

import {
  BufferGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import {
  collectMeshResources,
  disposeResourceSets,
  runCleanupSteps,
} from '../world/SceneResources';

export interface SurvivalLantern {
  readonly root: Group;
  dispose(): void;
}

export function createSurvivalLantern(model: Group): SurvivalLantern {
  const root = new Group();
  root.name = 'survival-lantern';
  root.position.set(1.05, 0.235, 0.78);
  root.rotation.y = -0.12;

  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const glowingMaterials = new Set<MeshStandardMaterial>();
  model.name = 'survival-lantern:model';
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    // The source lantern is one opaque mesh. Let the flame light escape while
    // nearby boat supplies still cast shadows.
    object.castShadow = false;
    object.receiveShadow = true;
    const meshMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    meshMaterials.forEach((material) => {
      if (!(material instanceof MeshStandardMaterial) || glowingMaterials.has(material)) return;
      glowingMaterials.add(material);
      material.emissive.setHex(0xffc56a);
      material.emissiveIntensity = 1.35;
      material.emissiveMap = material.map;
    });
  });
  collectMeshResources(model, geometries, materials);

  root.add(model);

  let disposed = false;
  return {
    root,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      runCleanupSteps([
        () => disposeResourceSets(geometries, materials),
        () => root.clear(),
      ]);
    },
  };
}

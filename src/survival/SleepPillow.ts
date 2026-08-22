import {
  BufferGeometry,
  Group,
  Material,
  Mesh,
} from 'three';
import {
  collectMeshResources,
  disposeResourceSets,
  runCleanupSteps,
} from '../world/SceneResources';

export interface SleepPillow {
  readonly root: Group;
  dispose(): void;
}

export function createSleepPillow(model: Group): SleepPillow {
  const root = new Group();
  root.name = 'sleep-pillow';
  root.position.set(1.05, 0.235, 0.78);
  root.rotation.y = -0.12;

  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  model.name = 'sleep-pillow:model';
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
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

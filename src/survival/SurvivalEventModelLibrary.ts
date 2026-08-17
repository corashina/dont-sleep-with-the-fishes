import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Texture,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  collectMeshResources,
  disposeResourceSets,
} from '../world/SceneResources';
import {
  collectMaterialTextures,
  modelTriangleCount,
} from '../rendering/modelPresentation';
import {
  SURVIVAL_EVENT_MODEL_IDS,
  SURVIVAL_EVENT_MODEL_SPECS,
  type SurvivalEventModelId,
  type SurvivalEventModelSpec,
} from './eventModelManifest';

export interface SurvivalEventModels {
  clone(id: SurvivalEventModelId): Group;
}

export const EMPTY_SURVIVAL_EVENT_MODELS: SurvivalEventModels = Object.freeze({
  clone(id: SurvivalEventModelId): Group {
    const root = new Group();
    root.name = `event-model:${id}:empty`;
    root.userData.eventModelId = id;
    root.userData.eventModelSource = 'empty';
    return root;
  },
});

export interface SurvivalEventModelLoader {
  load(url: string): Promise<Object3D>;
}

class GltfSurvivalEventModelLoader implements SurvivalEventModelLoader {
  private readonly loader = new GLTFLoader();

  async load(url: string): Promise<Object3D> {
    return (await this.loader.loadAsync(url)).scene;
  }
}

function prepareLoadedTemplate(
  id: SurvivalEventModelId,
  source: Object3D,
  spec: SurvivalEventModelSpec,
): Group {
  const root = new Group();
  root.name = `event-model:${id}`;
  root.userData.eventModelId = id;
  root.userData.eventModelSource = 'poly-pizza';
  root.add(source);
  source.rotation.set(...spec.rotation);
  root.updateMatrixWorld(true);

  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  collectMeshResources(root, geometries, materials);
  const triangles = modelTriangleCount(root, 'Event model has no position data.');
  if (geometries.size === 0 || triangles <= 0 || triangles > spec.maxTriangles) {
    disposeResourceSets(geometries, materials);
    throw new Error(`Event model ${id} failed its geometry budget.`);
  }

  const bounds = new Box3().setFromObject(root, true);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(longest) || longest <= 0) {
    disposeResourceSets(geometries, materials);
    throw new Error(`Event model ${id} has invalid bounds.`);
  }
  source.position.sub(center);
  root.scale.setScalar(spec.targetLongestDimension / longest);
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of meshMaterials) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      material.flatShading = true;
      material.roughness = Math.max(0.72, material.roughness);
      material.metalness = Math.min(0.08, material.metalness);
      material.needsUpdate = true;
    }
  });
  root.updateMatrixWorld(true);
  return root;
}

function fallbackTemplate(id: SurvivalEventModelId): Group {
  const root = new Group();
  root.name = `event-model:${id}:fallback`;
  root.userData.eventModelId = id;
  root.userData.eventModelSource = 'fallback';
  const material = new MeshStandardMaterial({
    color: id === 'flowers' ? 0x66735a : id === 'driftingBottle' ? 0x425d54 : 0x6a5545,
    roughness: 0.82,
    metalness: 0.02,
    flatShading: true,
  });
  const addPart = (name: string, size: readonly [number, number, number], y: number): void => {
    const mesh = new Mesh(new BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.y = y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  };
  if (id === 'mysteryChest') {
    addPart('Chest_Base', [1.15, 0.55, 0.78], 0);
    addPart('Chest_Top', [1.15, 0.3, 0.78], 0.42);
  } else {
    const dimensions: readonly [number, number, number] = id === 'driftingBottle'
      ? [0.18, 0.68, 0.18]
      : id === 'checkBackFish' ? [1.05, 0.42, 0.3]
        : id === 'flowers' ? [0.9, 0.08, 0.75]
          : [1, 0.72, 0.72];
    addPart(`event-model:${id}:body`, dimensions, 0);
  }
  return root;
}

export class SurvivalEventModelLibrary implements SurvivalEventModels {
  private readonly templates = new Map<SurvivalEventModelId, Group>();
  private readonly geometries = new Set<BufferGeometry>();
  private readonly materials = new Set<Material>();
  private readonly textures = new Set<Texture>();
  private disposed = false;

  private constructor(templates: ReadonlyMap<SurvivalEventModelId, Group>) {
    for (const [id, root] of templates) {
      this.templates.set(id, root);
      collectMeshResources(root, this.geometries, this.materials);
    }
    collectMaterialTextures(this.materials, this.textures);
  }

  static async load(
    loader: SurvivalEventModelLoader = new GltfSurvivalEventModelLoader(),
  ): Promise<SurvivalEventModelLibrary> {
    const entries = await Promise.all(SURVIVAL_EVENT_MODEL_IDS.map(async (id) => {
      const spec = SURVIVAL_EVENT_MODEL_SPECS[id];
      try {
        const source = await loader.load(spec.url);
        return [id, prepareLoadedTemplate(id, source, spec)] as const;
      } catch {
        return [id, fallbackTemplate(id)] as const;
      }
    }));
    return new SurvivalEventModelLibrary(new Map(entries));
  }

  static fallback(): SurvivalEventModelLibrary {
    return new SurvivalEventModelLibrary(new Map(
      SURVIVAL_EVENT_MODEL_IDS.map((id) => [id, fallbackTemplate(id)]),
    ));
  }

  clone(id: SurvivalEventModelId): Group {
    if (this.disposed) throw new Error('Survival event model library is disposed.');
    const template = this.templates.get(id);
    if (!template) throw new Error(`Unknown survival event model: ${id}`);
    const clone = template.clone(true);
    clone.visible = true;
    return clone;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.templates.clear();
    disposeResourceSets(this.textures, this.geometries, this.materials);
  }
}

import {
  Box3,
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

export class SurvivalEventModelLoadError extends Error {
  constructor(
    readonly eventModelId: SurvivalEventModelId,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`Survival event model ${eventModelId}: ${message}`, options);
    this.name = 'SurvivalEventModelLoadError';
  }
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
    throw new Error(`Event model ${id} failed its geometry budget.`);
  }

  const bounds = new Box3().setFromObject(root, true);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(longest) || longest <= 0) {
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

function disposeTemplates(roots: Iterable<Object3D>): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  for (const root of roots) collectMeshResources(root, geometries, materials);
  collectMaterialTextures(materials, textures);
  disposeResourceSets(textures, geometries, materials);
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
    ids: readonly SurvivalEventModelId[],
    loader: SurvivalEventModelLoader = new GltfSurvivalEventModelLoader(),
  ): Promise<SurvivalEventModelLibrary> {
    const requestedIds = [...new Set(ids)];
    const loadedSources: Array<Object3D | undefined> = new Array(requestedIds.length);
    const results = await Promise.allSettled(requestedIds.map(async (id, index) => {
      const spec = SURVIVAL_EVENT_MODEL_SPECS[id];
      try {
        const source = await loader.load(spec.url);
        loadedSources[index] = source;
        return [id, prepareLoadedTemplate(id, source, spec)] as const;
      } catch (cause) {
        if (cause instanceof SurvivalEventModelLoadError) throw cause;
        const message = cause instanceof Error ? cause.message : String(cause);
        throw new SurvivalEventModelLoadError(id, message, { cause });
      }
    }));

    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failure !== undefined) {
      disposeTemplates(loadedSources.filter(
        (root): root is Object3D => root !== undefined,
      ));
      throw failure.reason;
    }
    const entries = results.map(
      (result) => (result as PromiseFulfilledResult<readonly [SurvivalEventModelId, Group]>).value,
    );
    return new SurvivalEventModelLibrary(new Map(entries));
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

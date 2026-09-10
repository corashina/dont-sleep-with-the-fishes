import {
  BufferGeometry,
  Material,
  Mesh,
  Object3D,
  Skeleton,
  Texture,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { collectMaterialTextures, collectOwnedSkeletons } from '../rendering/modelPresentation';
import { collectMeshResources, disposeResourceSets, ignoreCleanupError } from '../world/SceneResources';
import { catchModelSpec, type FishingCatchModelLoader } from './FishingCatchLibrary';
import { FISHING_CATCHES } from './fishingCatalog';

class GltfFishingModelLoader implements FishingCatchModelLoader {
  private readonly loader = new GLTFLoader();

  async load(url: string): Promise<Object3D> {
    return (await this.loader.loadAsync(url)).scene;
  }
}

function cloneOwnedModel(template: Object3D): Object3D {
  const root = clone(template);
  const geometries = new Map<BufferGeometry, BufferGeometry>();
  const materials = new Map<Material, Material>();
  const textures = new Map<Texture, Texture>();

  const cloneMaterial = (source: Material): Material => {
    const existing = materials.get(source);
    if (existing) return existing;
    const material = source.clone();
    materials.set(source, material);
    for (const [key, value] of Object.entries(source)) {
      if (!(value instanceof Texture)) continue;
      let texture = textures.get(value);
      if (!texture) {
        texture = value.clone();
        textures.set(value, texture);
      }
      (material as unknown as Record<string, unknown>)[key] = texture;
    }
    return material;
  };

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const source: BufferGeometry = object.geometry;
    let geometry = geometries.get(source);
    if (!geometry) {
      geometry = source.clone();
      geometries.set(source, geometry);
    }
    object.geometry = geometry;
    object.material = Array.isArray(object.material)
      ? object.material.map(cloneMaterial)
      : cloneMaterial(object.material);
  });
  return root;
}

/** Owns raw templates for the full fishing catalogue until game disposal. */
export class FishingModelLibrary implements FishingCatchModelLoader {
  private readonly templates = new Map<string, Object3D>();
  private disposed = false;

  private constructor() {}

  static async load(
    loader: FishingCatchModelLoader = new GltfFishingModelLoader(),
  ): Promise<FishingModelLibrary> {
    const urls = new Set<string>();
    for (const definition of FISHING_CATCHES) {
      const spec = catchModelSpec(definition);
      if (spec) urls.add(spec.url);
    }
    const library = new FishingModelLibrary();
    const results = await Promise.allSettled([...urls].map(async (url) => {
      const root = await loader.load(url);
      library.templates.set(url, root);
    }));
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') {
      ignoreCleanupError(() => library.dispose());
      throw failure.reason;
    }
    return library;
  }

  async load(url: string): Promise<Object3D> {
    if (this.disposed) throw new Error('Fishing model library is disposed.');
    const template = this.templates.get(url);
    if (!template) throw new Error(`Missing prepared fishing model: ${url}`);
    return cloneOwnedModel(template);
  }

  preparationRoots(): Iterable<Object3D> {
    return this.templates.values();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    const skeletons = new Set<Skeleton>();
    for (const root of this.templates.values()) {
      collectMeshResources(root, geometries, materials);
      collectOwnedSkeletons(root, skeletons);
      root.removeFromParent();
    }
    this.templates.clear();
    disposeResourceSets(collectMaterialTextures(materials), geometries, materials, skeletons);
  }
}

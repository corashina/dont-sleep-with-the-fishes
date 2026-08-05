import {
  AnimationClip,
  BufferGeometry,
  Group,
  Material,
  Skeleton,
  SkinnedMesh,
  Texture,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {
  MENU_MODEL_IDS,
  MENU_MODEL_SPECS,
  type MenuModelId,
  type MenuModelSpec,
} from './menuModelManifest';
import {
  collectMeshResources,
  disposeResourceSets,
  ignoreCleanupError as attemptCleanup,
} from '../world/SceneResources';
import { normalizeLongestDimensionTemplate } from '../world/modelValidation';

export interface MenuModelLoader {
  load(url: string): Promise<Group>;
}

export interface MenuModelInstance {
  readonly root: Group;
  readonly animations: readonly AnimationClip[];
  dispose(): void;
}

export class MenuModelLoadError extends Error {
  constructor(
    readonly menuModelId: MenuModelId,
    message: string,
    options?: ErrorOptions,
  ) {
    super('Menu model ' + menuModelId + ': ' + message, options);
    this.name = 'MenuModelLoadError';
  }
}

class GltfMenuModelLoader implements MenuModelLoader {
  private readonly loader = new GLTFLoader();

  async load(url: string): Promise<Group> {
    const asset = await this.loader.loadAsync(url);
    asset.scene.animations = asset.animations.slice();
    return asset.scene;
  }
}

function collectSkeletons(root: Group, skeletons: Set<Skeleton>): void {
  root.traverse((object) => {
    if (object instanceof SkinnedMesh) skeletons.add(object.skeleton);
  });
}

function collectMaterialTextures(materials: Iterable<Material>, textures: Set<Texture>): void {
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof Texture) textures.add(value);
    }
  }
}

function disposeTemplateRoots(roots: Iterable<Group>): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const skeletons = new Set<Skeleton>();
  for (const root of roots) {
    collectMeshResources(root, geometries, materials);
    collectSkeletons(root, skeletons);
  }
  collectMaterialTextures(materials, textures);
  disposeResourceSets(geometries, textures, materials, skeletons);
}

function validateSpec(id: MenuModelId, spec: MenuModelSpec | undefined): MenuModelSpec {
  if (!spec) throw new MenuModelLoadError(id, 'manifest entry is missing');
  const metadata = spec.generatedMetadata;
  if (
    !Number.isInteger(metadata.triangles)
    || metadata.triangles <= 0
    || metadata.triangles > spec.maxTriangles
  ) {
    throw new MenuModelLoadError(id, 'generated triangle metadata is invalid');
  }
  const bounds = [metadata.rawBounds.min, metadata.rawBounds.max];
  if (
    bounds.some((values) => values.length !== 3)
    || !bounds.flat().every(Number.isFinite)
    || !metadata.rawBounds.max.some((maximum, axis) => maximum > metadata.rawBounds.min[axis]!)
  ) {
    throw new MenuModelLoadError(id, 'generated bounds metadata is invalid');
  }
  if (
    !Number.isFinite(spec.targetLongestDimension)
    || spec.targetLongestDimension <= 0
    || !spec.rotation.every(Number.isFinite)
  ) {
    throw new MenuModelLoadError(id, 'presentation metadata is invalid');
  }
  return spec;
}

function normalizeTemplate(id: MenuModelId, root: Group, spec: MenuModelSpec): void {
  normalizeLongestDimensionTemplate(
    root,
    { ...spec, offset: [0, 0, 0] },
    (message) => new MenuModelLoadError(id, message),
  );
}

function validateAnimations(id: MenuModelId, animations: readonly AnimationClip[]): void {
  if (id === 'shark' && !animations.some((clip) => clip.name === 'Armature|Swim')) {
    throw new MenuModelLoadError(id, 'required Armature|Swim clip is missing');
  }
}

interface ModelTemplate {
  readonly root: Group;
  readonly animations: readonly AnimationClip[];
}

export class MenuModelLibrary {
  private disposed = false;

  private constructor(private readonly templates: ReadonlyMap<MenuModelId, ModelTemplate>) {}

  static async load(
    loader: MenuModelLoader = new GltfMenuModelLoader(),
  ): Promise<MenuModelLibrary> {
    for (const id of MENU_MODEL_IDS) validateSpec(id, MENU_MODEL_SPECS[id]);

    const loadedRoots: Array<Group | undefined> = new Array(MENU_MODEL_IDS.length);
    const results = await Promise.allSettled(MENU_MODEL_IDS.map(async (id, index) => {
      const root = await loader.load(MENU_MODEL_SPECS[id].url);
      loadedRoots[index] = root;
      normalizeTemplate(id, root, MENU_MODEL_SPECS[id]);
      validateAnimations(id, root.animations);
      return { root, animations: root.animations.slice() } satisfies ModelTemplate;
    }));

    const failedIndex = results.findIndex((result) => result.status === 'rejected');
    if (failedIndex >= 0) {
      const id = MENU_MODEL_IDS[failedIndex]!;
      const cause = (results[failedIndex] as PromiseRejectedResult).reason;
      attemptCleanup(() => {
        disposeTemplateRoots(loadedRoots.filter((root): root is Group => root !== undefined));
      });
      if (cause instanceof MenuModelLoadError && cause.menuModelId === id) throw cause;
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new MenuModelLoadError(id, message, { cause });
    }

    return new MenuModelLibrary(new Map(MENU_MODEL_IDS.map((id, index) => [
      id,
      (results[index] as PromiseFulfilledResult<ModelTemplate>).value,
    ])));
  }

  create(id: MenuModelId): MenuModelInstance {
    if (this.disposed) throw new Error('Menu model library is disposed');
    const template = this.templates.get(id);
    if (!template) throw new Error(`Missing menu model template: ${id}`);
    const root = cloneSkeleton(template.root) as Group;
    const animations = Object.freeze(template.animations.map((clip) => clip.clone()));
    let disposed = false;
    return {
      root,
      animations,
      dispose(): void {
        if (disposed) return;
        disposed = true;
        root.removeFromParent();
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeTemplateRoots([...this.templates.values()].map(({ root }) => root));
  }
}

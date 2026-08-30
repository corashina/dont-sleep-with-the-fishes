import {
  Box3,
  BufferGeometry,
  Group,
  Material,
  Mesh,
  Skeleton,
  SkinnedMesh,
  Texture,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {
  EVENT_MODEL_MAX_TOTAL_TRIANGLES,
  EVENT_MODEL_SPECS,
  type EventModelId,
  type EventModelSpec,
} from './eventModelManifest';
import {
  collectMeshResources,
  disposeResourceSets,
  ignoreCleanupError as attemptCleanup,
} from '../world/SceneResources';
import { normalizeLongestDimensionTemplate } from '../world/modelValidation';

export interface EventModelLoader {
  load(url: string): Promise<Group>;
}

export interface EventModelInstance {
  readonly root: Group;
  dispose(): void;
}

type SupernaturalEventModelId = Extract<
  EventModelId,
  'fogMan' | 'ghost' | 'siren' | 'sirenRock'
>;
type DedicatedEventModelId = Exclude<EventModelId, SupernaturalEventModelId>;

const SUPERNATURAL_EVENT_MODEL_IDS = new Set<EventModelId>([
  'fogMan',
  'ghost',
  'siren',
  'sirenRock',
]);

export class EventModelLoadError extends Error {
  constructor(
    readonly eventModelId: EventModelId,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`Event model ${eventModelId}: ${message}`, options);
    this.name = 'EventModelLoadError';
  }
}

class GltfEventModelLoader implements EventModelLoader {
  private readonly loader = new GLTFLoader();

  async load(url: string): Promise<Group> {
    const asset = await this.loader.loadAsync(url);
    asset.scene.animations = asset.animations.slice();
    return asset.scene;
  }
}

function collectTextureValue(
  value: unknown,
  textures: Set<Texture>,
  visited: Set<object>,
): void {
  if (value instanceof Texture) {
    textures.add(value);
    return;
  }
  if (typeof value !== 'object' || value === null || visited.has(value)) return;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return;
  visited.add(value);
  Object.values(value).forEach((child) => collectTextureValue(child, textures, visited));
}

function materialTextures(material: Material): Set<Texture> {
  const textures = new Set<Texture>();
  const visited = new Set<object>();
  Object.entries(material).forEach(([key, value]) => {
    if (value instanceof Texture || key === 'uniforms') {
      collectTextureValue(value, textures, visited);
    }
  });
  return textures;
}

function collectSkeletons(root: Group): Set<Skeleton> {
  const skeletons = new Set<Skeleton>();
  root.traverse((object) => {
    if (object instanceof SkinnedMesh) skeletons.add(object.skeleton);
  });
  return skeletons;
}

function disposeTemplateRoots(roots: Iterable<Group>): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const skeletons = new Set<Skeleton>();
  for (const root of roots) {
    collectMeshResources(root, geometries, materials);
    collectSkeletons(root).forEach((skeleton) => skeletons.add(skeleton));
  }
  materials.forEach((material) => {
    materialTextures(material).forEach((texture) => textures.add(texture));
  });
  disposeResourceSets(geometries, textures, materials, skeletons);
}

function disposeOwnedEventRoot(root: Group, textures: Set<Texture>): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  collectMeshResources(root, geometries, materials);
  disposeResourceSets(geometries, textures, materials, collectSkeletons(root));
}

function validateTriangleMetadata(id: EventModelId, spec: EventModelSpec): void {
  const metadata = spec.generatedMetadata;
  if (
    !Number.isInteger(metadata?.triangles)
    || metadata.triangles <= 0
    || metadata.triangles > spec.maxTriangles
  ) {
    throw new EventModelLoadError(id, 'generated triangle metadata is invalid');
  }
}

function validateBoundsMetadata(id: EventModelId, spec: EventModelSpec): void {
  const metadata = spec.generatedMetadata;
  const bounds = [metadata.rawBounds?.min, metadata.rawBounds?.max];
  if (
    bounds.some((values) => !Array.isArray(values) || values.length !== 3)
    || !bounds.flat().every(Number.isFinite)
    || !metadata.rawBounds.max.some((maximum, axis) => maximum > metadata.rawBounds.min[axis]!)
  ) {
    throw new EventModelLoadError(id, 'generated bounds metadata is invalid');
  }
}

function validatePresentationMetadata(id: EventModelId, spec: EventModelSpec): void {
  if (
    !Number.isFinite(spec.targetLongestDimension)
    || spec.targetLongestDimension <= 0
    || ![...spec.rotation, ...spec.offset].every(Number.isFinite)
  ) {
    throw new EventModelLoadError(id, 'presentation metadata is invalid');
  }
}

function validateSpec(id: EventModelId, spec: EventModelSpec | undefined): EventModelSpec {
  if (!spec) throw new EventModelLoadError(id, 'manifest entry is missing');
  validateTriangleMetadata(id, spec);
  validateBoundsMetadata(id, spec);
  validatePresentationMetadata(id, spec);
  return spec;
}

function normalizeTemplate(id: EventModelId, root: Group, spec: EventModelSpec): number {
  return normalizeLongestDimensionTemplate(
    root,
    spec,
    (message) => new EventModelLoadError(id, message),
    1e-6,
  );
}

interface TextureCloneResult {
  readonly value: unknown;
  readonly changed: boolean;
}

function cloneTexture(
  source: Texture,
  cloned: unknown,
  textureClones: Map<Texture, Texture>,
  discardedTextures: Set<Texture>,
): TextureCloneResult {
  const existing = textureClones.get(source);
  if (existing) {
    if (cloned instanceof Texture && cloned !== source && cloned !== existing) {
      discardedTextures.add(cloned);
    }
    return { value: existing, changed: cloned !== existing };
  }
  const owned = cloned instanceof Texture && cloned !== source ? cloned : source.clone();
  textureClones.set(source, owned);
  return { value: owned, changed: cloned !== owned };
}

function cloneTextureArray(
  source: readonly unknown[],
  cloned: unknown,
  textureClones: Map<Texture, Texture>,
  discardedTextures: Set<Texture>,
): TextureCloneResult {
  const target = Array.isArray(cloned) ? [...cloned] : [...source];
  let changed = false;
  source.forEach((value, index) => {
    const result = cloneTextureValue(value, target[index], textureClones, discardedTextures);
    if (!result.changed) return;
    target[index] = result.value;
    changed = true;
  });
  return { value: changed ? target : cloned, changed };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object'
    && value !== null
    && Object.getPrototypeOf(value) === Object.prototype;
}

function cloneTextureRecord(
  source: Record<string, unknown>,
  cloned: unknown,
  textureClones: Map<Texture, Texture>,
  discardedTextures: Set<Texture>,
): TextureCloneResult {
  const clonedRecord = isPlainRecord(cloned) ? cloned : { ...source };
  const target = { ...clonedRecord };
  let changed = false;
  Object.entries(source).forEach(([key, value]) => {
    const result = cloneTextureValue(
      value,
      clonedRecord[key],
      textureClones,
      discardedTextures,
    );
    if (!result.changed) return;
    target[key] = result.value;
    changed = true;
  });
  return { value: changed ? target : cloned, changed };
}

function cloneTextureValue(
  source: unknown,
  cloned: unknown,
  textureClones: Map<Texture, Texture>,
  discardedTextures: Set<Texture>,
): TextureCloneResult {
  if (source instanceof Texture) {
    return cloneTexture(source, cloned, textureClones, discardedTextures);
  }
  if (Array.isArray(source)) {
    return cloneTextureArray(source, cloned, textureClones, discardedTextures);
  }
  if (isPlainRecord(source)) {
    return cloneTextureRecord(source, cloned, textureClones, discardedTextures);
  }
  return { value: cloned, changed: false };
}

function cloneOwnedMaterial(
  material: Material,
  textureClones: Map<Texture, Texture>,
  discardedTextures: Set<Texture>,
): Material {
  const clone = material.clone();
  const cloneProperties = clone as unknown as Record<string, unknown>;
  Object.entries(material).forEach(([key, value]) => {
    if (!(value instanceof Texture) && key !== 'uniforms') return;
    const result = cloneTextureValue(
      value,
      cloneProperties[key],
      textureClones,
      discardedTextures,
    );
    if (result.changed) cloneProperties[key] = result.value;
  });
  return clone;
}

interface OwnedEventTemplateClone {
  readonly root: Group;
  readonly textures: Set<Texture>;
}

function cloneOwnedEventTemplate(template: Group): OwnedEventTemplateClone {
  const clone = cloneSkeleton(template) as Group;
  const textureClones = new Map<Texture, Texture>();
  const discardedTextures = new Set<Texture>();
  clone.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry = object.geometry.clone();
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => (
        cloneOwnedMaterial(material, textureClones, discardedTextures)
      ))
      : cloneOwnedMaterial(object.material, textureClones, discardedTextures);
    object.castShadow = true;
    object.receiveShadow = true;
  });
  disposeResourceSets(discardedTextures);
  return { root: clone, textures: new Set(textureClones.values()) };
}

interface LoadedTemplate {
  readonly root: Group;
  readonly triangles: number;
}

export class EventModelLibrary {
  private disposed = false;

  private constructor(
    private readonly templates: ReadonlyMap<EventModelId, Group>,
  ) {}

  static async load(
    ids: readonly EventModelId[],
    loader: EventModelLoader = new GltfEventModelLoader(),
  ): Promise<EventModelLibrary> {
    const requestedIds = [...new Set(ids)];
    for (const id of requestedIds) validateSpec(id, EVENT_MODEL_SPECS[id]);

    const loadedRoots: Array<Group | undefined> = new Array(requestedIds.length);
    const results = await Promise.allSettled(requestedIds.map(
      async (id, index): Promise<LoadedTemplate> => {
        const root = await loader.load(EVENT_MODEL_SPECS[id].url);
        loadedRoots[index] = root;
        const triangles = normalizeTemplate(id, root, EVENT_MODEL_SPECS[id]);
        const template = new Group();
        template.name = `event-model:${id}`;
        template.userData.eventModelId = id;
        template.animations = root.animations.slice();
        template.add(root);
        return { root: template, triangles };
      },
    ));

    const firstFailureIndex = results.findIndex((result) => result.status === 'rejected');
    if (firstFailureIndex >= 0) {
      const id = requestedIds[firstFailureIndex]!;
      const cause = (results[firstFailureIndex] as PromiseRejectedResult).reason;
      attemptCleanup(() => {
        disposeTemplateRoots(loadedRoots.filter((root): root is Group => root !== undefined));
      });
      if (cause instanceof EventModelLoadError && cause.eventModelId === id) throw cause;
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new EventModelLoadError(id, message, { cause });
    }

    const loaded = results.map(
      (result) => (result as PromiseFulfilledResult<LoadedTemplate>).value,
    );
    let aggregateTriangles = 0;
    for (let index = 0; index < loaded.length; index += 1) {
      aggregateTriangles += loaded[index]!.triangles;
      if (aggregateTriangles > EVENT_MODEL_MAX_TOTAL_TRIANGLES) {
        const error = new EventModelLoadError(
          requestedIds[index]!,
          `aggregate triangle count ${aggregateTriangles} exceeds the ${EVENT_MODEL_MAX_TOTAL_TRIANGLES} limit`,
        );
        attemptCleanup(() => disposeTemplateRoots(loaded.map(({ root }) => root)));
        throw error;
      }
    }

    return new EventModelLibrary(new Map(
      requestedIds.map((id, index) => [id, loaded[index]!.root]),
    ));
  }

  create(id: SupernaturalEventModelId): Group;
  create(id: DedicatedEventModelId): EventModelInstance;
  create(id: EventModelId): Group | EventModelInstance;
  create(id: EventModelId): Group | EventModelInstance {
    if (this.disposed) throw new Error('Event model library is disposed');
    const template = this.templates.get(id);
    if (!template) throw new Error(`Missing event model template: ${id}`);
    const { root, textures } = cloneOwnedEventTemplate(template);
    if (SUPERNATURAL_EVENT_MODEL_IDS.has(id)) return root;
    let disposed = false;
    return {
      root,
      dispose(): void {
        if (disposed) return;
        disposed = true;
        disposeOwnedEventRoot(root, textures);
      },
    };
  }

  animations(_id: SupernaturalEventModelId): readonly [] {
    if (this.disposed) throw new Error('Event model library is disposed');
    return [];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeTemplateRoots(this.templates.values());
  }
}

import {
  AnimationClip,
  Box3,
  BufferGeometry,
  Group,
  Material,
  Mesh,
  Texture,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {
  EVENT_MODEL_IDS,
  EVENT_MODEL_SPECS,
  type EventModelId,
  type EventModelSpec,
} from './eventModelManifest';
import { collectMeshResources, disposeResourceSets } from '../world/SceneResources';

export interface EventModelLoader {
  load(url: string): Promise<{
    readonly scene: Group;
    readonly animations: readonly AnimationClip[];
  }>;
}

export class EventModelLoadError extends Error {
  readonly eventModelId: EventModelId;

  constructor(eventModelId: EventModelId, message: string, options?: ErrorOptions) {
    super(`Event model ${eventModelId}: ${message}`, options);
    this.name = 'EventModelLoadError';
    this.eventModelId = eventModelId;
  }
}

class GltfEventModelLoader implements EventModelLoader {
  private readonly loader = new GLTFLoader();

  async load(url: string) {
    const gltf = await this.loader.loadAsync(url);
    return { scene: gltf.scene, animations: gltf.animations };
  }
}

interface EventModelTemplate {
  readonly root: Group;
  readonly animations: readonly AnimationClip[];
}

function disposeRoots(roots: Iterable<Group>): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  for (const root of roots) collectMeshResources(root, geometries, materials);
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof Texture) textures.add(value);
    }
  }
  disposeResourceSets(geometries, textures, materials);
}

function attemptCleanup(action: () => void): void {
  try {
    action();
  } catch {
    // Rollback keeps the primary load or validation error.
  }
}

function validateSpec(id: EventModelId, spec: EventModelSpec | undefined): EventModelSpec {
  if (!spec) throw new EventModelLoadError(id, 'manifest entry is missing');
  const metadata = spec.generatedMetadata;
  if (
    !Number.isInteger(metadata?.triangles)
    || metadata.triangles <= 0
    || metadata.triangles > spec.maxTriangles
  ) {
    throw new EventModelLoadError(id, 'generated triangle metadata is invalid');
  }
  const bounds = [metadata.rawBounds?.min, metadata.rawBounds?.max];
  if (
    bounds.some((values) => !Array.isArray(values) || values.length !== 3)
    || !bounds.flat().every(Number.isFinite)
    || !metadata.rawBounds.max.some((maximum, axis) => maximum > metadata.rawBounds.min[axis]!)
  ) {
    throw new EventModelLoadError(id, 'generated bounds metadata is invalid');
  }
  return spec;
}

function validateGeometry(id: EventModelId, geometry: BufferGeometry): number {
  const position = geometry.getAttribute('position');
  if (!position || position.count === 0) {
    throw new EventModelLoadError(id, 'mesh has missing or empty position data');
  }
  for (let index = 0; index < position.count; index += 1) {
    if (![position.getX(index), position.getY(index), position.getZ(index)].every(Number.isFinite)) {
      throw new EventModelLoadError(id, 'mesh contains non-finite position data');
    }
  }
  const indices = geometry.index;
  if (indices) {
    for (let index = 0; index < indices.count; index += 1) {
      const vertexIndex = indices.getX(index);
      if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= position.count) {
        throw new EventModelLoadError(id, `mesh contains invalid vertex index ${vertexIndex}`);
      }
    }
  }
  const elementCount = indices?.count ?? position.count;
  if (elementCount % 3 !== 0) {
    throw new EventModelLoadError(id, 'mesh element count does not describe complete triangles');
  }
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  return elementCount / 3;
}

function finiteBox(box: Box3): boolean {
  return [...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite);
}

function validateAnimations(
  id: EventModelId,
  animations: readonly AnimationClip[],
): readonly AnimationClip[] {
  for (const clip of animations) {
    if (
      !clip.name
      || !Number.isFinite(clip.duration)
      || clip.duration <= 0
      || clip.tracks.length === 0
      || clip.tracks.some((track) => !track.validate())
    ) {
      throw new EventModelLoadError(id, `animation clip ${clip.name || '<unnamed>'} is invalid`);
    }
  }
  return animations;
}

function normalizeTemplate(id: EventModelId, root: Group, spec: EventModelSpec): void {
  let meshCount = 0;
  let triangles = 0;
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    meshCount += 1;
    triangles += validateGeometry(id, object.geometry);
    object.castShadow = true;
    object.receiveShadow = true;
  });
  if (meshCount === 0) throw new EventModelLoadError(id, 'scene contains no meshes');
  if (triangles > spec.maxTriangles) {
    throw new EventModelLoadError(
      id,
      `triangle count ${triangles} exceeds the ${spec.maxTriangles} limit`,
    );
  }

  const rawBox = new Box3().setFromObject(root);
  if (rawBox.isEmpty() || !finiteBox(rawBox)) {
    throw new EventModelLoadError(id, 'scene has empty or non-finite bounds');
  }

  root.rotation.set(...spec.rotation);
  root.updateMatrixWorld(true);
  const rotatedBox = new Box3().setFromObject(root);
  if (rotatedBox.isEmpty() || !finiteBox(rotatedBox)) {
    throw new EventModelLoadError(id, 'rotated scene has empty or non-finite bounds');
  }
  const size = rotatedBox.getSize(new Vector3());
  const longestSide = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(longestSide) || longestSide <= 0) {
    throw new EventModelLoadError(id, 'scene has zero-length bounds');
  }

  root.scale.multiplyScalar(spec.targetLongestDimension / longestSide);
  root.updateMatrixWorld(true);
  const scaledBox = new Box3().setFromObject(root);
  if (scaledBox.isEmpty() || !finiteBox(scaledBox)) {
    throw new EventModelLoadError(id, 'normalized scene has empty or non-finite bounds');
  }
  const center = scaledBox.getCenter(new Vector3());
  root.position.add(new Vector3(...spec.offset).sub(center));
  root.updateMatrixWorld(true);
  const finalBox = new Box3().setFromObject(root);
  if (finalBox.isEmpty() || !finiteBox(finalBox)) {
    throw new EventModelLoadError(id, 'normalized scene has invalid bounds');
  }
}

function cloneOwnedMaterial(
  material: Material,
  textures: Map<Texture, Texture>,
): Material {
  const cloned = material.clone();
  const properties = cloned as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(material)) {
    if (!(value instanceof Texture)) continue;
    let texture = textures.get(value);
    if (!texture) {
      texture = value.clone();
      textures.set(value, texture);
    }
    properties[key] = texture;
  }
  return cloned;
}

function cloneOwnedTemplate(template: Group): Group {
  const clone = cloneSkeleton(template) as Group;
  const textures = new Map<Texture, Texture>();
  clone.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry = object.geometry.clone();
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => cloneOwnedMaterial(material, textures))
      : cloneOwnedMaterial(object.material, textures);
  });
  return clone;
}

export class EventModelLibrary {
  private disposed = false;

  private constructor(
    private readonly templates: ReadonlyMap<EventModelId, EventModelTemplate>,
  ) {}

  static async load(
    loader: EventModelLoader = new GltfEventModelLoader(),
  ): Promise<EventModelLibrary> {
    for (const id of EVENT_MODEL_IDS) validateSpec(id, EVENT_MODEL_SPECS[id]);

    const results = await Promise.allSettled(EVENT_MODEL_IDS.map(async (id) => {
      const spec = EVENT_MODEL_SPECS[id];
      let root: Group | undefined;
      try {
        const loaded = await loader.load(spec.url);
        root = loaded.scene;
        normalizeTemplate(id, root, spec);
        const animations = validateAnimations(id, loaded.animations);
        return { id, root, animations };
      } catch (error) {
        if (root) attemptCleanup(() => disposeRoots([root!]));
        if (error instanceof EventModelLoadError && error.eventModelId === id) throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw new EventModelLoadError(id, message, { cause: error });
      }
    }));

    const fulfilledRoots = results.flatMap((result) => (
      result.status === 'fulfilled' ? [result.value.root] : []
    ));
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) {
      attemptCleanup(() => disposeRoots(fulfilledRoots));
      throw failure.reason;
    }

    return new EventModelLibrary(new Map(results.map((result) => {
      const loaded = (result as PromiseFulfilledResult<{
        id: EventModelId;
        root: Group;
        animations: readonly AnimationClip[];
      }>).value;
      return [loaded.id, { root: loaded.root, animations: loaded.animations }];
    })));
  }

  create(id: EventModelId): Group {
    if (this.disposed) throw new Error('Event model library is disposed');
    const template = this.templates.get(id);
    if (!template) throw new Error(`Missing event model template: ${id}`);
    const clone = cloneOwnedTemplate(template.root);
    clone.name = `event-model:${id}`;
    clone.userData.eventModelId = id;
    return clone;
  }

  animations(id: EventModelId): readonly AnimationClip[] {
    if (this.disposed) throw new Error('Event model library is disposed');
    const template = this.templates.get(id);
    if (!template) throw new Error(`Missing event model template: ${id}`);
    return template.animations;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeRoots([...this.templates.values()].map(({ root }) => root));
  }
}

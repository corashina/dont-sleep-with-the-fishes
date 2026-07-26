import {
  Box3,
  BufferGeometry,
  Group,
  Material,
  Mesh,
  Texture,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ITEM_IDS, type ItemId, type ItemInstance } from '../game/ItemState';
import {
  ITEM_MODEL_MAX_TOTAL_TRIANGLES,
  ITEM_MODEL_SPECS,
  type RuntimeModelSpec,
} from './itemModelManifest';
import {
  LIFEBOAT_EQUIPMENT_IDS,
  LIFEBOAT_EQUIPMENT_MODEL_SPECS,
  type LifeboatEquipmentId,
} from './lifeboatEquipmentManifest';
import {
  PRACTICAL_LIGHT_MODEL_IDS,
  PRACTICAL_LIGHT_MODEL_SPECS,
  type PracticalLightModelId,
} from './practicalLightModelManifest';
import {
  collectMeshResources,
  disposeResourceSets,
} from './SceneResources';
import { enableItemAmbientOcclusion } from '../rendering/ItemAmbientOcclusion';

type RuntimeModelId = ItemId | LifeboatEquipmentId | PracticalLightModelId;
const RUNTIME_MODEL_IDS: readonly RuntimeModelId[] = [
  ...ITEM_IDS,
  ...LIFEBOAT_EQUIPMENT_IDS,
  ...PRACTICAL_LIGHT_MODEL_IDS,
];

function runtimeModelSpec(id: RuntimeModelId): RuntimeModelSpec {
  if (id === 'fishingRod') return LIFEBOAT_EQUIPMENT_MODEL_SPECS[id];
  if (id === 'lantern' || id === 'ceilingLight') return PRACTICAL_LIGHT_MODEL_SPECS[id];
  return ITEM_MODEL_SPECS[id];
}

export interface ItemModelLoader {
  load(url: string): Promise<Group>;
}

export class ItemModelLoadError extends Error {
  readonly itemId: RuntimeModelId;

  constructor(itemId: RuntimeModelId, message: string, options?: ErrorOptions) {
    super(`Item model ${itemId}: ${message}`, options);
    this.name = 'ItemModelLoadError';
    this.itemId = itemId;
  }
}

class GltfItemModelLoader implements ItemModelLoader {
  private readonly loader = new GLTFLoader();

  async load(url: string): Promise<Group> {
    return (await this.loader.loadAsync(url)).scene;
  }
}

export function geometryTriangles(geometry: BufferGeometry): number {
  const count = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0;
  return count / 3;
}

function disposeRoots(roots: Iterable<Group>): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();

  for (const root of roots) {
    collectMeshResources(root, geometries, materials);
  }
  materials.forEach((material) => {
    Object.values(material).forEach((value) => {
      if (value instanceof Texture) textures.add(value);
    });
  });

  disposeResourceSets(geometries, textures, materials);
}

function attemptCleanup(action: () => void): void {
  try {
    action();
  } catch {
    // Load rollback preserves the primary load or validation error.
  }
}

function validateSpec(id: RuntimeModelId, spec: RuntimeModelSpec | undefined): RuntimeModelSpec {
  if (!spec) throw new ItemModelLoadError(id, 'manifest entry is missing');
  const metadata = spec.generatedMetadata;
  if (
    !Number.isInteger(metadata?.triangles)
    || metadata.triangles <= 0
    || metadata.triangles > spec.maxTriangles
  ) {
    throw new ItemModelLoadError(id, 'generated triangle metadata is invalid');
  }
  const bounds = [metadata.rawBounds?.min, metadata.rawBounds?.max];
  if (
    bounds.some((values) => !Array.isArray(values) || values.length !== 3)
    || !bounds.flat().every(Number.isFinite)
    || !metadata.rawBounds.max.some((maximum, axis) => maximum > metadata.rawBounds.min[axis]!)
  ) {
    throw new ItemModelLoadError(id, 'generated bounds metadata is invalid');
  }
  return spec;
}

function validateGeometry(id: RuntimeModelId, geometry: BufferGeometry): number {
  const position = geometry.getAttribute('position');
  if (!position || position.count === 0) {
    throw new ItemModelLoadError(id, 'mesh has missing or empty position data');
  }

  for (let index = 0; index < position.count; index += 1) {
    if (![position.getX(index), position.getY(index), position.getZ(index)].every(Number.isFinite)) {
      throw new ItemModelLoadError(id, 'mesh contains non-finite position data');
    }
  }

  const elementCount = geometry.index?.count ?? position.count;
  if (elementCount % 3 !== 0) {
    throw new ItemModelLoadError(id, 'mesh element count does not describe complete triangles');
  }

  return geometryTriangles(geometry);
}

function finiteBox(box: Box3): boolean {
  return [...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite);
}

function normalizeTemplate(id: RuntimeModelId, root: Group, spec: RuntimeModelSpec): number {
  root.rotation.set(...spec.rotation);
  root.updateMatrixWorld(true);

  let meshCount = 0;
  let triangles = 0;
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    meshCount += 1;
    triangles += validateGeometry(id, object.geometry);
    object.castShadow = true;
    object.receiveShadow = true;
  });

  if (meshCount === 0) throw new ItemModelLoadError(id, 'scene contains no meshes');
  if (triangles > spec.maxTriangles) {
    throw new ItemModelLoadError(
      id,
      `triangle count ${triangles} exceeds the ${spec.maxTriangles} limit`,
    );
  }

  const box = new Box3().setFromObject(root);
  if (box.isEmpty() || !finiteBox(box)) {
    throw new ItemModelLoadError(id, 'scene has empty or non-finite bounds');
  }
  const size = box.getSize(new Vector3());
  const longestSide = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(longestSide) || longestSide <= 0) {
    throw new ItemModelLoadError(id, 'scene has zero-length bounds');
  }

  root.scale.multiplyScalar(spec.targetLongestDimension / longestSide);
  root.updateMatrixWorld(true);

  const scaledBox = new Box3().setFromObject(root);
  if (scaledBox.isEmpty() || !finiteBox(scaledBox)) {
    throw new ItemModelLoadError(id, 'normalized scene has empty or non-finite bounds');
  }
  const center = scaledBox.getCenter(new Vector3());
  root.position.add(new Vector3(...spec.offset).sub(center));
  root.updateMatrixWorld(true);

  const finalBox = new Box3().setFromObject(root);
  const finalSize = finalBox.getSize(new Vector3());
  const finalLongestSide = Math.max(finalSize.x, finalSize.y, finalSize.z);
  if (
    finalBox.isEmpty()
    || !finiteBox(finalBox)
    || !Number.isFinite(finalLongestSide)
    || finalLongestSide <= 0
  ) {
    throw new ItemModelLoadError(id, 'normalized scene has invalid bounds');
  }

  return triangles;
}

function cloneOwnedTemplate(template: Group): Group {
  const clone = template.clone(true);
  clone.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry = object.geometry.clone();
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material.clone();
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return clone;
}

interface LoadedTemplate {
  readonly root: Group;
  readonly triangles: number;
}

export class PropModelLibrary {
  private disposed = false;

  private constructor(
    private readonly itemTemplates: ReadonlyMap<ItemId, Group>,
    private readonly equipmentTemplates: ReadonlyMap<LifeboatEquipmentId, Group>,
    private readonly practicalLightTemplates: ReadonlyMap<PracticalLightModelId, Group>,
  ) {}

  static async load(loader: ItemModelLoader = new GltfItemModelLoader()): Promise<PropModelLibrary> {
    for (const id of RUNTIME_MODEL_IDS) {
      validateSpec(id, runtimeModelSpec(id));
    }

    const results = await Promise.allSettled(RUNTIME_MODEL_IDS.map(async (id): Promise<LoadedTemplate> => {
      const spec = runtimeModelSpec(id);
      const root = await loader.load(spec.url);
      try {
        const triangles = normalizeTemplate(id, root, spec);
        const template = new Group();
        template.add(root);
        return { root: template, triangles };
      } catch (error) {
        attemptCleanup(() => disposeRoots([root]));
        throw error;
      }
    }));

    const fulfilledRoots = results.flatMap((result) => result.status === 'fulfilled' ? [result.value.root] : []);
    const firstFailureIndex = results.findIndex((result) => result.status === 'rejected');
    if (firstFailureIndex >= 0) {
      const id = RUNTIME_MODEL_IDS[firstFailureIndex]!;
      const rejected = results[firstFailureIndex] as PromiseRejectedResult;
      const cause = rejected.reason;
      attemptCleanup(() => disposeRoots(fulfilledRoots));
      if (cause instanceof ItemModelLoadError && cause.itemId === id) throw cause;
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new ItemModelLoadError(id, message, { cause });
    }

    const loaded = results.map((result) => (result as PromiseFulfilledResult<LoadedTemplate>).value);
    let aggregateTriangles = 0;
    for (let index = 0; index < loaded.length; index += 1) {
      aggregateTriangles += loaded[index]!.triangles;
      if (aggregateTriangles > ITEM_MODEL_MAX_TOTAL_TRIANGLES) {
        const error = new ItemModelLoadError(
          RUNTIME_MODEL_IDS[index]!,
          `aggregate triangle count ${aggregateTriangles} exceeds the ${ITEM_MODEL_MAX_TOTAL_TRIANGLES} limit`,
        );
        attemptCleanup(() => disposeRoots(fulfilledRoots));
        throw error;
      }
    }

    return new PropModelLibrary(
      new Map(ITEM_IDS.map((id, index) => [id, loaded[index]!.root])),
      new Map(LIFEBOAT_EQUIPMENT_IDS.map((id, index) => [
        id,
        loaded[ITEM_IDS.length + index]!.root,
      ])),
      new Map(PRACTICAL_LIGHT_MODEL_IDS.map((id, index) => [
        id,
        loaded[ITEM_IDS.length + LIFEBOAT_EQUIPMENT_IDS.length + index]!.root,
      ])),
    );
  }

  static fromTemplatesForTest(
    itemTemplates: ReadonlyMap<ItemId, Group>,
    equipmentTemplates: ReadonlyMap<LifeboatEquipmentId, Group> = new Map(),
    practicalLightTemplates: ReadonlyMap<PracticalLightModelId, Group> = new Map(),
  ): PropModelLibrary {
    return new PropModelLibrary(itemTemplates, equipmentTemplates, practicalLightTemplates);
  }

  create(instance: ItemInstance): Group {
    const template = this.itemTemplates.get(instance.type);
    if (!template) throw new Error(`Missing item model template: ${instance.type}`);
    const clone = cloneOwnedTemplate(template);
    clone.traverse((object) => {
      if (object instanceof Mesh) object.castShadow = false;
    });
    enableItemAmbientOcclusion(clone);
    clone.position.set(0, 0, 0);
    clone.quaternion.identity();
    clone.scale.set(1, 1, 1);
    clone.name = `prop:${instance.instanceId}`;
    clone.userData.instanceId = instance.instanceId;
    clone.userData.itemType = instance.type;
    return clone;
  }

  createEquipment(id: LifeboatEquipmentId): Group {
    const template = this.equipmentTemplates.get(id);
    if (!template) throw new Error(`Missing equipment model template: ${id}`);
    const clone = cloneOwnedTemplate(template);
    clone.position.set(0, 0, 0);
    clone.quaternion.identity();
    clone.scale.set(1, 1, 1);
    clone.name = `lifeboat-equipment:${id}`;
    clone.userData.equipmentId = id;
    return clone;
  }

  createPracticalLight(id: PracticalLightModelId): Group {
    const template = this.practicalLightTemplates.get(id);
    if (!template) throw new Error(`Missing practical light model template: ${id}`);
    const clone = cloneOwnedTemplate(template);
    clone.position.set(0, 0, 0);
    clone.quaternion.identity();
    clone.scale.set(1, 1, 1);
    clone.name = `practical-light:${id}`;
    clone.userData.practicalLightId = id;
    return clone;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeRoots([
      ...this.itemTemplates.values(),
      ...this.equipmentTemplates.values(),
      ...this.practicalLightTemplates.values(),
    ]);
  }
}

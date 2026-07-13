import {
  Box3,
  BufferGeometry,
  Group,
  Material,
  Mesh,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ITEM_IDS, type ItemId, type ItemInstance } from '../game/ItemState';
import {
  ITEM_MODEL_ASSET_LEDGER,
  ITEM_MODEL_MAX_TOTAL_TRIANGLES,
  ITEM_MODEL_SPECS,
  type ItemModelSpec,
} from './itemModelManifest';

export interface ItemModelLoader {
  load(url: string): Promise<Group>;
}

export class ItemModelLoadError extends Error {
  readonly itemId: ItemId;

  constructor(itemId: ItemId, message: string, options?: ErrorOptions) {
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

  for (const root of roots) {
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry);
      const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
      meshMaterials.forEach((material) => materials.add(material));
    });
  }

  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function validateLedgerEntry(id: ItemId, spec: ItemModelSpec): void {
  const requiredValues = [id, spec.sourceUrl, spec.resourceId, spec.creator, spec.licenseUrl];
  const missing = requiredValues.find((value) => !ITEM_MODEL_ASSET_LEDGER.includes(value));
  if (missing) {
    throw new ItemModelLoadError(id, `asset ledger is missing ${missing}`);
  }
}

function validateGeometry(id: ItemId, geometry: BufferGeometry): number {
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

function normalizeTemplate(id: ItemId, root: Group, spec: ItemModelSpec): number {
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

  private constructor(private readonly templates: ReadonlyMap<ItemId, Group>) {}

  static async load(loader: ItemModelLoader = new GltfItemModelLoader()): Promise<PropModelLibrary> {
    for (const id of ITEM_IDS) validateLedgerEntry(id, ITEM_MODEL_SPECS[id]);

    const results = await Promise.allSettled(ITEM_IDS.map(async (id): Promise<LoadedTemplate> => {
      const root = await loader.load(ITEM_MODEL_SPECS[id].url);
      try {
        const triangles = normalizeTemplate(id, root, ITEM_MODEL_SPECS[id]);
        return { root, triangles };
      } catch (error) {
        disposeRoots([root]);
        throw error;
      }
    }));

    const fulfilledRoots = results.flatMap((result) => result.status === 'fulfilled' ? [result.value.root] : []);
    const firstFailureIndex = results.findIndex((result) => result.status === 'rejected');
    if (firstFailureIndex >= 0) {
      disposeRoots(fulfilledRoots);
      const id = ITEM_IDS[firstFailureIndex]!;
      const rejected = results[firstFailureIndex] as PromiseRejectedResult;
      const cause = rejected.reason;
      if (cause instanceof ItemModelLoadError && cause.itemId === id) throw cause;
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new ItemModelLoadError(id, message, { cause });
    }

    const loaded = results.map((result) => (result as PromiseFulfilledResult<LoadedTemplate>).value);
    let aggregateTriangles = 0;
    for (let index = 0; index < loaded.length; index += 1) {
      aggregateTriangles += loaded[index]!.triangles;
      if (aggregateTriangles > ITEM_MODEL_MAX_TOTAL_TRIANGLES) {
        disposeRoots(fulfilledRoots);
        throw new ItemModelLoadError(
          ITEM_IDS[index]!,
          `aggregate triangle count ${aggregateTriangles} exceeds the ${ITEM_MODEL_MAX_TOTAL_TRIANGLES} limit`,
        );
      }
    }

    return new PropModelLibrary(new Map(
      ITEM_IDS.map((id, index) => [id, loaded[index]!.root]),
    ));
  }

  static fromTemplatesForTest(templates: ReadonlyMap<ItemId, Group>): PropModelLibrary {
    return new PropModelLibrary(templates);
  }

  create(instance: ItemInstance): Group {
    const template = this.templates.get(instance.type);
    if (!template) throw new Error(`Missing item model template: ${instance.type}`);
    const clone = cloneOwnedTemplate(template);
    clone.name = `prop:${instance.instanceId}`;
    clone.userData.instanceId = instance.instanceId;
    clone.userData.itemType = instance.type;
    return clone;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeRoots(this.templates.values());
  }
}

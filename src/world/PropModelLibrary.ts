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
import { collectMeshResources, disposeMeshResources } from './SceneResources';

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
    collectMeshResources(root, geometries, materials);
  }

  disposeMeshResources(geometries, materials);
}

function attemptCleanup(action: () => void): void {
  try {
    action();
  } catch {
    // Load rollback preserves the primary load or validation error.
  }
}

function ledgerCells(line: string): readonly string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  return trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
}

function inlineCodeValue(cell: string): string | null {
  return /^`([^`]+)`$/.exec(cell)?.[1] ?? null;
}

function markdownLinkUrl(cell: string): string | null {
  return /^\[[^\]]+\]\(([^)]+)\)$/.exec(cell)?.[1] ?? null;
}

function ledgerCreator(cell: string): string | null {
  const separator = cell.lastIndexOf(' / ');
  return separator >= 0 ? cell.slice(separator + 3) : null;
}

function validateLedgerEntry(
  id: ItemId,
  spec: ItemModelSpec,
  rows: readonly (readonly string[])[],
): void {
  const matches = rows.filter((row) => row[0] === id);
  if (matches.length !== 1) {
    throw new ItemModelLoadError(
      id,
      matches.length === 0 ? 'asset ledger row is missing' : 'asset ledger row is duplicated',
    );
  }

  const row = matches[0]!;
  if (row.length !== 10) throw new ItemModelLoadError(id, 'asset ledger row format is invalid');
  if (inlineCodeValue(row[1]!) !== `${id}.glb`) {
    throw new ItemModelLoadError(id, 'asset ledger filename does not match the manifest');
  }
  if (row[3] !== spec.sourceUrl) {
    throw new ItemModelLoadError(id, 'asset ledger source URL does not match the manifest');
  }
  if (inlineCodeValue(row[4]!) !== spec.sourceAssetId) {
    throw new ItemModelLoadError(id, 'asset ledger source asset ID does not match the manifest');
  }
  if (ledgerCreator(row[2]!) !== spec.creator) {
    throw new ItemModelLoadError(id, 'asset ledger creator does not match the manifest');
  }
  if (markdownLinkUrl(row[5]!) !== spec.licenseUrl) {
    throw new ItemModelLoadError(id, 'asset ledger license URL does not match the manifest');
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
    const ledgerRows = ITEM_MODEL_ASSET_LEDGER.split(/\r?\n/)
      .map(ledgerCells)
      .filter((row): row is readonly string[] => row !== null);
    for (const id of ITEM_IDS) validateLedgerEntry(id, ITEM_MODEL_SPECS[id], ledgerRows);

    const results = await Promise.allSettled(ITEM_IDS.map(async (id): Promise<LoadedTemplate> => {
      const root = await loader.load(ITEM_MODEL_SPECS[id].url);
      try {
        const triangles = normalizeTemplate(id, root, ITEM_MODEL_SPECS[id]);
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
      const id = ITEM_IDS[firstFailureIndex]!;
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
          ITEM_IDS[index]!,
          `aggregate triangle count ${aggregateTriangles} exceeds the ${ITEM_MODEL_MAX_TOTAL_TRIANGLES} limit`,
        );
        attemptCleanup(() => disposeRoots(fulfilledRoots));
        throw error;
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
    clone.position.set(0, 0, 0);
    clone.quaternion.identity();
    clone.scale.set(1, 1, 1);
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

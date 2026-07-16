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
import {
  SHIP_FURNITURE_MAX_TOTAL_TRIANGLES,
  SHIP_FURNITURE_MODEL_IDS,
  SHIP_FURNITURE_MODEL_SPECS,
  type ShipFurnitureAssetId,
  type ShipFurnitureModelSpec,
} from './shipFurnitureManifest';
import { collectMeshResources, disposeResourceSets } from './SceneResources';

export interface ShipFurnitureModelLoader {
  load(url: string): Promise<Group>;
}

export class ShipFurnitureLoadError extends Error {
  constructor(
    readonly modelId: ShipFurnitureAssetId,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`Unable to load ship furniture ${modelId}: ${message}`, options);
    this.name = 'ShipFurnitureLoadError';
  }
}

class GltfShipFurnitureLoader implements ShipFurnitureModelLoader {
  private readonly loader = new GLTFLoader();

  async load(url: string): Promise<Group> {
    return (await this.loader.loadAsync(url)).scene;
  }
}

function finiteBox(box: Box3): boolean {
  return [...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite);
}

function geometryTriangles(modelId: ShipFurnitureAssetId, geometry: BufferGeometry): number {
  const position = geometry.getAttribute('position');
  if (!position || position.count === 0) {
    throw new ShipFurnitureLoadError(modelId, 'mesh has missing or empty position data');
  }
  for (let index = 0; index < position.count; index += 1) {
    if (![position.getX(index), position.getY(index), position.getZ(index)].every(Number.isFinite)) {
      throw new ShipFurnitureLoadError(modelId, 'mesh contains non-finite position data');
    }
  }
  const elementCount = geometry.index?.count ?? position.count;
  if (elementCount % 3 !== 0) {
    throw new ShipFurnitureLoadError(modelId, 'mesh element count does not describe complete triangles');
  }
  return elementCount / 3;
}

function normalizeTemplate(
  modelId: ShipFurnitureAssetId,
  root: Group,
  spec: ShipFurnitureModelSpec,
): number {
  root.updateMatrixWorld(true);
  let meshCount = 0;
  let triangles = 0;
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    meshCount += 1;
    triangles += geometryTriangles(modelId, object.geometry);
    object.castShadow = true;
    object.receiveShadow = true;
  });
  if (meshCount === 0) throw new ShipFurnitureLoadError(modelId, 'scene contains no meshes');
  if (triangles > spec.maxTriangles) {
    throw new ShipFurnitureLoadError(
      modelId,
      `triangle count ${triangles} exceeds the ${spec.maxTriangles} limit`,
    );
  }

  const sourceBounds = new Box3().setFromObject(root);
  if (sourceBounds.isEmpty() || !finiteBox(sourceBounds)) {
    throw new ShipFurnitureLoadError(modelId, 'scene has empty or non-finite bounds');
  }
  const sourceSize = sourceBounds.getSize(new Vector3());
  const axisLength = sourceSize[spec.scaleAxis];
  if (!Number.isFinite(axisLength) || axisLength <= 0) {
    throw new ShipFurnitureLoadError(modelId, `scene has zero-length ${spec.scaleAxis} bounds`);
  }

  root.scale.multiplyScalar(spec.targetAxisLength / axisLength);
  root.updateMatrixWorld(true);
  const scaledBounds = new Box3().setFromObject(root);
  if (scaledBounds.isEmpty() || !finiteBox(scaledBounds)) {
    throw new ShipFurnitureLoadError(modelId, 'normalized scene has empty or non-finite bounds');
  }
  const center = scaledBounds.getCenter(new Vector3());
  root.position.x -= center.x;
  root.position.y -= scaledBounds.min.y;
  root.position.z -= center.z;
  root.updateMatrixWorld(true);

  const finalBounds = new Box3().setFromObject(root);
  const finalSize = finalBounds.getSize(new Vector3());
  if (finalBounds.isEmpty() || !finiteBox(finalBounds)) {
    throw new ShipFurnitureLoadError(modelId, 'normalized scene has invalid bounds');
  }
  spec.canonicalSize.forEach((expected, axis) => {
    const actual = finalSize.getComponent(axis);
    if (!Number.isFinite(actual) || Math.abs(actual - expected) > spec.boundsTolerance) {
      throw new ShipFurnitureLoadError(
        modelId,
        `normalized ${['x', 'y', 'z'][axis]} size ${actual} differs from canonical ${expected}`,
      );
    }
  });
  if (
    Math.abs(finalBounds.min.y) > 1e-6
    || Math.abs((finalBounds.min.x + finalBounds.max.x) / 2) > 1e-6
    || Math.abs((finalBounds.min.z + finalBounds.max.z) / 2) > 1e-6
  ) {
    throw new ShipFurnitureLoadError(modelId, 'normalized scene is not centered on its base');
  }
  return triangles;
}

function materialTextures(material: Material): readonly Texture[] {
  return Object.values(material).filter((value): value is Texture => value instanceof Texture);
}

function attemptCleanup(action: () => void): void {
  try {
    action();
  } catch {
    // Load rollback preserves the primary load or validation error.
  }
}

function disposeRoots(roots: Iterable<Group>): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  for (const root of roots) {
    collectMeshResources(root, geometries, materials);
  }
  materials.forEach((material) => {
    materialTextures(material).forEach((texture) => textures.add(texture));
  });
  disposeResourceSets(geometries, textures, materials);
}

interface LoadedTemplate {
  readonly root: Group;
  readonly triangles: number;
}

export class ShipFurnitureLibrary {
  private disposed = false;

  private constructor(
    private readonly templates: ReadonlyMap<ShipFurnitureAssetId, Group>,
  ) {}

  static async load(
    loader: ShipFurnitureModelLoader = new GltfShipFurnitureLoader(),
  ): Promise<ShipFurnitureLibrary> {
    const loadedRoots: Array<Group | undefined> = new Array(SHIP_FURNITURE_MODEL_IDS.length);
    const results = await Promise.allSettled(
      SHIP_FURNITURE_MODEL_IDS.map(async (modelId, index): Promise<LoadedTemplate> => {
        const root = await loader.load(SHIP_FURNITURE_MODEL_SPECS[modelId].url);
        loadedRoots[index] = root;
        const triangles = normalizeTemplate(modelId, root, SHIP_FURNITURE_MODEL_SPECS[modelId]);
        const template = new Group();
        template.name = `ship-furniture:${modelId}`;
        template.add(root);
        return { root: template, triangles };
      }),
    );

    const firstFailureIndex = results.findIndex((result) => result.status === 'rejected');
    if (firstFailureIndex >= 0) {
      const modelId = SHIP_FURNITURE_MODEL_IDS[firstFailureIndex]!;
      const cause = (results[firstFailureIndex] as PromiseRejectedResult).reason;
      attemptCleanup(() => {
        disposeRoots(loadedRoots.filter((root): root is Group => root !== undefined));
      });
      if (cause instanceof ShipFurnitureLoadError && cause.modelId === modelId) throw cause;
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new ShipFurnitureLoadError(modelId, message, { cause });
    }

    const loaded = results.map(
      (result) => (result as PromiseFulfilledResult<LoadedTemplate>).value,
    );
    let aggregateTriangles = 0;
    for (let index = 0; index < loaded.length; index += 1) {
      aggregateTriangles += loaded[index]!.triangles;
      if (aggregateTriangles > SHIP_FURNITURE_MAX_TOTAL_TRIANGLES) {
        const error = new ShipFurnitureLoadError(
          SHIP_FURNITURE_MODEL_IDS[index]!,
          `aggregate triangle count ${aggregateTriangles} exceeds the ${SHIP_FURNITURE_MAX_TOTAL_TRIANGLES} limit`,
        );
        attemptCleanup(() => {
          disposeRoots(loadedRoots.filter((root): root is Group => root !== undefined));
        });
        throw error;
      }
    }

    return new ShipFurnitureLibrary(new Map(
      SHIP_FURNITURE_MODEL_IDS.map((modelId, index) => [modelId, loaded[index]!.root]),
    ));
  }

  static fromTemplatesForTest(
    templates: ReadonlyMap<ShipFurnitureAssetId, Group>,
  ): ShipFurnitureLibrary {
    return new ShipFurnitureLibrary(templates);
  }

  clone(modelId: ShipFurnitureAssetId): Group {
    const template = this.templates.get(modelId);
    if (!template) throw new Error(`Missing ship furniture template: ${modelId}`);
    return template.clone(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeRoots(this.templates.values());
  }
}

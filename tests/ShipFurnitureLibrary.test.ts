import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  ShipFurnitureLibrary,
  ShipFurnitureLoadError,
  type ShipFurnitureModelLoader,
} from '../src/world/ShipFurnitureLibrary';
import {
  SHIP_FURNITURE_MAX_TOTAL_TRIANGLES,
  SHIP_FURNITURE_MODEL_IDS,
  SHIP_FURNITURE_MODEL_SPECS,
  type ShipFurnitureAssetId,
} from '../src/world/shipFurnitureManifest';

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function modelIdForUrl(url: string): ShipFurnitureAssetId {
  const id = SHIP_FURNITURE_MODEL_IDS.find(
    (candidate) => SHIP_FURNITURE_MODEL_SPECS[candidate].url === url,
  );
  if (!id) throw new Error(`Unknown furniture URL: ${url}`);
  return id;
}

function modelRoot(id: ShipFurnitureAssetId): Group {
  const [x, y, z] = SHIP_FURNITURE_MODEL_SPECS[id].canonicalSize;
  const root = new Group();
  root.position.set(3.25, -1.5, 2.75);
  root.scale.setScalar(2.4);
  root.add(new Mesh(
    new BoxGeometry(x, y, z),
    new MeshStandardMaterial({ color: 0x557799 }),
  ));
  return root;
}

function firstMesh(root: Group): Mesh<BufferGeometry, Material | Material[]> {
  let found: Mesh<BufferGeometry, Material | Material[]> | undefined;
  root.traverse((object) => {
    if (!found && object instanceof Mesh) found = object;
  });
  if (!found) throw new Error('Expected a fixture mesh');
  return found;
}

function triangleGeometry(triangles: number): BufferGeometry {
  const positions = new Float32Array(triangles * 9);
  for (let index = 0; index < triangles; index += 1) {
    positions.set([0, 0, 0, 1, 0, 0, 0, 1, 1], index * 9);
  }
  return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3));
}

describe('ship furniture manifest', () => {
  it('pins exactly seven local model URLs and canonical normalization contracts', () => {
    expect(SHIP_FURNITURE_MODEL_IDS).toEqual([
      'bedBunk',
      'desk',
      'chairDesk',
      'bookcaseOpen',
      'bookcaseClosedDoors',
      'table',
      'sideTableDrawers',
    ]);
    expect(SHIP_FURNITURE_MAX_TOTAL_TRIANGLES).toBe(8_000);
    expect(SHIP_FURNITURE_MODEL_SPECS).toMatchObject({
      bedBunk: { scaleAxis: 'z', targetAxisLength: 2.2, canonicalSize: [1.147, 1.708, 2.2] },
      desk: { scaleAxis: 'x', targetAxisLength: 1.7, canonicalSize: [1.7, 0.89, 0.908] },
      chairDesk: { scaleAxis: 'y', targetAxisLength: 1, canonicalSize: [0.551, 1, 0.517] },
      bookcaseOpen: { scaleAxis: 'y', targetAxisLength: 1.85, canonicalSize: [0.841, 1.85, 0.526] },
      bookcaseClosedDoors: { scaleAxis: 'y', targetAxisLength: 1.85, canonicalSize: [0.871, 1.85, 0.544] },
      table: { scaleAxis: 'y', targetAxisLength: 0.82, canonicalSize: [2.112, 0.82, 1.123] },
      sideTableDrawers: { scaleAxis: 'y', targetAxisLength: 0.75, canonicalSize: [1.043, 0.75, 0.434] },
    });
    for (const id of SHIP_FURNITURE_MODEL_IDS) {
      expect(SHIP_FURNITURE_MODEL_SPECS[id].url.replaceAll('\\', '/'))
        .toMatch(new RegExp(`/src/assets/models/ship/${id}\\.glb$`));
      expect(SHIP_FURNITURE_MODEL_SPECS[id].boundsTolerance).toBe(0.002);
      expect(SHIP_FURNITURE_MODEL_SPECS[id].maxTriangles).toBe(1_000);
    }
  });
});

describe('ShipFurnitureLibrary preload', () => {
  it('requests all seven models in manifest order before any request resolves', async () => {
    const requests = new Map<string, Deferred<Group>>();
    const loader: ShipFurnitureModelLoader = {
      load: vi.fn((url) => {
        const request = deferred<Group>();
        requests.set(url, request);
        return request.promise;
      }),
    };

    const loading = ShipFurnitureLibrary.load(loader);

    expect([...requests.keys()]).toEqual(
      SHIP_FURNITURE_MODEL_IDS.map((id) => SHIP_FURNITURE_MODEL_SPECS[id].url),
    );
    for (const [url, request] of requests) request.resolve(modelRoot(modelIdForUrl(url)));
    const library = await loading;
    library.dispose();
  });

  it('uniformly normalizes canonical bounds, base alignment, centering, and shadows', async () => {
    const library = await ShipFurnitureLibrary.load({
      load: async (url) => modelRoot(modelIdForUrl(url)),
    });

    for (const id of SHIP_FURNITURE_MODEL_IDS) {
      const clone = library.clone(id);
      const bounds = new Box3().setFromObject(clone);
      const size = bounds.getSize(new Vector3());
      const mesh = firstMesh(clone);
      SHIP_FURNITURE_MODEL_SPECS[id].canonicalSize.forEach((expected, axis) => {
        expect(size.getComponent(axis)).toBeCloseTo(expected, 3);
        expect(Math.abs(size.getComponent(axis) - expected)).toBeLessThanOrEqual(0.002);
      });
      expect(bounds.min.y).toBeCloseTo(0, 6);
      expect((bounds.min.x + bounds.max.x) / 2).toBeCloseTo(0, 6);
      expect((bounds.min.z + bounds.max.z) / 2).toBeCloseTo(0, 6);
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
      const scale = clone.children[0]!.scale;
      expect(scale.x).toBeCloseTo(scale.y);
      expect(scale.y).toBeCloseTo(scale.z);
    }

    library.dispose();
  });

  it('reports the first failed model in manifest order and cleans every fulfilled sibling', async () => {
    const roots = new Map(SHIP_FURNITURE_MODEL_IDS.map((id) => [id, modelRoot(id)]));
    const disposals = [...roots.entries()]
      .filter(([id]) => id !== 'desk' && id !== 'bookcaseOpen')
      .map(([, root]) => vi.spyOn(firstMesh(root).geometry, 'dispose'));
    const loader: ShipFurnitureModelLoader = {
      load: async (url) => {
        const id = modelIdForUrl(url);
        if (id === 'desk' || id === 'bookcaseOpen') throw new Error(`failed ${id}`);
        return roots.get(id)!;
      },
    };

    const failure = await ShipFurnitureLibrary.load(loader).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ShipFurnitureLoadError);
    expect(failure).toMatchObject({ modelId: 'desk' });
    expect((failure as Error).message).toContain('desk');
    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });

  it('names and cleans a model that loads with invalid bounds', async () => {
    const badRoot = new Group();
    const loader: ShipFurnitureModelLoader = {
      load: async (url) => modelIdForUrl(url) === 'chairDesk'
        ? badRoot
        : modelRoot(modelIdForUrl(url)),
    };

    await expect(ShipFurnitureLibrary.load(loader)).rejects.toMatchObject({ modelId: 'chairDesk' });
  });

  it('rejects per-model and aggregate triangle budget overflow with owned cleanup', async () => {
    const overBudget = modelRoot('bedBunk');
    const mesh = firstMesh(overBudget);
    mesh.geometry.dispose();
    mesh.geometry = triangleGeometry(1_001);
    const disposeOverBudget = vi.spyOn(mesh.geometry, 'dispose');
    await expect(ShipFurnitureLibrary.load({
      load: async (url) => modelIdForUrl(url) === 'bedBunk'
        ? overBudget
        : modelRoot(modelIdForUrl(url)),
    })).rejects.toThrow(/bedBunk.*triangle/i);
    expect(disposeOverBudget).toHaveBeenCalledOnce();

    vi.resetModules();
    vi.doMock('../src/world/shipFurnitureManifest', async () => {
      const actual = await vi.importActual<typeof import('../src/world/shipFurnitureManifest')>(
        '../src/world/shipFurnitureManifest',
      );
      return { ...actual, SHIP_FURNITURE_MAX_TOTAL_TRIANGLES: 80 };
    });
    try {
      const { ShipFurnitureLibrary: IsolatedLibrary } = await import(
        '../src/world/ShipFurnitureLibrary'
      );
      await expect(IsolatedLibrary.load({
        load: async (url) => modelRoot(modelIdForUrl(url)),
      })).rejects.toThrow(/aggregate triangle count/i);
    } finally {
      vi.doUnmock('../src/world/shipFurnitureManifest');
      vi.resetModules();
    }
  });
});

describe('ShipFurnitureLibrary ownership', () => {
  it('returns independent transforms while sharing immutable geometry and materials', () => {
    const originals = new Map(
      SHIP_FURNITURE_MODEL_IDS.map((id) => [id, modelRoot(id)]),
    );
    const library = ShipFurnitureLibrary.fromTemplatesForTest(originals);
    const first = library.clone('desk');
    const second = library.clone('desk');
    const templateMesh = firstMesh(originals.get('desk')!);
    const firstMeshClone = firstMesh(first);
    const secondMeshClone = firstMesh(second);

    first.position.set(10, 20, 30);
    first.rotation.y = 1.25;

    expect(first).not.toBe(second);
    expect(second.position.toArray()).toEqual([3.25, -1.5, 2.75]);
    expect(second.rotation.y).toBe(0);
    expect(firstMeshClone.geometry).toBe(templateMesh.geometry);
    expect(firstMeshClone.geometry).toBe(secondMeshClone.geometry);
    expect(firstMeshClone.material).toBe(templateMesh.material);
    expect(firstMeshClone.material).toBe(secondMeshClone.material);
    library.dispose();
  });

  it('disposes shared geometry, material, and texture resources exactly once', () => {
    const geometry = new BoxGeometry(1, 1, 1);
    const texture = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    const material = new MeshStandardMaterial({ map: texture });
    const templates = new Map(SHIP_FURNITURE_MODEL_IDS.map((id) => {
      const root = new Group();
      root.add(new Mesh(geometry, material));
      return [id, root] as const;
    }));
    const disposeGeometry = vi.spyOn(geometry, 'dispose');
    const disposeMaterial = vi.spyOn(material, 'dispose');
    const disposeTexture = vi.spyOn(texture, 'dispose');
    const library = ShipFurnitureLibrary.fromTemplatesForTest(templates);

    library.dispose();
    library.dispose();

    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
    expect(disposeTexture).toHaveBeenCalledOnce();
  });
});

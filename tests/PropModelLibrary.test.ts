import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ITEM_IDS, type ItemId, type ItemInstance } from '../src/game/ItemState';
import {
  ItemModelLoadError,
  PropModelLibrary,
  geometryTriangles,
  type ItemModelLoader,
} from '../src/world/PropModelLibrary';
import {
  ITEM_MODEL_ASSET_LEDGER,
  ITEM_MODEL_MAX_TOTAL_TRIANGLES,
  ITEM_MODEL_SPECS,
} from '../src/world/itemModelManifest';

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function triangleGeometry(triangles: number): BufferGeometry {
  const positions = new Float32Array(triangles * 9);
  for (let index = 0; index < triangles; index += 1) {
    positions.set([0, 0, 0, 1, 0, 0, 0, 1, 0], index * 9);
  }
  return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3));
}

function modelRoot(
  triangles = 12,
  material: Material | Material[] = new MeshStandardMaterial({ color: 0x557799 }),
): Group {
  const root = new Group();
  root.add(new Mesh(triangleGeometry(triangles), material));
  return root;
}

function templates(factory: (id: ItemId, index: number) => Group = () => modelRoot()): Map<ItemId, Group> {
  return new Map(ITEM_IDS.map((id, index) => [id, factory(id, index)]));
}

function instance(type: ItemId, suffix = 1): ItemInstance {
  return { instanceId: `${type}-${suffix}`, type };
}

function firstMesh(root: Group): Mesh<BufferGeometry, Material | Material[]> {
  let found: Mesh<BufferGeometry, Material | Material[]> | undefined;
  root.traverse((object) => {
    if (object instanceof Mesh && !found) found = object;
  });
  if (!found) throw new Error('Expected fixture mesh');
  return found;
}

function replaceLedgerRow(
  ledger: string,
  id: ItemId,
  replace: (row: string) => string,
): string {
  return ledger.split(/\r?\n/).map((row) => (
    row.startsWith(`| ${id} |`) ? replace(row) : row
  )).join('\n');
}

function swapLedgerRowValues(
  ledger: string,
  firstId: ItemId,
  secondId: ItemId,
  firstValues: readonly string[],
  secondValues: readonly string[],
): string {
  const withFirstChanged = replaceLedgerRow(ledger, firstId, (row) => (
    firstValues.reduce((changed, value, index) => (
      changed.replace(value, secondValues[index]!)
    ), row)
  ));
  return replaceLedgerRow(withFirstChanged, secondId, (row) => (
    secondValues.reduce((changed, value, index) => (
      changed.replace(value, firstValues[index]!)
    ), row)
  ));
}

async function expectLedgerRejectedBeforeLoad(ledger: string, itemId: ItemId): Promise<void> {
  vi.resetModules();
  vi.doMock('../src/world/itemModelManifest', async () => {
    const actual = await vi.importActual<typeof import('../src/world/itemModelManifest')>(
      '../src/world/itemModelManifest',
    );
    return { ...actual, ITEM_MODEL_ASSET_LEDGER: ledger };
  });
  const loader: ItemModelLoader = { load: vi.fn(async () => modelRoot()) };

  try {
    const { PropModelLibrary: IsolatedPropModelLibrary } = await import('../src/world/PropModelLibrary');
    await expect(IsolatedPropModelLibrary.load(loader)).rejects.toThrow(new RegExp(itemId));
    expect(loader.load).not.toHaveBeenCalled();
  } finally {
    vi.doUnmock('../src/world/itemModelManifest');
    vi.resetModules();
  }
}

async function expectManifestRejectedBeforeLoad(
  itemId: ItemId,
  mutate: (spec: typeof ITEM_MODEL_SPECS[ItemId]) => typeof ITEM_MODEL_SPECS[ItemId],
): Promise<void> {
  vi.resetModules();
  vi.doMock('../src/world/itemModelManifest', async () => {
    const actual = await vi.importActual<typeof import('../src/world/itemModelManifest')>(
      '../src/world/itemModelManifest',
    );
    return {
      ...actual,
      ITEM_MODEL_SPECS: { ...actual.ITEM_MODEL_SPECS, [itemId]: mutate(actual.ITEM_MODEL_SPECS[itemId]) },
    };
  });
  const loader: ItemModelLoader = { load: vi.fn(async () => modelRoot()) };

  try {
    const { PropModelLibrary: IsolatedPropModelLibrary } = await import('../src/world/PropModelLibrary');
    await expect(IsolatedPropModelLibrary.load(loader)).rejects.toThrow(new RegExp(itemId));
    expect(loader.load).not.toHaveBeenCalled();
  } finally {
    vi.doUnmock('../src/world/itemModelManifest');
    vi.resetModules();
  }
}

describe('PropModelLibrary preload', () => {
  it('rejects a stable GLB filename assigned to the wrong item row before loading', async () => {
    const ledger = replaceLedgerRow(ITEM_MODEL_ASSET_LEDGER, 'ductTape', (row) => (
      row.replace('`ductTape.glb`', '`fishingRod.glb`')
    ));

    await expectLedgerRejectedBeforeLoad(ledger, 'ductTape');
  });

  it('rejects source URLs and source asset IDs swapped between item rows before loading', async () => {
    const ledger = swapLedgerRowValues(
      ITEM_MODEL_ASSET_LEDGER,
      'ductTape',
      'fishingRod',
      [
        'https://kenney.nl/assets/prototype-kit',
        'prototype-kit@1.0:Models/GLB format/shape-hollow-cylinder-detailed.glb',
      ],
      [
        'https://kenney.nl/assets/prototype-kit',
        'prototype-kit@1.0:composite/fishingRod',
      ],
    );

    await expectLedgerRejectedBeforeLoad(ledger, 'ductTape');
  });

  it('rejects a license URL that does not match the manifest before loading', async () => {
    const ledger = replaceLedgerRow(ITEM_MODEL_ASSET_LEDGER, 'ductTape', (row) => (
      row.replace('https://creativecommons.org/publicdomain/zero/1.0/', 'https://example.com/wrong-license')
    ));

    await expectLedgerRejectedBeforeLoad(ledger, 'ductTape');
  });

  it('rejects a creator substring instead of the exact creator identity before loading', async () => {
    const ledger = replaceLedgerRow(ITEM_MODEL_ASSET_LEDGER, 'ductTape', (row) => (
      row.replace('Hollow cylinder detailed / Kenney', 'Hollow cylinder detailed / Kenn')
    ));

    await expectLedgerRejectedBeforeLoad(ledger, 'ductTape');
  });

  it('rejects a missing item row before loading', async () => {
    const ledger = ITEM_MODEL_ASSET_LEDGER.split(/\r?\n/)
      .filter((row) => !row.startsWith('| ductTape |'))
      .join('\n');

    await expectLedgerRejectedBeforeLoad(ledger, 'ductTape');
  });

  it('rejects a duplicate item row before loading', async () => {
    const row = ITEM_MODEL_ASSET_LEDGER.split(/\r?\n/)
      .find((candidate) => candidate.startsWith('| ductTape |'))!;
    const ledger = ITEM_MODEL_ASSET_LEDGER.replace(row, `${row}\n${row}`);

    await expectLedgerRejectedBeforeLoad(ledger, 'ductTape');
  });

  it('rejects a project recipe whose item suffix does not match before loading', async () => {
    await expectManifestRejectedBeforeLoad('flareGun', (spec) => ({
      ...spec,
      provenance: { kind: 'project', recipeId: 'project-item-models@1:anchor', creator: 'Project team' },
    }));
  });

  it('rejects invalid generated metadata before loading', async () => {
    await expectManifestRejectedBeforeLoad('flareGun', (spec) => ({
      ...spec,
      generatedMetadata: { ...spec.generatedMetadata, triangles: 0 },
    }));
  });

  it('requests every manifest URL in parallel before any request resolves', async () => {
    const requests = new Map<string, Deferred<Group>>();
    const loader: ItemModelLoader = {
      load: vi.fn((url: string) => {
        const request = deferred<Group>();
        requests.set(url, request);
        return request.promise;
      }),
    };

    const loading = PropModelLibrary.load(loader);
    void loading.catch(() => undefined);

    expect([...requests.keys()]).toEqual(ITEM_IDS.map((id) => ITEM_MODEL_SPECS[id].url));
    for (const id of ITEM_IDS) requests.get(ITEM_MODEL_SPECS[id].url)?.resolve(modelRoot());
    const library = await loading;
    library.dispose();
  });

  it('normalizes every valid model to finite non-empty bounds within its triangle budget', async () => {
    const authoredPosition = [0.17, -0.08, 0.29] as const;
    const authoredRotation = [0.11, -0.22, 0.33] as const;
    const authoredScale = [0.8, 1.1, 0.9] as const;
    const loader: ItemModelLoader = {
      load: async () => {
        const root = modelRoot();
        const mesh = firstMesh(root);
        mesh.position.set(...authoredPosition);
        mesh.rotation.set(...authoredRotation);
        mesh.scale.set(...authoredScale);
        return root;
      },
    };
    const library = await PropModelLibrary.load(loader);

    for (const id of ITEM_IDS) {
      const created = library.create(instance(id));
      const bounds = new Box3().setFromObject(created);
      const size = bounds.getSize(new Vector3());
      const center = bounds.getCenter(new Vector3());
      const normalizedModel = created.children[0]!;
      const mesh = firstMesh(created);
      expect(created.position.toArray()).toEqual([0, 0, 0]);
      expect(created.quaternion.angleTo(new Quaternion())).toBeCloseTo(0);
      expect(created.scale.toArray()).toEqual([1, 1, 1]);
      expect(normalizedModel.scale.toArray()).not.toEqual([1, 1, 1]);
      expect(bounds.isEmpty()).toBe(false);
      expect([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)).toBe(true);
      expect(Math.max(...size.toArray())).toBeCloseTo(ITEM_MODEL_SPECS[id].targetLongestDimension);
      center.toArray().forEach((value, index) => {
        expect(value).toBeCloseTo(ITEM_MODEL_SPECS[id].offset[index]!, 6);
      });
      expect(geometryTriangles(mesh.geometry)).toBeLessThanOrEqual(ITEM_MODEL_SPECS[id].maxTriangles);
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
      expect(mesh.position.toArray()).toEqual(authoredPosition);
      mesh.rotation.toArray().slice(0, 3).forEach((value, index) => {
        expect(value).toBeCloseTo(authoredRotation[index]!);
      });
      expect(mesh.scale.toArray()).toEqual(authoredScale);
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => material.dispose());
    }

    library.dispose();
  });

  it.each([
    ['no meshes', () => new Group()],
    ['missing position data', () => {
      const root = new Group();
      root.add(new Mesh(new BufferGeometry(), new MeshStandardMaterial()));
      return root;
    }],
    ['empty position data', () => {
      const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([], 3));
      const root = new Group();
      root.add(new Mesh(geometry, new MeshStandardMaterial()));
      return root;
    }],
    ['non-finite positions', () => {
      const geometry = new BufferGeometry().setAttribute(
        'position',
        new Float32BufferAttribute([0, 0, 0, Number.NaN, 1, 0, 0, 1, 0], 3),
      );
      const root = new Group();
      root.add(new Mesh(geometry, new MeshStandardMaterial()));
      return root;
    }],
    ['non-triangle geometry', () => {
      const geometry = new BufferGeometry().setAttribute(
        'position',
        new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3),
      );
      const root = new Group();
      root.add(new Mesh(geometry, new MeshStandardMaterial()));
      return root;
    }],
    ['zero-length bounds', () => {
      const geometry = new BufferGeometry().setAttribute(
        'position',
        new Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3),
      );
      const root = new Group();
      root.add(new Mesh(geometry, new MeshStandardMaterial()));
      return root;
    }],
    ['an item triangle-budget overflow', () => modelRoot(3_001)],
  ])('rejects %s with the item ID and disposes its source root', async (_caseName, invalidRoot) => {
    const badRoot = invalidRoot();
    const mesh = badRoot.getObjectByProperty('isMesh', true) as Mesh | undefined;
    const geometryDispose = mesh ? vi.spyOn(mesh.geometry, 'dispose') : undefined;
    const materials = mesh
      ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      : [];
    const materialDisposes = materials.map((material) => vi.spyOn(material, 'dispose'));
    const loader: ItemModelLoader = {
      load: async (url) => url === ITEM_MODEL_SPECS.flareGun.url ? badRoot : modelRoot(),
    };

    await expect(PropModelLibrary.load(loader)).rejects.toThrow(/flareGun/);
    if (geometryDispose) expect(geometryDispose).toHaveBeenCalledTimes(1);
    materialDisposes.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
  });

  it('accepts the maximum per-item aggregate within the library triangle budget', async () => {
    const triangleCounts = ITEM_IDS.map((_id, index) => index < 13 ? 3_000 : 1);
    const roots = templates((_id, index) => modelRoot(triangleCounts[index]!));
    const geometryDisposes = [...roots.values()].map((root) => vi.spyOn(firstMesh(root).geometry, 'dispose'));
    expect(Math.max(...triangleCounts)).toBe(3_000);
    expect(triangleCounts.reduce((sum, count) => sum + count, 0))
      .toBeLessThanOrEqual(ITEM_MODEL_MAX_TOTAL_TRIANGLES);
    const loader: ItemModelLoader = {
      load: async (url) => roots.get(ITEM_IDS.find((id) => ITEM_MODEL_SPECS[id].url === url)!)!,
    };

    const library = await PropModelLibrary.load(loader);
    library.dispose();
    geometryDisposes.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
  });

  it('reports the first failing item in manifest order and disposes every fulfilled template', async () => {
    const roots = templates();
    const geometryDisposes = [...roots.entries()]
      .filter(([id]) => id !== 'ductTape' && id !== 'bucket')
      .map(([, root]) => vi.spyOn(firstMesh(root).geometry, 'dispose'));
    const loader: ItemModelLoader = {
      load: async (url) => {
        const id = ITEM_IDS.find((itemId) => ITEM_MODEL_SPECS[itemId].url === url)!;
        if (id === 'ductTape' || id === 'bucket') throw new Error(`failed ${id}`);
        return roots.get(id)!;
      },
    };

    await expect(PropModelLibrary.load(loader)).rejects.toThrow(/ductTape/);
    geometryDisposes.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
  });

  it('continues failed-load rollback without masking the primary item error', async () => {
    const roots = templates();
    const loadFailure = new Error('duct tape download failed');
    const cleanupFailure = new Error('flare cleanup failed');
    const firstGeometryDispose = vi.spyOn(firstMesh(roots.get('flareGun')!).geometry, 'dispose')
      .mockImplementation(() => {
        throw cleanupFailure;
      });
    const laterGeometryDispose = vi.spyOn(firstMesh(roots.get('fishingRod')!).geometry, 'dispose');
    const loader: ItemModelLoader = {
      load: async (url) => {
        const id = ITEM_IDS.find((itemId) => ITEM_MODEL_SPECS[itemId].url === url)!;
        if (id === 'ductTape') throw loadFailure;
        return roots.get(id)!;
      },
    };

    const failure = await PropModelLibrary.load(loader).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ItemModelLoadError);
    expect(failure).toMatchObject({ itemId: 'ductTape', cause: loadFailure });
    expect(firstGeometryDispose).toHaveBeenCalledOnce();
    expect(laterGeometryDispose).toHaveBeenCalledOnce();
  });
});

describe('PropModelLibrary instance ownership', () => {
  it('creates independently owned roots, geometries, materials, and stable metadata', () => {
    const originals = templates((_id, index) => modelRoot(12, [
      new MeshStandardMaterial({ color: 0x112233 + index }),
      new MeshStandardMaterial({ color: 0x445566 + index }),
    ]));
    const library = PropModelLibrary.fromTemplatesForTest(originals);
    const first = library.create(instance('ductTape', 1));
    const second = library.create(instance('ductTape', 2));
    const templateMesh = firstMesh(originals.get('ductTape')!);
    const firstOwnedMesh = firstMesh(first);
    const secondOwnedMesh = firstMesh(second);

    expect(first.name).toBe('prop:ductTape-1');
    expect(first.userData).toMatchObject({ instanceId: 'ductTape-1', itemType: 'ductTape' });
    expect(first.position.toArray()).toEqual([0, 0, 0]);
    expect(first.quaternion.angleTo(new Quaternion())).toBeCloseTo(0);
    expect(first.scale.toArray()).toEqual([1, 1, 1]);
    expect(first).not.toBe(second);
    expect(firstOwnedMesh.geometry).not.toBe(secondOwnedMesh.geometry);
    expect(firstOwnedMesh.geometry).not.toBe(templateMesh.geometry);
    expect(Array.isArray(firstOwnedMesh.material)).toBe(true);
    const firstMaterials = firstOwnedMesh.material as Material[];
    const secondMaterials = secondOwnedMesh.material as Material[];
    const templateMaterials = templateMesh.material as Material[];
    firstMaterials.forEach((material, index) => {
      expect(material).not.toBe(secondMaterials[index]);
      expect(material).not.toBe(templateMaterials[index]);
    });

    (firstMaterials[0] as MeshStandardMaterial).color.set(0xff0000);
    expect((secondMaterials[0] as MeshStandardMaterial).color.getHex()).not.toBe(0xff0000);
    expect((templateMaterials[0] as MeshStandardMaterial).color.getHex()).not.toBe(0xff0000);

    firstOwnedMesh.geometry.dispose();
    secondOwnedMesh.geometry.dispose();
    firstMaterials.forEach((material) => material.dispose());
    secondMaterials.forEach((material) => material.dispose());
    library.dispose();
  });

  it('disposes each owned template resource exactly once across repeated disposal', () => {
    const originals = templates();
    const geometryDisposes = [...originals.values()].map((root) => vi.spyOn(firstMesh(root).geometry, 'dispose'));
    const materialDisposes = [...originals.values()].map((root) => {
      const material = firstMesh(root).material;
      return vi.spyOn(Array.isArray(material) ? material[0]! : material, 'dispose');
    });
    const library = PropModelLibrary.fromTemplatesForTest(originals);

    library.dispose();
    library.dispose();

    geometryDisposes.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    materialDisposes.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
  });
});

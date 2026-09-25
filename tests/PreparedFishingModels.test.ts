import { readFile } from 'node:fs/promises';
import { Box3,BoxGeometry,DataTexture,Group,Mesh,MeshStandardMaterial,Texture,Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe,expect,it,vi } from 'vitest';
import { FishingCatchLibrary,catchModelSpec } from '../src/survival/FishingCatchLibrary';
import { FishingModelLibrary } from '../src/survival/FishingModelLibrary';
import { FISHING_CATCHES } from '../src/survival/fishingCatalog';
import { FISHING_MODEL_SIZES } from '../src/game/fishingModelSizes';

function model() {
  const texture = new DataTexture(new Uint8Array(16), 2, 2);
  const geometry = new BoxGeometry(2, 1, 1);
  const material = new MeshStandardMaterial({ map: texture, roughness: 0.2 });
  const mesh = new Mesh(geometry, material);
  const root = new Group();
  root.add(mesh, new Mesh(geometry, material));
  const disposals = [geometry, material, texture].map((resource) => vi.spyOn(resource, 'dispose'));
  return { root, mesh, geometry, material, texture, disposals };
}

function preparedLoader() {
  const models = new Map<string, ReturnType<typeof model>>();
  const load = vi.fn(async (url: string) => {
    const source = model();
    models.set(url, source);
    return source.root;
  });
  return { load, models };
}

describe('prepared fishing models', () => {
  // Importance: 95. Damage must not rescale a catch after its intact size is set.
  it('preserves the intact model scale when preparing a broken compass catch', async () => {
    const bytes = await readFile('src/assets/models/items/compass.glb');
    const data = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(data).set(bytes);
    const loader = new GLTFLoader().register(() => ({
      name: 'size-check-textures', loadTexture: async () => new Texture(),
    }));
    const { scene } = await loader.parseAsync(data, '');
    const definition = FISHING_CATCHES.find(({ id }) => id === 'brokenCompass')!;
    scene.rotation.set(...catchModelSpec(definition)!.rotation);
    const size = new Box3().setFromObject(scene, true).getSize(new Vector3());
    const expectedScale = FISHING_MODEL_SIZES.brokenCompass / Math.max(size.x, size.y, size.z);
    const library = new FishingCatchLibrary({ load: async () => scene });
    try {
      const root = (await library.prepare('brokenCompass'))!;
      expect(root.scale.x).toBeCloseTo(expectedScale, 8);
      expect(root.scale.y).toBe(root.scale.x);
      expect(root.scale.z).toBe(root.scale.x);
    } finally {
      library.dispose();
    }
  });

  it('owns each catch clone and retains templates after catch disposal', async () => {
    const loader = preparedLoader();
    const library = await FishingModelLibrary.load(loader);
    const definition = FISHING_CATCHES.find(({ id }) => id === 'cod')!;
    const url = catchModelSpec(definition)!.url;
    const template = loader.models.get(url)!;
    const firstCatch = new FishingCatchLibrary(library);
    const secondCatch = new FishingCatchLibrary(library);
    const first = (await firstCatch.prepare('cod'))!;
    const second = (await secondCatch.prepare('cod'))!;
    const firstMesh = first.children[0]!.children[0] as Mesh<BoxGeometry, MeshStandardMaterial>;
    const secondMesh = second.children[0]!.children[0] as Mesh<BoxGeometry, MeshStandardMaterial>;
    const firstSibling = first.children[0]!.children[1] as Mesh;

    expect(firstMesh.geometry).not.toBe(template.geometry);
    expect(firstMesh.geometry).not.toBe(secondMesh.geometry);
    expect(firstMesh.material).not.toBe(template.material);
    expect(firstMesh.material).not.toBe(secondMesh.material);
    expect(firstMesh.material.map).not.toBe(template.texture);
    expect(firstMesh.material.map).not.toBe(secondMesh.material.map);
    expect(firstMesh.material.map!.image).toBe(template.texture.image);
    expect(firstSibling.geometry).toBe(firstMesh.geometry);
    expect(firstSibling.material).toBe(firstMesh.material);
    expect(template.material.roughness).toBe(0.2);
    firstMesh.material.color.setHex(0x123456);
    expect(secondMesh.material.color.getHex()).not.toBe(0x123456);
    const instanceDisposals = [firstMesh.geometry, firstMesh.material, firstMesh.material.map!]
      .map((resource) => vi.spyOn(resource, 'dispose'));

    firstCatch.hide();
    firstCatch.dispose();
    instanceDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    template.disposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
    expect(await secondCatch.prepare('cod')).not.toBeNull();
    expect(loader.load.mock.calls.filter(([loadedUrl]) => loadedUrl === url)).toHaveLength(1);
    secondCatch.dispose();
    library.dispose();
    library.dispose();
    template.disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    expect([...library.preparationRoots()]).toEqual([]);
    await expect(library.load(url)).rejects.toThrow('Fishing model library is disposed');
  });

  it('waits for pending loads and releases successful models after preload failure', async () => {
    const ready = model();
    const delayed = model();
    const failure = new Error('Model download failed');
    let release!: (root: Group) => void;
    const pending = new Promise<Group>((resolve) => { release = resolve; });
    let request = 0;
    const load = vi.fn(async () => {
      request += 1;
      if (request === 1) throw failure;
      if (request === 2) return pending;
      return ready.root;
    });
    const result = FishingModelLibrary.load({ load });
    let settled = false;
    void result.then(() => { settled = true; }, () => { settled = true; });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    ready.disposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
    release(delayed.root);
    await expect(result).rejects.toBe(failure);
    [...ready.disposals, ...delayed.disposals].forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });
});

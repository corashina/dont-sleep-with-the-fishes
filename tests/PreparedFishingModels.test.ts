import { BoxGeometry,DataTexture,Group,Mesh,MeshStandardMaterial } from 'three';
import { describe,expect,it,vi } from 'vitest';
import { FishingCatchLibrary,catchModelSpec } from '../src/survival/FishingCatchLibrary';
import { FishingModelLibrary } from '../src/survival/FishingModelLibrary';
import { FISHING_CATCHES } from '../src/survival/fishingCatalog';

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
  it('loads each unique model URL once, including every item catch', async () => {
    const loader = preparedLoader();
    const library = await FishingModelLibrary.load(loader);
    const urls = FISHING_CATCHES.flatMap((definition) => {
      const spec = catchModelSpec(definition);
      return spec ? [spec.url] : [];
    });
    expect(loader.load).toHaveBeenCalledTimes(new Set(urls).size);
    expect(new Set(loader.load.mock.calls.map(([url]) => url))).toEqual(new Set(urls));
    const itemDefinitions = FISHING_CATCHES.filter(({ presentation }) => presentation.kind === 'item');
    expect(itemDefinitions.length).toBeGreaterThan(0);
    for (const definition of itemDefinitions) {
      expect(loader.load).toHaveBeenCalledWith(catchModelSpec(definition)!.url);
    }
    expect([...library.preparationRoots()]).toEqual([...loader.models.values()].map(({ root }) => root));
    library.dispose();
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

  it('rejects missing prepared URLs without a new model request', async () => {
    const loader = preparedLoader();
    const library = await FishingModelLibrary.load(loader);
    const requests = loader.load.mock.calls.length;
    await expect(library.load('missing.glb')).rejects.toThrow('Missing prepared fishing model: missing.glb');
    expect(loader.load).toHaveBeenCalledTimes(requests);
    library.dispose();
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

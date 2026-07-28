import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  FishingCatchLibrary,
  type FishingCatchModelLoader,
} from '../src/survival/FishingCatchLibrary';

function testModel() {
  const root = new Group();
  const geometry = new BoxGeometry(4, 1, 1);
  const material = new MeshStandardMaterial();
  root.add(new Mesh(geometry, material));
  return { geometry, material, root };
}

describe('FishingCatchLibrary', () => {
  it('loads mapped catches only on prepare and releases them on hide', async () => {
    const model = testModel();
    const loader: FishingCatchModelLoader = {
      load: vi.fn(async () => model.root),
    };
    const geometryDispose = vi.spyOn(model.geometry, 'dispose');
    const materialDispose = vi.spyOn(model.material, 'dispose');
    const library = new FishingCatchLibrary(loader);

    expect(loader.load).not.toHaveBeenCalled();
    const prepared = await library.prepare('cod');

    expect(loader.load).toHaveBeenCalledOnce();
    expect(prepared?.userData.fishingModelSource).toBe('poly-pizza');
    const size = new Box3().setFromObject(prepared!).getSize(new Vector3());
    expect(size.x).toBeCloseTo(1.05);

    library.hide();
    library.hide();
    expect(prepared?.parent).toBeNull();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it('falls back to a procedural catch when its model cannot load', async () => {
    const loader: FishingCatchModelLoader = {
      load: vi.fn(async () => { throw new Error('load failed'); }),
    };
    const library = new FishingCatchLibrary(loader);

    const prepared = await library.prepare('seaweed');

    expect(loader.load).toHaveBeenCalledOnce();
    expect(prepared?.userData.fishingModelSource).toBe('procedural');
    library.dispose();
  });

  it('loads the existing item model for utility catches', async () => {
    const model = testModel();
    const loader: FishingCatchModelLoader = { load: vi.fn(async () => model.root) };
    const library = new FishingCatchLibrary(loader);

    const prepared = await library.prepare('energyBar');

    expect(loader.load).toHaveBeenCalledWith(expect.stringContaining('energyBar.glb'));
    expect(prepared?.userData.fishingModelSource).toBe('item-model');
    expect(prepared?.userData.fishingItemId).toBe('energyBar');
    library.dispose();
  });

  it('applies and disposes the broken treatment for damaged utility catches', async () => {
    const model = testModel();
    model.material.color.setHex(0xffffff);
    const dispose = vi.spyOn(model.material, 'dispose');
    const library = new FishingCatchLibrary({ load: async () => model.root });
    const prepared = await library.prepare('brokenCompass');
    const mesh = prepared!.getObjectByProperty('isMesh', true) as Mesh;

    expect((mesh.material as MeshStandardMaterial).color.getHex()).not.toBe(0xffffff);
    library.hide();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('discards a load that finishes after the reveal is cleared', async () => {
    let resolveLoad!: (root: Group) => void;
    const loader: FishingCatchModelLoader = {
      load: () => new Promise((resolve) => {
        resolveLoad = resolve;
      }),
    };
    const library = new FishingCatchLibrary(loader);
    const pending = library.prepare('cod');
    library.hide();
    const model = testModel();
    const geometryDispose = vi.spyOn(model.geometry, 'dispose');
    resolveLoad(model.root);

    await expect(pending).resolves.toBeNull();
    expect(geometryDispose).toHaveBeenCalledOnce();
  });

  it('falls back to a procedural utility catch when its model cannot load', async () => {
    const loader: FishingCatchModelLoader = {
      load: vi.fn(async () => { throw new Error('load failed'); }),
    };
    const library = new FishingCatchLibrary(loader);

    const utility = await library.prepare('energyBar');

    expect(utility?.userData).toMatchObject({
      fishingModelSource: 'procedural-item',
      fishingItemId: 'energyBar',
    });
    library.dispose();
  });
});

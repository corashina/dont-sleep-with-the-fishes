import {
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  MenuSandAssetLoadError,
  MenuSandAssets,
  type MenuSandTextureLoader,
} from '../src/menu/MenuSandAssets';
import { createMenuSeabedMaterial } from '../src/menu/MenuSeabedMaterial';

describe('MenuSandAssets', () => {
  it('loads and configures one color map for all menu terrain', async () => {
    const texture = new Texture();
    const loader: MenuSandTextureLoader = {
      loadAsync: vi.fn(async () => texture),
    };

    const assets = await MenuSandAssets.load(loader);
    assets.configure(16);

    expect(loader.loadAsync).toHaveBeenCalledOnce();
    expect(assets.smooth).toBe(texture);
    expect(texture.wrapS).toBe(RepeatWrapping);
    expect(texture.wrapT).toBe(RepeatWrapping);
    expect(texture.magFilter).toBe(LinearFilter);
    expect(texture.minFilter).toBe(LinearMipmapLinearFilter);
    expect(texture.anisotropy).toBe(8);
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.colorSpace).toBe(SRGBColorSpace);
    expect(texture.repeat.toArray()).toEqual([14, 10]);
  });

  it('reports texture load failures', async () => {
    const failure = new Error('missing sand');
    const loader: MenuSandTextureLoader = {
      loadAsync: vi.fn(() => Promise.reject(failure)),
    };

    await expect(MenuSandAssets.load(loader)).rejects.toEqual(
      expect.objectContaining({
        name: 'MenuSandAssetLoadError',
        cause: failure,
      }),
    );
  });

  it('disposes the owned texture once', () => {
    const texture = new Texture();
    const dispose = vi.spyOn(texture, 'dispose');
    const assets = MenuSandAssets.fromTexture(texture);

    assets.dispose();
    assets.dispose();

    expect(dispose).toHaveBeenCalledOnce();
  });

  it('reports a typed load error', () => {
    expect(new MenuSandAssetLoadError('failed')).toBeInstanceOf(Error);
  });
});

describe('createMenuSeabedMaterial', () => {
  it('uses the single sand map with standard lighting', () => {
    const texture = new Texture();
    const assets = MenuSandAssets.fromTexture(texture);
    const material = createMenuSeabedMaterial(assets);

    expect(material.map).toBe(texture);
    expect(material.roughness).toBe(1);
    expect(material.vertexColors).toBe(true);
  });
});

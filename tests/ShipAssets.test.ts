import {
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  ShipAssetLoadError,
  ShipAssets,
} from '../src/world/ShipAssets';

describe('ShipAssets', () => {
  it('loads, configures, and disposes all six local maps once', async () => {
    const textures = Array.from({ length: 6 }, () => new Texture());
    const disposals = textures.map((texture) => vi.spyOn(texture, 'dispose'));
    const pending = [...textures];
    const loader = { loadAsync: vi.fn(async () => pending.shift()!) };

    const assets = await ShipAssets.load(loader);
    assets.configure(16);

    expect(loader.loadAsync).toHaveBeenCalledTimes(6);
    expect(assets.steelColor.colorSpace).toBe(SRGBColorSpace);
    expect(assets.woodColor.colorSpace).toBe(SRGBColorSpace);
    for (const texture of [
      assets.steelRoughness,
      assets.steelNormal,
      assets.woodRoughness,
      assets.woodNormal,
    ]) {
      expect(texture.colorSpace).toBe(NoColorSpace);
    }
    for (const texture of textures) {
      expect(texture.wrapS).toBe(RepeatWrapping);
      expect(texture.wrapT).toBe(RepeatWrapping);
      expect(texture.magFilter).toBe(LinearFilter);
      expect(texture.minFilter).toBe(LinearMipmapLinearFilter);
      expect(texture.anisotropy).toBe(8);
      expect(texture.generateMipmaps).toBe(true);
      expect(texture.version).toBeGreaterThan(0);
    }
    expect(assets.steelColor.repeat.toArray()).toEqual([3, 3]);
    expect(assets.woodColor.repeat.toArray()).toEqual([2, 8]);

    assets.dispose();
    assets.dispose();
    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });

  it('disposes fulfilled siblings and wraps the first load failure', async () => {
    const fulfilled = Array.from({ length: 5 }, () => new Texture());
    const disposals = fulfilled.map((texture) => vi.spyOn(texture, 'dispose'));
    const failure = new Error('steel normal missing');
    let fulfilledIndex = 0;
    const loader = {
      loadAsync: vi.fn(async (url: string) => {
        if (url.includes('painted-steel-normal')) throw failure;
        return fulfilled[fulfilledIndex++]!;
      }),
    };

    await expect(ShipAssets.load(loader)).rejects.toMatchObject({
      name: 'ShipAssetLoadError',
      cause: failure,
    });
    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });

  it('creates test-owned assets from supplied textures', () => {
    const textures = Array.from({ length: 6 }, () => new Texture()) as [
      Texture,
      Texture,
      Texture,
      Texture,
      Texture,
      Texture,
    ];
    const assets = ShipAssets.fromTextures(...textures);

    expect([
      assets.steelColor,
      assets.steelRoughness,
      assets.steelNormal,
      assets.woodColor,
      assets.woodRoughness,
      assets.woodNormal,
    ]).toEqual(textures);
    expect(() => new ShipAssetLoadError('missing')).not.toThrow();
    assets.dispose();
  });
});

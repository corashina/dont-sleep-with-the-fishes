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
  LifeboatAssetLoadError,
  LifeboatAssets,
} from '../src/world/LifeboatAssets';

describe('LifeboatAssets', () => {
  it('loads, configures, and disposes all three local maps once', async () => {
    const color = new Texture();
    const roughness = new Texture();
    const normal = new Texture();
    const disposeColor = vi.spyOn(color, 'dispose');
    const disposeRoughness = vi.spyOn(roughness, 'dispose');
    const disposeNormal = vi.spyOn(normal, 'dispose');
    const pending = [color, roughness, normal];
    const loader = { loadAsync: vi.fn(async () => pending.shift()!) };

    const assets = await LifeboatAssets.load(loader);
    assets.configure(8);

    expect(loader.loadAsync).toHaveBeenCalledTimes(3);
    expect(assets.color.colorSpace).toBe(SRGBColorSpace);
    expect(assets.roughness.colorSpace).toBe(NoColorSpace);
    expect(assets.normal.colorSpace).toBe(NoColorSpace);
    for (const texture of [assets.color, assets.roughness, assets.normal]) {
      expect(texture.wrapS).toBe(RepeatWrapping);
      expect(texture.wrapT).toBe(RepeatWrapping);
      expect(texture.magFilter).toBe(LinearFilter);
      expect(texture.minFilter).toBe(LinearMipmapLinearFilter);
      expect(texture.anisotropy).toBe(8);
      expect(texture.generateMipmaps).toBe(true);
      expect(texture.version).toBeGreaterThan(0);
    }

    assets.dispose();
    assets.dispose();

    expect(disposeColor).toHaveBeenCalledOnce();
    expect(disposeRoughness).toHaveBeenCalledOnce();
    expect(disposeNormal).toHaveBeenCalledOnce();
  });

  it('disposes fulfilled siblings and wraps the first load failure', async () => {
    const color = new Texture();
    const normal = new Texture();
    const disposeColor = vi.spyOn(color, 'dispose');
    const disposeNormal = vi.spyOn(normal, 'dispose');
    const failure = new Error('roughness missing');
    const loader = {
      loadAsync: vi.fn(async (url: string) => {
        if (url.includes('roughness')) throw failure;
        return url.includes('color') ? color : normal;
      }),
    };

    await expect(LifeboatAssets.load(loader)).rejects.toMatchObject({
      name: 'LifeboatAssetLoadError',
      cause: failure,
    });
    expect(disposeColor).toHaveBeenCalledOnce();
    expect(disposeNormal).toHaveBeenCalledOnce();
  });

  it('creates test-owned assets from supplied textures', () => {
    const textures = [new Texture(), new Texture(), new Texture()] as const;
    const assets = LifeboatAssets.fromTextures(...textures);

    expect([assets.color, assets.roughness, assets.normal]).toEqual(textures);
    expect(() => new LifeboatAssetLoadError('missing')).not.toThrow();
    assets.dispose();
  });
});

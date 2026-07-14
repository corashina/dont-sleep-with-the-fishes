import { describe, expect, it, vi } from 'vitest';
import {
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  Texture,
} from 'three';
import {
  SkyAssetLoadError,
  SkyAssets,
  type SkyTextureLoader,
} from '../src/world/SkyAssets';

describe('SkyAssets', () => {
  it('loads and configures the bundled gibbous moon texture', async () => {
    const texture = new Texture();
    const loadAsync = vi.fn(async (_url: string) => texture);
    const assets = await SkyAssets.load({ loadAsync } satisfies SkyTextureLoader);

    expect(loadAsync).toHaveBeenCalledOnce();
    expect(loadAsync.mock.calls[0]![0]).toMatch(/moon-gibbous\.png$/);
    expect(assets.moonTexture).toBe(texture);
    expect(texture.wrapS).toBe(ClampToEdgeWrapping);
    expect(texture.wrapT).toBe(ClampToEdgeWrapping);
    expect(texture.magFilter).toBe(LinearFilter);
    expect(texture.minFilter).toBe(LinearMipmapLinearFilter);
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.colorSpace).toBe(SRGBColorSpace);
    expect(texture.version).toBeGreaterThan(0);
  });

  it('reports a sky-specific load failure', async () => {
    const cause = new Error('image decode failed');
    const loader = {
      loadAsync: vi.fn(async () => { throw cause; }),
    } satisfies SkyTextureLoader;

    await expect(SkyAssets.load(loader)).rejects.toMatchObject({
      name: 'SkyAssetLoadError',
      message: 'Moon texture could not be loaded.',
      cause,
    });
  });

  it('disposes its shared moon texture once', () => {
    const texture = new Texture();
    const dispose = vi.spyOn(texture, 'dispose');
    const assets = SkyAssets.fromTexture(texture);

    assets.dispose();
    assets.dispose();

    expect(dispose).toHaveBeenCalledOnce();
  });
});

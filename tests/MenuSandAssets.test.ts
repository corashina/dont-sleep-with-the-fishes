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
  it('loads and configures the two color maps for repeated seabed use', async () => {
    const textures = [new Texture(), new Texture()];
    const loader: MenuSandTextureLoader = {
      loadAsync: vi.fn(async () => textures.shift()!),
    };

    const assets = await MenuSandAssets.load(loader);
    assets.configure(16);

    expect(loader.loadAsync).toHaveBeenCalledTimes(2);
    for (const texture of [assets.smooth, assets.coarse]) {
      expect(texture.wrapS).toBe(RepeatWrapping);
      expect(texture.wrapT).toBe(RepeatWrapping);
      expect(texture.magFilter).toBe(LinearFilter);
      expect(texture.minFilter).toBe(LinearMipmapLinearFilter);
      expect(texture.anisotropy).toBe(8);
      expect(texture.generateMipmaps).toBe(true);
      expect(texture.colorSpace).toBe(SRGBColorSpace);
      expect(texture.repeat.toArray()).toEqual([28, 20]);
    }
  });

  it('disposes fulfilled textures when one texture fails', async () => {
    const first = new Texture();
    const disposeFirst = vi.spyOn(first, 'dispose');
    const failure = new Error('missing coarse sand');
    const results = [
      Promise.resolve(first),
      Promise.reject(failure),
    ];
    const loader: MenuSandTextureLoader = {
      loadAsync: vi.fn(() => results.shift()!),
    };

    await expect(MenuSandAssets.load(loader)).rejects.toEqual(
      expect.objectContaining({
        name: 'MenuSandAssetLoadError',
        cause: failure,
      }),
    );
    expect(disposeFirst).toHaveBeenCalledOnce();
  });

  it('disposes each owned texture once', () => {
    const smooth = new Texture();
    const coarse = new Texture();
    const disposals = [smooth, coarse].map((texture) => (
      vi.spyOn(texture, 'dispose')
    ));
    const assets = MenuSandAssets.fromTextures(smooth, coarse);

    assets.dispose();
    assets.dispose();

    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });

  it('reports a typed load error', () => {
    expect(new MenuSandAssetLoadError('failed')).toBeInstanceOf(Error);
  });
});

describe('createMenuSeabedMaterial', () => {
  it('keeps standard lighting and blends both terrain maps by world depth', () => {
    const smooth = new Texture();
    const coarse = new Texture();
    const assets = MenuSandAssets.fromTextures(smooth, coarse);
    const material = createMenuSeabedMaterial(assets);
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <worldpos_vertex>',
      fragmentShader: '#include <common>\n#include <map_fragment>',
    };

    material.onBeforeCompile(shader as never, {} as never);

    expect(material.map).toBe(smooth);
    expect(material.roughness).toBe(1);
    expect(material.vertexColors).toBe(true);
    expect(shader.uniforms).toMatchObject({
      uMenuCoarseSand: { value: coarse },
    });
    expect(shader.vertexShader).toContain('vMenuWorldZ');
    expect(shader.fragmentShader).toContain('coarseBlend');
    expect(shader.fragmentShader).toContain('0.35');
    expect(material.customProgramCacheKey()).toBe(
      'menu-seabed-two-terrain-zones-v2',
    );
  });
});

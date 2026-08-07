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
  it('loads and configures the three color maps for repeated seabed use', async () => {
    const textures = [new Texture(), new Texture(), new Texture()];
    const loader: MenuSandTextureLoader = {
      loadAsync: vi.fn(async () => textures.shift()!),
    };

    const assets = await MenuSandAssets.load(loader);
    assets.configure(16);

    expect(loader.loadAsync).toHaveBeenCalledTimes(3);
    for (const texture of [assets.near, assets.middle, assets.far]) {
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
    const third = new Texture();
    const disposeFirst = vi.spyOn(first, 'dispose');
    const disposeThird = vi.spyOn(third, 'dispose');
    const failure = new Error('missing far sand');
    const results = [
      Promise.resolve(first),
      Promise.reject(failure),
      Promise.resolve(third),
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
    expect(disposeThird).toHaveBeenCalledOnce();
  });

  it('disposes each owned texture once', () => {
    const near = new Texture();
    const middle = new Texture();
    const far = new Texture();
    const disposals = [near, middle, far].map((texture) => (
      vi.spyOn(texture, 'dispose')
    ));
    const assets = MenuSandAssets.fromTextures(near, middle, far);

    assets.dispose();
    assets.dispose();

    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });

  it('reports a typed load error', () => {
    expect(new MenuSandAssetLoadError('failed')).toBeInstanceOf(Error);
  });
});

describe('createMenuSeabedMaterial', () => {
  it('keeps standard lighting and blends all three maps by world depth', () => {
    const near = new Texture();
    const middle = new Texture();
    const far = new Texture();
    const assets = MenuSandAssets.fromTextures(near, middle, far);
    const material = createMenuSeabedMaterial(assets);
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <worldpos_vertex>',
      fragmentShader: '#include <common>\n#include <map_fragment>',
    };

    material.onBeforeCompile(shader as never, {} as never);

    expect(material.map).toBe(near);
    expect(material.roughness).toBe(1);
    expect(material.vertexColors).toBe(true);
    expect(shader.uniforms).toMatchObject({
      uMenuMiddleSand: { value: middle },
      uMenuFarSand: { value: far },
    });
    expect(shader.vertexShader).toContain('vMenuWorldZ');
    expect(shader.fragmentShader).toContain('nearToMiddle');
    expect(shader.fragmentShader).toContain('middleToFar');
    expect(shader.fragmentShader).toContain('0.35');
    expect(material.customProgramCacheKey()).toBe(
      'menu-seabed-three-sand-zones-v1',
    );
  });
});

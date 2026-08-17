/// <reference types="vite/client" />

import {
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three';
import smoothSandUrl from '../assets/menu-sand/aerial-beach-01-diffuse.jpg';
import coarseSandUrl from '../assets/menu-sand/sandy-gravel-diffuse.jpg';

export interface MenuSandTextureLoader {
  loadAsync(url: string): Promise<Texture>;
}

export class MenuSandAssetLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MenuSandAssetLoadError';
  }
}

export class MenuSandAssets {
  private disposed = false;

  private constructor(
    readonly smooth: Texture,
    readonly coarse: Texture,
  ) {}

  static async load(
    loader: MenuSandTextureLoader = new TextureLoader(),
  ): Promise<MenuSandAssets> {
    const results = await Promise.allSettled([
      loader.loadAsync(smoothSandUrl),
      loader.loadAsync(coarseSandUrl),
    ]);
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failure) {
      for (const result of results) {
        if (result.status === 'fulfilled') result.value.dispose();
      }
      throw new MenuSandAssetLoadError('Menu sand textures could not be loaded.', {
        cause: failure.reason,
      });
    }
    if (results.some((result) => result.status !== 'fulfilled')) {
      throw new MenuSandAssetLoadError(
        'Menu sand texture preload settled without a result.',
      );
    }
    const textures = results.map((result) => (
      result as PromiseFulfilledResult<Texture>
    ).value);
    return new MenuSandAssets(textures[0]!, textures[1]!);
  }

  static fromTextures(
    smooth: Texture,
    coarse: Texture,
  ): MenuSandAssets {
    return new MenuSandAssets(smooth, coarse);
  }

  configure(maxAnisotropy: number): void {
    const anisotropy = Math.max(1, Math.min(8, Math.floor(maxAnisotropy)));
    for (const texture of [this.smooth, this.coarse]) {
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.magFilter = LinearFilter;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.anisotropy = anisotropy;
      texture.generateMipmaps = true;
      texture.colorSpace = SRGBColorSpace;
      texture.repeat.set(28, 20);
      texture.needsUpdate = true;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    new Set([this.smooth, this.coarse]).forEach((texture) => {
      texture.dispose();
    });
  }
}

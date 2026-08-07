/// <reference types="vite/client" />

import {
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three';
import middleSandUrl from '../assets/menu-sand/ground054-color.jpg';
import nearSandUrl from '../assets/menu-sand/ground055l-color.jpg';
import farSandUrl from '../assets/menu-sand/ground079s-color.jpg';

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
    readonly near: Texture,
    readonly middle: Texture,
    readonly far: Texture,
  ) {}

  static async load(
    loader: MenuSandTextureLoader = new TextureLoader(),
  ): Promise<MenuSandAssets> {
    const results = await Promise.allSettled([
      loader.loadAsync(nearSandUrl),
      loader.loadAsync(middleSandUrl),
      loader.loadAsync(farSandUrl),
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
    return new MenuSandAssets(textures[0]!, textures[1]!, textures[2]!);
  }

  static fromTextures(
    near: Texture,
    middle: Texture,
    far: Texture,
  ): MenuSandAssets {
    return new MenuSandAssets(near, middle, far);
  }

  configure(maxAnisotropy: number): void {
    const anisotropy = Math.max(1, Math.min(8, Math.floor(maxAnisotropy)));
    for (const texture of [this.near, this.middle, this.far]) {
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
    new Set([this.near, this.middle, this.far]).forEach((texture) => {
      texture.dispose();
    });
  }
}

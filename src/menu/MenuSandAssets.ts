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

  private constructor(readonly smooth: Texture) {}

  static async load(
    loader: MenuSandTextureLoader = new TextureLoader(),
  ): Promise<MenuSandAssets> {
    try {
      return new MenuSandAssets(await loader.loadAsync(smoothSandUrl));
    } catch (error) {
      throw new MenuSandAssetLoadError('Menu sand texture could not be loaded.', {
        cause: error,
      });
    }
  }

  static fromTexture(smooth: Texture): MenuSandAssets {
    return new MenuSandAssets(smooth);
  }

  configure(maxAnisotropy: number): void {
    const anisotropy = Math.max(1, Math.min(8, Math.floor(maxAnisotropy)));
    this.smooth.wrapS = RepeatWrapping;
    this.smooth.wrapT = RepeatWrapping;
    this.smooth.magFilter = LinearFilter;
    this.smooth.minFilter = LinearMipmapLinearFilter;
    this.smooth.anisotropy = anisotropy;
    this.smooth.generateMipmaps = true;
    this.smooth.colorSpace = SRGBColorSpace;
    this.smooth.repeat.set(14, 10);
    this.smooth.needsUpdate = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.smooth.dispose();
  }
}

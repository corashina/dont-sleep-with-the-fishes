/// <reference types="vite/client" />

import {
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three';
import colorUrl from '../assets/lifeboat/wood-planks-color.webp';
import normalUrl from '../assets/lifeboat/wood-planks-normal.webp';
import roughnessUrl from '../assets/lifeboat/wood-planks-roughness.webp';

export interface LifeboatTextureLoader {
  loadAsync(url: string): Promise<Texture>;
}

export class LifeboatAssetLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LifeboatAssetLoadError';
  }
}

export class LifeboatAssets {
  private disposed = false;

  private constructor(
    readonly color: Texture,
    readonly roughness: Texture,
    readonly normal: Texture,
  ) {}

  static async load(
    loader: LifeboatTextureLoader = new TextureLoader(),
  ): Promise<LifeboatAssets> {
    const results = await Promise.allSettled([
      loader.loadAsync(colorUrl),
      loader.loadAsync(roughnessUrl),
      loader.loadAsync(normalUrl),
    ]);
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failure) {
      for (const result of results) {
        if (result.status === 'fulfilled') result.value.dispose();
      }
      throw new LifeboatAssetLoadError('Lifeboat textures could not be loaded.', {
        cause: failure.reason,
      });
    }

    const [color, roughness, normal] = results;
    if (
      color.status !== 'fulfilled'
      || roughness.status !== 'fulfilled'
      || normal.status !== 'fulfilled'
    ) {
      throw new LifeboatAssetLoadError('Lifeboat texture preload settled without a result.');
    }
    return new LifeboatAssets(color.value, roughness.value, normal.value);
  }

  static fromTextures(
    color: Texture,
    roughness: Texture,
    normal: Texture,
  ): LifeboatAssets {
    return new LifeboatAssets(color, roughness, normal);
  }

  configure(maxAnisotropy: number): void {
    const anisotropy = Math.max(1, Math.floor(maxAnisotropy));
    for (const texture of [this.color, this.roughness, this.normal]) {
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.magFilter = LinearFilter;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.anisotropy = anisotropy;
      texture.generateMipmaps = true;
    }
    this.color.colorSpace = SRGBColorSpace;
    this.roughness.colorSpace = NoColorSpace;
    this.normal.colorSpace = NoColorSpace;
    this.color.needsUpdate = true;
    this.roughness.needsUpdate = true;
    this.normal.needsUpdate = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.color.dispose();
    this.roughness.dispose();
    this.normal.dispose();
  }
}

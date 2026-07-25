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
import steelColorUrl from '../assets/ship/painted-steel-color.webp';
import steelNormalUrl from '../assets/ship/painted-steel-normal.webp';
import steelRoughnessUrl from '../assets/ship/painted-steel-roughness.webp';
import woodColorUrl from '../assets/ship/deck-wood-color.webp';
import woodNormalUrl from '../assets/ship/deck-wood-normal.webp';
import woodRoughnessUrl from '../assets/ship/deck-wood-roughness.webp';

export interface ShipTextureLoader {
  loadAsync(url: string): Promise<Texture>;
}

export class ShipAssetLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ShipAssetLoadError';
  }
}

export class ShipAssets {
  private disposed = false;

  private constructor(
    readonly steelColor: Texture,
    readonly steelRoughness: Texture,
    readonly steelNormal: Texture,
    readonly woodColor: Texture,
    readonly woodRoughness: Texture,
    readonly woodNormal: Texture,
  ) {}

  static async load(loader: ShipTextureLoader = new TextureLoader()): Promise<ShipAssets> {
    const results = await Promise.allSettled([
      loader.loadAsync(steelColorUrl),
      loader.loadAsync(steelRoughnessUrl),
      loader.loadAsync(steelNormalUrl),
      loader.loadAsync(woodColorUrl),
      loader.loadAsync(woodRoughnessUrl),
      loader.loadAsync(woodNormalUrl),
    ]);
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failure) {
      for (const result of results) {
        if (result.status === 'fulfilled') result.value.dispose();
      }
      throw new ShipAssetLoadError('Ship textures could not be loaded.', {
        cause: failure.reason,
      });
    }

    if (results.some((result) => result.status !== 'fulfilled')) {
      throw new ShipAssetLoadError('Ship texture preload settled without a result.');
    }
    const textures = results.map((result) => (
      result as PromiseFulfilledResult<Texture>
    ).value);
    return new ShipAssets(
      textures[0]!,
      textures[1]!,
      textures[2]!,
      textures[3]!,
      textures[4]!,
      textures[5]!,
    );
  }

  static fromTextures(
    steelColor: Texture,
    steelRoughness: Texture,
    steelNormal: Texture,
    woodColor: Texture,
    woodRoughness: Texture,
    woodNormal: Texture,
  ): ShipAssets {
    return new ShipAssets(
      steelColor,
      steelRoughness,
      steelNormal,
      woodColor,
      woodRoughness,
      woodNormal,
    );
  }

  configure(maxAnisotropy: number): void {
    const anisotropy = Math.max(1, Math.min(8, Math.floor(maxAnisotropy)));
    const steelTextures = [this.steelColor, this.steelRoughness, this.steelNormal];
    const woodTextures = [this.woodColor, this.woodRoughness, this.woodNormal];
    for (const texture of [...steelTextures, ...woodTextures]) {
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.magFilter = LinearFilter;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.anisotropy = anisotropy;
      texture.generateMipmaps = true;
    }
    steelTextures.forEach((texture) => texture.repeat.set(3, 3));
    woodTextures.forEach((texture) => texture.repeat.set(2, 8));
    this.steelColor.colorSpace = SRGBColorSpace;
    this.woodColor.colorSpace = SRGBColorSpace;
    for (const texture of [
      this.steelRoughness,
      this.steelNormal,
      this.woodRoughness,
      this.woodNormal,
    ]) {
      texture.colorSpace = NoColorSpace;
    }
    for (const texture of [...steelTextures, ...woodTextures]) {
      texture.needsUpdate = true;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const texture of [
      this.steelColor,
      this.steelRoughness,
      this.steelNormal,
      this.woodColor,
      this.woodRoughness,
      this.woodNormal,
    ]) {
      texture.dispose();
    }
  }
}

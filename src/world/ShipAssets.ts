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
import darkWoodColorUrl from '../assets/ship/dark-wood-color.webp';
import darkWoodNormalUrl from '../assets/ship/dark-wood-normal.webp';
import darkWoodRoughnessUrl from '../assets/ship/dark-wood-roughness.webp';
import roomWallColorUrl from '../assets/ship/room-painted-wood-color.webp';
import roomWallNormalUrl from '../assets/ship/room-painted-wood-normal.webp';
import roomWallRoughnessUrl from '../assets/ship/room-painted-wood-roughness.webp';

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
    readonly darkWoodColor: Texture,
    readonly darkWoodRoughness: Texture,
    readonly darkWoodNormal: Texture,
    readonly roomWallColor: Texture,
    readonly roomWallRoughness: Texture,
    readonly roomWallNormal: Texture,
  ) {}

  static async load(loader: ShipTextureLoader = new TextureLoader()): Promise<ShipAssets> {
    const results = await Promise.allSettled([
      loader.loadAsync(darkWoodColorUrl),
      loader.loadAsync(darkWoodRoughnessUrl),
      loader.loadAsync(darkWoodNormalUrl),
      loader.loadAsync(roomWallColorUrl),
      loader.loadAsync(roomWallRoughnessUrl),
      loader.loadAsync(roomWallNormalUrl),
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
    darkWoodColor: Texture,
    darkWoodRoughness: Texture,
    darkWoodNormal: Texture,
    roomWallColor = new Texture(),
    roomWallRoughness = new Texture(),
    roomWallNormal = new Texture(),
  ): ShipAssets {
    return new ShipAssets(
      darkWoodColor,
      darkWoodRoughness,
      darkWoodNormal,
      roomWallColor,
      roomWallRoughness,
      roomWallNormal,
    );
  }

  configure(maxAnisotropy: number): void {
    const anisotropy = Math.max(1, Math.min(8, Math.floor(maxAnisotropy)));
    this.configureTextureSet(
      [this.darkWoodColor, this.darkWoodRoughness, this.darkWoodNormal],
      this.darkWoodColor,
      anisotropy,
      [0.5, 0.5],
    );
    this.configureTextureSet(
      [
        this.roomWallColor,
        this.roomWallRoughness,
        this.roomWallNormal,
      ],
      this.roomWallColor,
      anisotropy,
      [0.5, 0.5],
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const textures = new Set([
      this.darkWoodColor,
      this.darkWoodRoughness,
      this.darkWoodNormal,
      this.roomWallColor,
      this.roomWallRoughness,
      this.roomWallNormal,
    ]);
    textures.forEach((texture) => texture.dispose());
  }

  private configureTextureSet(
    textures: readonly Texture[],
    colorTexture: Texture,
    anisotropy: number,
    repeat: readonly [number, number],
  ): void {
    for (const texture of textures) {
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.magFilter = LinearFilter;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.anisotropy = anisotropy;
      texture.generateMipmaps = true;
      texture.repeat.set(...repeat);
      texture.colorSpace = texture === colorTexture ? SRGBColorSpace : NoColorSpace;
      texture.needsUpdate = true;
    }
  }
}

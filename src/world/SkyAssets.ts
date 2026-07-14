import {
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three';
import moonTextureUrl from '../assets/sky/moon-gibbous.png';

export interface SkyTextureLoader {
  loadAsync(url: string): Promise<Texture>;
}

export class SkyAssetLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SkyAssetLoadError';
  }
}

export class SkyAssets {
  private disposed = false;

  private constructor(readonly moonTexture: Texture) {}

  static async load(
    loader: SkyTextureLoader = new TextureLoader(),
  ): Promise<SkyAssets> {
    let moonTexture: Texture;
    try {
      moonTexture = await loader.loadAsync(moonTextureUrl);
    } catch (cause) {
      throw new SkyAssetLoadError('Moon texture could not be loaded.', { cause });
    }

    moonTexture.wrapS = ClampToEdgeWrapping;
    moonTexture.wrapT = ClampToEdgeWrapping;
    moonTexture.magFilter = LinearFilter;
    moonTexture.minFilter = LinearMipmapLinearFilter;
    moonTexture.generateMipmaps = true;
    moonTexture.colorSpace = SRGBColorSpace;
    moonTexture.needsUpdate = true;
    return new SkyAssets(moonTexture);
  }

  static fromTexture(texture: Texture): SkyAssets {
    return new SkyAssets(texture);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.moonTexture.dispose();
  }
}

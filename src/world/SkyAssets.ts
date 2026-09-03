import {
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three';
import moonTextureUrl from '../assets/sky/moon-gibbous.png';
import moonFaceTextureUrl from '../assets/sky/moon-face-horror.png';

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

  private constructor(
    readonly moonTexture: Texture,
    readonly moonFaceTexture: Texture,
  ) {}

  static async load(
    loader: SkyTextureLoader = new TextureLoader(),
  ): Promise<SkyAssets> {
    let moonTexture: Texture;
    let moonFaceTexture: Texture;
    try {
      [moonTexture, moonFaceTexture] = await Promise.all([
        loader.loadAsync(moonTextureUrl),
        loader.loadAsync(moonFaceTextureUrl),
      ]);
    } catch (cause) {
      throw new SkyAssetLoadError('Sky textures could not be loaded.', { cause });
    }

    for (const texture of [moonTexture, moonFaceTexture]) {
      texture.wrapS = ClampToEdgeWrapping;
      texture.wrapT = ClampToEdgeWrapping;
      texture.magFilter = LinearFilter;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
    }
    return new SkyAssets(moonTexture, moonFaceTexture);
  }

  static fromTextures(moonTexture: Texture, moonFaceTexture: Texture): SkyAssets {
    return new SkyAssets(moonTexture, moonFaceTexture);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.moonTexture.dispose();
    this.moonFaceTexture.dispose();
  }
}

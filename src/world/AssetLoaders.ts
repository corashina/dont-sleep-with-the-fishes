import { TextureLoader, type Texture } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { loadAssetBytes } from '../app/AssetDownloads';

export class AssetModelLoader {
  private readonly loader = new GLTFLoader();

  async loadAsync(url: string): Promise<GLTF> {
    const bytes = await loadAssetBytes(url);
    return this.loader.parseAsync(bytes, url.slice(0, url.lastIndexOf('/') + 1));
  }
}

export class AssetTextureLoader {
  private readonly loader = new TextureLoader();

  async loadAsync(url: string): Promise<Texture> {
    const bytes = await loadAssetBytes(url);
    const objectUrl = URL.createObjectURL(new Blob([bytes]));
    try {
      return await this.loader.loadAsync(objectUrl);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

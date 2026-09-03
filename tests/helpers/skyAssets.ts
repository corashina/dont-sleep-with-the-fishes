import { Texture } from 'three';
import { SkyAssets } from '../../src/world/SkyAssets';

export function createTestMoonTexture(): Texture {
  return new Texture();
}

export function createTestMoonFaceTexture(): Texture {
  return new Texture();
}

export function createTestSkyTextures(): readonly [Texture, Texture] {
  return [createTestMoonTexture(), createTestMoonFaceTexture()];
}

export function createTestSkyAssets(): SkyAssets {
  return SkyAssets.fromTextures(...createTestSkyTextures());
}

import { Texture } from 'three';
import { SkyAssets } from '../../src/world/SkyAssets';

export function createTestMoonTexture(): Texture {
  return new Texture();
}

export function createTestSkyTextures(): readonly [Texture] {
  return [createTestMoonTexture()];
}

export function createTestSkyAssets(): SkyAssets {
  return SkyAssets.fromTexture(...createTestSkyTextures());
}

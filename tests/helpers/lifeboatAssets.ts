import { Texture } from 'three';
import { LifeboatAssets } from '../../src/world/LifeboatAssets';

export function createTestLifeboatAssets(): LifeboatAssets {
  return LifeboatAssets.fromTextures(
    new Texture(),
    new Texture(),
    new Texture(),
  );
}

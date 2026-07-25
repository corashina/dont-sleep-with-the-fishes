import { Texture } from 'three';
import { ShipAssets } from '../../src/world/ShipAssets';

export function createTestShipAssets(): ShipAssets {
  return ShipAssets.fromTextures(
    new Texture(),
    new Texture(),
    new Texture(),
    new Texture(),
    new Texture(),
    new Texture(),
  );
}

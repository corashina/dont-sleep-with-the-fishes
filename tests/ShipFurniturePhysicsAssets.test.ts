import { describe, expect, it } from 'vitest';
import {
  SHIP_FURNITURE_MODEL_IDS,
  SHIP_FURNITURE_MODEL_SPECS,
} from '../src/world/shipFurnitureManifest';

describe('physics obstacle ship assets', () => {
  it('pins the five new normalized models', () => {
    expect(SHIP_FURNITURE_MODEL_IDS).toEqual(expect.arrayContaining([
      'pumpkin',
      'propaneTank',
      'redCan',
      'shippingBox',
      'package',
    ]));
    expect(SHIP_FURNITURE_MODEL_SPECS.pumpkin.canonicalSize)
      .toEqual([1.286651, 0.8, 1.299593]);
    expect(SHIP_FURNITURE_MODEL_SPECS.propaneTank.canonicalSize)
      .toEqual([1.267333, 1.7, 1.205301]);
    expect(SHIP_FURNITURE_MODEL_SPECS.redCan.canonicalSize)
      .toEqual([1.187991, 1.6, 1.187991]);
    expect(SHIP_FURNITURE_MODEL_SPECS.shippingBox.canonicalSize)
      .toEqual([1.15, 1.15, 1.15]);
    expect(SHIP_FURNITURE_MODEL_SPECS.package.canonicalSize)
      .toEqual([1.260585, 1.05, 1.246763]);
  });
});

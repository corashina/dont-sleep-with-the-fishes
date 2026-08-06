import { expect, it } from 'vitest';
import {
  ITEM_AMBIENT_OCCLUSION_DEFAULT_RADIUS,
  ITEM_AMBIENT_OCCLUSION_GTAO_SETTINGS,
  ITEM_AMBIENT_OCCLUSION_QUALITY,
} from '../src/rendering/ItemAmbientOcclusion';

it('uses short strong contact occlusion with quality-only sampling changes', () => {
  expect(ITEM_AMBIENT_OCCLUSION_DEFAULT_RADIUS).toBe(0.28);
  expect(ITEM_AMBIENT_OCCLUSION_GTAO_SETTINGS).toMatchObject({
    radius: 0.28,
    distanceExponent: 1.6,
    thickness: 0.75,
    distanceFallOff: 0.72,
    scale: 1,
    screenSpaceRadius: true,
  });
  expect(ITEM_AMBIENT_OCCLUSION_QUALITY.low.resolutionScale)
    .toBeLessThan(ITEM_AMBIENT_OCCLUSION_QUALITY.high.resolutionScale);
  expect(ITEM_AMBIENT_OCCLUSION_QUALITY.low.gtaoSamples)
    .toBeLessThan(ITEM_AMBIENT_OCCLUSION_QUALITY.high.gtaoSamples);
});

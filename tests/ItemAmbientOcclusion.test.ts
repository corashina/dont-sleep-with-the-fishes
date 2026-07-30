import { describe, expect, it } from 'vitest';
import { ITEM_AMBIENT_OCCLUSION_QUALITY } from '../src/rendering/ItemAmbientOcclusion';

describe('item ambient occlusion quality', () => {
  it('uses the approved low-cost desktop preset', () => {
    expect(ITEM_AMBIENT_OCCLUSION_QUALITY.low).toEqual({
      resolutionScale: 0.4,
      gtaoSamples: 6,
      denoiseRings: 1,
      denoiseSamples: 4,
    });
  });

  it('keeps the high preset unchanged', () => {
    expect(ITEM_AMBIENT_OCCLUSION_QUALITY.high).toEqual({
      resolutionScale: 1,
      gtaoSamples: 16,
      denoiseRings: 2,
      denoiseSamples: 16,
    });
  });
});

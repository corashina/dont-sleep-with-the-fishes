import { describe, expect, it } from 'vitest';
import { GLOBAL_POST_PROCESSING_PROFILE } from '../src/rendering/postProcessingProfiles';

describe('global post-processing profile', () => {
  it('keeps posterization fine enough to preserve sky, water, and deck gradients', () => {
    expect(GLOBAL_POST_PROCESSING_PROFILE.posterizationLevels)
      .toBeGreaterThanOrEqual(32);
    expect(GLOBAL_POST_PROCESSING_PROFILE.posterizationLevels)
      .toBeLessThanOrEqual(48);
  });

  it('keeps deep shadows readable without flattening the full image', () => {
    expect(GLOBAL_POST_PROCESSING_PROFILE.shadowLift).toBeGreaterThanOrEqual(0.045);
    expect(GLOBAL_POST_PROCESSING_PROFILE.shadowLift).toBeLessThanOrEqual(0.065);
    expect(GLOBAL_POST_PROCESSING_PROFILE.contrast).toBeLessThanOrEqual(1.1);
    expect(GLOBAL_POST_PROCESSING_PROFILE.shadowTintStrength).toBeLessThanOrEqual(0.04);
  });

  it('contains no scene identity, grain, vignette, or edge-mask settings', () => {
    expect(GLOBAL_POST_PROCESSING_PROFILE).not.toHaveProperty('id');
    expect(GLOBAL_POST_PROCESSING_PROFILE).not.toHaveProperty('grainStrength');
    expect(GLOBAL_POST_PROCESSING_PROFILE).not.toHaveProperty('vignetteStrength');
    expect(GLOBAL_POST_PROCESSING_PROFILE).not.toHaveProperty('inkFrameStrength');
  });
});

import { describe, expect, it } from 'vitest';
import { GLOBAL_POST_PROCESSING_PROFILE } from '../src/rendering/postProcessingProfiles';

describe('global post-processing profile', () => {
  it('keeps posterization fine enough to preserve sky, water, and deck gradients', () => {
    expect(GLOBAL_POST_PROCESSING_PROFILE.posterizationLevels)
      .toBeGreaterThanOrEqual(32);
    expect(GLOBAL_POST_PROCESSING_PROFILE.posterizationLevels)
      .toBeLessThanOrEqual(48);
  });

  it('lifts dark detail without turning the grade into a flat wash', () => {
    expect(GLOBAL_POST_PROCESSING_PROFILE.shadowLift).toBeGreaterThanOrEqual(0.018);
    expect(GLOBAL_POST_PROCESSING_PROFILE.shadowLift).toBeLessThanOrEqual(0.05);
  });

  it('contains no scene identity, grain, or vignette settings', () => {
    expect(GLOBAL_POST_PROCESSING_PROFILE).not.toHaveProperty('id');
    expect(GLOBAL_POST_PROCESSING_PROFILE).not.toHaveProperty('grainStrength');
    expect(GLOBAL_POST_PROCESSING_PROFILE).not.toHaveProperty('vignetteStrength');
  });
});

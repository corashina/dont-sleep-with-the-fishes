import { describe, expect, it } from 'vitest';
import { postProcessingProfilesForTest } from '../src/rendering/postProcessingProfiles';

describe('post-processing profiles', () => {
  it('keeps posterization fine enough to preserve sky, water, and deck gradients', () => {
    for (const profile of postProcessingProfilesForTest()) {
      expect(profile.posterizationLevels).toBeGreaterThanOrEqual(32);
      expect(profile.posterizationLevels).toBeLessThanOrEqual(48);
    }
  });

  it('lifts dark detail without turning the grade into a flat wash', () => {
    for (const profile of postProcessingProfilesForTest()) {
      expect(profile.shadowLift).toBeGreaterThanOrEqual(0.018);
      expect(profile.shadowLift).toBeLessThanOrEqual(0.05);
    }
  });
});

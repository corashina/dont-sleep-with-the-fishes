import { describe, expect, it } from 'vitest';
import type { SceneVisualState } from '../src/rendering/SceneRenderer';
import {
  clampPostProcessingValue,
  resolveGrainTime,
  resolveVignetteStrength,
  selectPostProcessingProfile,
} from '../src/rendering/postProcessingProfiles';

function survival(
  phase: 'day' | 'night',
  weather: 'calm' | 'overcast' | 'squall',
): SceneVisualState {
  return {
    kind: 'survival',
    elapsedSeconds: 12.75,
    phase,
    weather,
    reducedMotion: false,
  };
}

describe('post-processing profiles', () => {
  it('clamps sinking progress before increasing only vignette strength', () => {
    const base = selectPostProcessingProfile({
      kind: 'scavenge', elapsedSeconds: 0, sinkingProgress: 0, reducedMotion: false,
    });
    expect(resolveVignetteStrength({
      kind: 'scavenge', elapsedSeconds: 0, sinkingProgress: -5, reducedMotion: false,
    }, base)).toBe(base.vignetteStrength);
    expect(resolveVignetteStrength({
      kind: 'scavenge', elapsedSeconds: 0, sinkingProgress: 2, reducedMotion: false,
    }, base)).toBeCloseTo(base.vignetteStrength + 0.08);
    expect(resolveVignetteStrength({
      kind: 'scavenge', elapsedSeconds: 0, sinkingProgress: Number.NaN, reducedMotion: false,
    }, base)).toBe(base.vignetteStrength);
  });

  it('quantizes animated grain and freezes reduced-motion grain at zero', () => {
    expect(resolveGrainTime({
      kind: 'survival', elapsedSeconds: 1.24, phase: 'day', weather: 'calm', reducedMotion: false,
    })).toBe(1.125);
    expect(resolveGrainTime({
      kind: 'survival', elapsedSeconds: 99, phase: 'night', weather: 'squall', reducedMotion: true,
    })).toBe(0);
    expect(resolveGrainTime({
      kind: 'scavenge', elapsedSeconds: Number.POSITIVE_INFINITY,
      sinkingProgress: 0, reducedMotion: false,
    })).toBe(0);
  });

  it('lifts night shadows more than the calm day profile', () => {
    expect(selectPostProcessingProfile(survival('night', 'calm')).shadowLift)
      .toBeGreaterThan(selectPostProcessingProfile(survival('day', 'calm')).shadowLift);
  });

  it('keeps survival posterization and ink frame inside approved bounds', () => {
    const profile = selectPostProcessingProfile(survival('day', 'calm'));

    expect(profile.posterizationLevels).toBeGreaterThanOrEqual(6);
    expect(profile.posterizationLevels).toBeLessThanOrEqual(12);
    expect(profile.inkFrameStrength).toBeGreaterThanOrEqual(0.55);
    expect(profile.inkFrameStrength).toBeLessThanOrEqual(0.9);
  });

  it.each([
    ['day', 'calm', 10, 0.72],
    ['day', 'overcast', 9, 0.76],
    ['day', 'squall', 8, 0.82],
    ['night', 'calm', 8, 0.78],
    ['night', 'overcast', 7, 0.82],
    ['night', 'squall', 6, 0.88],
  ] as const)(
    'selects the authored %s %s print treatment',
    (phase, weather, posterizationLevels, inkFrameStrength) => {
      expect(selectPostProcessingProfile(survival(phase, weather))).toMatchObject({
        posterizationLevels,
        inkFrameStrength,
      });
    },
  );

  it('uses the restrained scavenge print treatment', () => {
    expect(selectPostProcessingProfile({
      kind: 'scavenge', elapsedSeconds: 0, sinkingProgress: 0, reducedMotion: false,
    })).toMatchObject({
      posterizationLevels: 12,
      inkFrameStrength: 0.42,
    });
  });

  it('clamps finite and non-finite shader values to documented bounds', () => {
    expect(clampPostProcessingValue(-2, 0, 1, 0.5)).toBe(0);
    expect(clampPostProcessingValue(2, 0, 1, 0.5)).toBe(1);
    expect(clampPostProcessingValue(Number.NaN, 0, 1, 0.5)).toBe(0.5);
  });
});

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
  it.each([
    [{ kind: 'scavenge', elapsedSeconds: 4, sinkingProgress: 0, reducedMotion: false }, 'scavenge'],
    [survival('day', 'calm'), 'survival-day-calm'],
    [survival('day', 'overcast'), 'survival-day-overcast'],
    [survival('day', 'squall'), 'survival-day-squall'],
    [survival('night', 'calm'), 'survival-night-calm'],
    [survival('night', 'overcast'), 'survival-night-overcast'],
    [survival('night', 'squall'), 'survival-night-squall'],
  ] as const)('selects %s as %s', (state, id) => {
    const profile = selectPostProcessingProfile(state);
    expect(profile.id).toBe(id);
    expect(Object.isFrozen(profile)).toBe(true);
    expect(profile.halftoneSizeCssPixels).toBeGreaterThanOrEqual(4);
    expect(profile.chromaticAberrationCssPixels).toBeLessThan(1);
  });

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

  it('clamps finite and non-finite shader values to documented bounds', () => {
    expect(clampPostProcessingValue(-2, 0, 1, 0.5)).toBe(0);
    expect(clampPostProcessingValue(2, 0, 1, 0.5)).toBe(1);
    expect(clampPostProcessingValue(Number.NaN, 0, 1, 0.5)).toBe(0.5);
  });
});

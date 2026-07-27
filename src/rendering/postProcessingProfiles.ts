import type { SceneVisualState } from './SceneRenderer';

export type PostProcessingProfileId =
  | 'scavenge'
  | 'survival-day-calm'
  | 'survival-day-overcast'
  | 'survival-day-squall'
  | 'survival-night-calm'
  | 'survival-night-overcast'
  | 'survival-night-squall';

export interface PostProcessingProfile {
  id: PostProcessingProfileId;
  contrast: number;
  saturation: number;
  highlightCompression: number;
  shadowLift: number;
  shadowTint: number;
  shadowTintStrength: number;
  highlightTint: number;
  highlightTintStrength: number;
  posterizationLevels: number;
  inkFrameStrength: number;
  halftoneStrength: number;
  halftoneSizeCssPixels: number;
  vignetteStrength: number;
  grainStrength: number;
}

function profile(value: PostProcessingProfile): Readonly<PostProcessingProfile> {
  return Object.freeze(value);
}

const PROFILES = {
  scavenge: profile({
    id: 'scavenge', contrast: 1.12, saturation: 1.10, highlightCompression: 0.16,
    shadowLift: 0.02,
    shadowTint: 0x123039, shadowTintStrength: 0.06,
    highlightTint: 0xd8aa6d, highlightTintStrength: 0.035,
    posterizationLevels: 48, inkFrameStrength: 0.42,
    halftoneStrength: 0.075, halftoneSizeCssPixels: 4.5,
    vignetteStrength: 0.22, grainStrength: 0.022,
  }),
  'survival-day-calm': profile({
    id: 'survival-day-calm', contrast: 1.10, saturation: 1.08, highlightCompression: 0.14,
    shadowLift: 0.018,
    shadowTint: 0x18343a, shadowTintStrength: 0.04,
    highlightTint: 0xe0b879, highlightTintStrength: 0.045,
    posterizationLevels: 48, inkFrameStrength: 0.72,
    halftoneStrength: 0.055, halftoneSizeCssPixels: 5,
    vignetteStrength: 0.18, grainStrength: 0.018,
  }),
  'survival-day-overcast': profile({
    id: 'survival-day-overcast', contrast: 1.11, saturation: 1.06, highlightCompression: 0.15,
    shadowLift: 0.022,
    shadowTint: 0x17343c, shadowTintStrength: 0.065,
    highlightTint: 0xc8ad7c, highlightTintStrength: 0.03,
    posterizationLevels: 44, inkFrameStrength: 0.76,
    halftoneStrength: 0.06, halftoneSizeCssPixels: 5,
    vignetteStrength: 0.21, grainStrength: 0.023,
  }),
  'survival-day-squall': profile({
    id: 'survival-day-squall', contrast: 1.14, saturation: 1.04, highlightCompression: 0.18,
    shadowLift: 0.025,
    shadowTint: 0x0d2832, shadowTintStrength: 0.10,
    highlightTint: 0xb39c77, highlightTintStrength: 0.02,
    posterizationLevels: 40, inkFrameStrength: 0.82,
    halftoneStrength: 0.045, halftoneSizeCssPixels: 5.5,
    vignetteStrength: 0.29, grainStrength: 0.035,
  }),
  'survival-night-calm': profile({
    id: 'survival-night-calm', contrast: 1.08, saturation: 1.06, highlightCompression: 0.1,
    shadowLift: 0.032,
    shadowTint: 0x153442, shadowTintStrength: 0.08,
    highlightTint: 0xb9a477, highlightTintStrength: 0.025,
    posterizationLevels: 40, inkFrameStrength: 0.78,
    halftoneStrength: 0.035, halftoneSizeCssPixels: 5.5,
    vignetteStrength: 0.24, grainStrength: 0.024,
  }),
  'survival-night-overcast': profile({
    id: 'survival-night-overcast', contrast: 1.10, saturation: 1.04, highlightCompression: 0.11,
    shadowLift: 0.038,
    shadowTint: 0x102e3b, shadowTintStrength: 0.10,
    highlightTint: 0xa89777, highlightTintStrength: 0.018,
    posterizationLevels: 38, inkFrameStrength: 0.82,
    halftoneStrength: 0.03, halftoneSizeCssPixels: 5.5,
    vignetteStrength: 0.27, grainStrength: 0.029,
  }),
  'survival-night-squall': profile({
    id: 'survival-night-squall', contrast: 1.12, saturation: 1.02, highlightCompression: 0.13,
    shadowLift: 0.045,
    shadowTint: 0x0b2531, shadowTintStrength: 0.12,
    highlightTint: 0x97886f, highlightTintStrength: 0.012,
    posterizationLevels: 36, inkFrameStrength: 0.88,
    halftoneStrength: 0.025, halftoneSizeCssPixels: 6,
    vignetteStrength: 0.31, grainStrength: 0.04,
  }),
} as const;

export function postProcessingProfilesForTest():
readonly Readonly<PostProcessingProfile>[] {
  return Object.values(PROFILES);
}

const SURVIVAL_PROFILES = {
  day: {
    calm: PROFILES['survival-day-calm'],
    overcast: PROFILES['survival-day-overcast'],
    squall: PROFILES['survival-day-squall'],
  },
  night: {
    calm: PROFILES['survival-night-calm'],
    overcast: PROFILES['survival-night-overcast'],
    squall: PROFILES['survival-night-squall'],
  },
} as const;

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function clampPostProcessingValue(
  value: number,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, finiteOrZero(value)));
}

export function selectPostProcessingProfile(
  state: Readonly<SceneVisualState>,
): Readonly<PostProcessingProfile> {
  if (state.kind === 'scavenge') return PROFILES.scavenge;
  return SURVIVAL_PROFILES[state.phase][state.weather];
}

export function resolveVignetteStrength(
  state: Readonly<SceneVisualState>,
  base: Readonly<PostProcessingProfile>,
): number {
  return clampPostProcessingValue(
    base.vignetteStrength
      + (state.kind === 'scavenge' ? clamp01(state.sinkingProgress) * 0.08 : 0),
    0,
    0.5,
    0.2,
  );
}

export function resolveGrainTime(state: Readonly<SceneVisualState>): number {
  const seconds = clampPostProcessingValue(state.elapsedSeconds, 0, 86_400, 0);
  return Math.floor(seconds * 8) / 8;
}

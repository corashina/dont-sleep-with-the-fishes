export interface PostProcessingProfile {
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
}

export const GLOBAL_POST_PROCESSING_PROFILE =
  Object.freeze<PostProcessingProfile>({
    contrast: 1.12,
    saturation: 1.10,
    highlightCompression: 0.16,
    shadowLift: 0.02,
    shadowTint: 0x123039,
    shadowTintStrength: 0.06,
    highlightTint: 0xd8aa6d,
    highlightTintStrength: 0.035,
    posterizationLevels: 48,
    inkFrameStrength: 0.42,
    halftoneStrength: 0.075,
    halftoneSizeCssPixels: 4.5,
  });

export function clampPostProcessingValue(
  value: number,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

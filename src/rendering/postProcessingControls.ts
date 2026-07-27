import type { ItemAmbientOcclusionMode } from './ItemAmbientOcclusion';

export type PostProcessingNumericSetting =
  | 'contrast'
  | 'saturation'
  | 'highlightCompression'
  | 'shadowLift'
  | 'shadowTintStrength'
  | 'highlightTintStrength'
  | 'posterizationLevels'
  | 'halftoneStrength'
  | 'ambientOcclusionIntensity'
  | 'ambientOcclusionRadius';

export interface PostProcessingControlState {
  gradeEnabled: boolean;
  ambientOcclusionAvailable: boolean;
  ambientOcclusionMode: ItemAmbientOcclusionMode;
  contrast: number;
  saturation: number;
  highlightCompression: number;
  shadowLift: number;
  shadowTintStrength: number;
  highlightTintStrength: number;
  posterizationLevels: number;
  halftoneStrength: number;
  ambientOcclusionIntensity: number;
  ambientOcclusionRadius: number;
}

export interface PostProcessingControls {
  getState(): Readonly<PostProcessingControlState>;
  setGradeEnabled(enabled: boolean): void;
  setAmbientOcclusionMode(mode: ItemAmbientOcclusionMode): void;
  setNumeric(setting: PostProcessingNumericSetting, value: number): void;
}

export interface PostProcessingSliderDefinition {
  key: PostProcessingNumericSetting;
  label: string;
  group: 'grade' | 'ambient-occlusion';
  minimum: number;
  maximum: number;
  step: number;
  digits: number;
}

export const POST_PROCESSING_SLIDERS =
  Object.freeze<readonly Readonly<PostProcessingSliderDefinition>[]>([
    { key: 'contrast', label: 'Contrast', group: 'grade', minimum: 0.8, maximum: 1.2, step: 0.01, digits: 2 },
    { key: 'saturation', label: 'Saturation', group: 'grade', minimum: 0.7, maximum: 1.2, step: 0.01, digits: 2 },
    { key: 'highlightCompression', label: 'Highlight compression', group: 'grade', minimum: 0, maximum: 0.3, step: 0.01, digits: 2 },
    { key: 'shadowLift', label: 'Shadow detail', group: 'grade', minimum: 0, maximum: 0.6, step: 0.01, digits: 2 },
    { key: 'shadowTintStrength', label: 'Shadow tint', group: 'grade', minimum: 0, maximum: 0.25, step: 0.005, digits: 3 },
    { key: 'highlightTintStrength', label: 'Highlight tint', group: 'grade', minimum: 0, maximum: 0.25, step: 0.005, digits: 3 },
    { key: 'posterizationLevels', label: 'Color levels', group: 'grade', minimum: 32, maximum: 64, step: 1, digits: 0 },
    { key: 'halftoneStrength', label: 'Halftone', group: 'grade', minimum: 0, maximum: 0.15, step: 0.005, digits: 3 },
    { key: 'ambientOcclusionIntensity', label: 'AO intensity', group: 'ambient-occlusion', minimum: 0, maximum: 1, step: 0.05, digits: 2 },
    { key: 'ambientOcclusionRadius', label: 'AO radius', group: 'ambient-occlusion', minimum: 0.05, maximum: 0.5, step: 0.01, digits: 2 },
  ]);

const SLIDER_BY_KEY = new Map(
  POST_PROCESSING_SLIDERS.map((definition) => [definition.key, definition]),
);

export function clampPostProcessingSetting(
  setting: PostProcessingNumericSetting,
  value: number,
): number {
  const definition = SLIDER_BY_KEY.get(setting);
  if (definition === undefined || !Number.isFinite(value)) {
    return definition?.minimum ?? 0;
  }
  return Math.min(definition.maximum, Math.max(definition.minimum, value));
}

export function formatPostProcessingValue(
  setting: PostProcessingNumericSetting,
  value: number,
): string {
  const digits = SLIDER_BY_KEY.get(setting)?.digits ?? 2;
  return value.toFixed(digits);
}

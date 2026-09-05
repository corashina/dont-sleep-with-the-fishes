import { settingsText } from '../i18n/settingsMessages';
import type { ItemAmbientOcclusionMode } from './ItemAmbientOcclusion';

export type PostProcessingNumericSetting =
  | 'ambientOcclusionIntensity'
  | 'ambientOcclusionRadius';

export type AmbientOcclusionQuality = 'low' | 'high';

export interface PostProcessingControlState {
  ambientOcclusionAvailable: boolean;
  ambientOcclusionMode: ItemAmbientOcclusionMode;
  ambientOcclusionQuality: AmbientOcclusionQuality;
  ambientOcclusionIntensity: number;
  ambientOcclusionRadius: number;
}

export interface PostProcessingControls {
  getState(): Readonly<PostProcessingControlState>;
  setAmbientOcclusionMode(mode: ItemAmbientOcclusionMode): void;
  setAmbientOcclusionQuality(quality: AmbientOcclusionQuality): void;
  setNumeric(setting: PostProcessingNumericSetting, value: number): void;
}

export interface PostProcessingSliderDefinition {
  key: PostProcessingNumericSetting;
  label: string;
  minimum: number;
  maximum: number;
  step: number;
  digits: number;
}

export const POST_PROCESSING_SLIDERS =
  Object.freeze<readonly Readonly<PostProcessingSliderDefinition>[]>([
    { key: 'ambientOcclusionIntensity', get label() { return settingsText('aoIntensity'); }, minimum: 0, maximum: 1, step: 0.05, digits: 2 },
    { key: 'ambientOcclusionRadius', get label() { return settingsText('aoRadius'); }, minimum: 0.05, maximum: 0.5, step: 0.01, digits: 2 },
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

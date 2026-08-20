import {
  browserStorage,
  createStoredPreference,
  type PreferenceStorage,
  type StoredPreference,
} from '../browser/storage';

export type VisualQuality = 'low' | 'medium' | 'high';

export const DEFAULT_VISUAL_QUALITY: VisualQuality = 'low';
export const VISUAL_QUALITY_STORAGE_KEY =
  'dont-sleep-with-the-fishes.visual-quality';

export interface VisualQualityPreference extends StoredPreference<VisualQuality> {}

export function parseVisualQuality(value: unknown): VisualQuality {
  return value === 'medium' || value === 'high'
    ? value
    : DEFAULT_VISUAL_QUALITY;
}

export function createVisualQualityPreference(
  apply: (value: VisualQuality) => void = () => undefined,
  storage: PreferenceStorage | null = browserStorage(),
): VisualQualityPreference {
  return createStoredPreference(
    DEFAULT_VISUAL_QUALITY,
    VISUAL_QUALITY_STORAGE_KEY,
    parseVisualQuality,
    apply,
    storage,
  );
}

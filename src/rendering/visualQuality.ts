import {
  browserStorage,
  createStoredPreference,
  type PreferenceStorage,
  type StoredPreference,
} from '../browser/storage';
import { prefersTouchControls } from '../browser/deviceCapabilities';

export type VisualQuality = 'low' | 'high';

export const DEFAULT_VISUAL_QUALITY: VisualQuality = 'high';
export const VISUAL_QUALITY_STORAGE_KEY =
  'dont-sleep-with-the-fishes.visual-quality';

export interface VisualQualityPreference extends StoredPreference<VisualQuality> {}

export function parseVisualQuality(value: unknown, fallback = DEFAULT_VISUAL_QUALITY): VisualQuality {
  return value === 'low' || value === 'high'
    ? value
    : fallback;
}

export function createVisualQualityPreference(
  apply: (value: VisualQuality) => void = () => undefined,
  storage: PreferenceStorage | null = browserStorage(),
): VisualQualityPreference {
  const initial: VisualQuality = prefersTouchControls() ? 'low' : DEFAULT_VISUAL_QUALITY;
  return createStoredPreference(
    initial,
    VISUAL_QUALITY_STORAGE_KEY,
    (value) => parseVisualQuality(value, initial),
    apply,
    storage,
  );
}

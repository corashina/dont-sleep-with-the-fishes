import {
  browserStorage,
  createStoredPreference,
  type PreferenceStorage,
  type StoredPreference,
} from '../browser/storage';
import { prefersTouchControls } from '../browser/deviceCapabilities';

export type WaterQuality = 'low' | 'high';

export const DEFAULT_WATER_QUALITY: WaterQuality = 'high';
export const WATER_QUALITY_STORAGE_KEY =
  'dont-sleep-with-the-fishes.water-quality';

export interface WaterQualityPreference extends StoredPreference<WaterQuality> {}

export function parseWaterQuality(value: unknown, fallback = DEFAULT_WATER_QUALITY): WaterQuality {
  return value === 'low' || value === 'high'
    ? value
    : fallback;
}

export function createWaterQualityPreference(
  apply: (value: WaterQuality) => void = () => undefined,
  storage: PreferenceStorage | null = browserStorage(),
): WaterQualityPreference {
  const initial: WaterQuality = prefersTouchControls() ? 'low' : DEFAULT_WATER_QUALITY;
  return createStoredPreference(
    initial,
    WATER_QUALITY_STORAGE_KEY,
    (value) => parseWaterQuality(value, initial),
    apply,
    storage,
  );
}

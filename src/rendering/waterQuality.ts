import {
  browserStorage,
  createStoredPreference,
  type PreferenceStorage,
  type StoredPreference,
} from '../browser/storage';

export type WaterQuality = 'low' | 'high' | 'ultra';

export const DEFAULT_WATER_QUALITY: WaterQuality = 'low';
export const WATER_QUALITY_STORAGE_KEY =
  'dont-sleep-with-the-fishes.water-quality';

export interface WaterQualityPreference extends StoredPreference<WaterQuality> {}

export function parseWaterQuality(value: unknown): WaterQuality {
  return value === 'low' || value === 'high' || value === 'ultra'
    ? value
    : DEFAULT_WATER_QUALITY;
}

export function createWaterQualityPreference(
  apply: (value: WaterQuality) => void = () => undefined,
  storage: PreferenceStorage | null = browserStorage(),
): WaterQualityPreference {
  return createStoredPreference(
    DEFAULT_WATER_QUALITY,
    WATER_QUALITY_STORAGE_KEY,
    parseWaterQuality,
    apply,
    storage,
  );
}

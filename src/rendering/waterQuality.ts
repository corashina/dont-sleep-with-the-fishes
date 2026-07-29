export type WaterQuality = 'low' | 'high';

export const DEFAULT_WATER_QUALITY: WaterQuality = 'low';
export const WATER_QUALITY_STORAGE_KEY =
  'dont-sleep-with-the-fishes.water-quality';

type QualityStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface WaterQualityPreference {
  get(): WaterQuality;
  set(value: WaterQuality): void;
}

export function parseWaterQuality(value: unknown): WaterQuality {
  return value === 'high' ? 'high' : DEFAULT_WATER_QUALITY;
}

function browserStorage(): QualityStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function createWaterQualityPreference(
  apply: (value: WaterQuality) => void = () => undefined,
  storage: QualityStorage | null = browserStorage(),
): WaterQualityPreference {
  let current = DEFAULT_WATER_QUALITY;
  try {
    current = parseWaterQuality(storage?.getItem(WATER_QUALITY_STORAGE_KEY));
  } catch {
    current = DEFAULT_WATER_QUALITY;
  }
  return Object.freeze({
    get: () => current,
    set: (value: WaterQuality) => {
      if (value === current) return;
      current = value;
      apply(value);
      try {
        storage?.setItem(WATER_QUALITY_STORAGE_KEY, value);
      } catch {
        // Storage is optional; the in-memory choice still applies.
      }
    },
  });
}

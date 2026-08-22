import {
  browserStorage,
  createStoredPreference,
  type PreferenceStorage,
  type StoredPreference,
} from '../browser/storage';

export type AntiAliasingQuality = 'low' | 'high';

export const DEFAULT_ANTI_ALIASING_QUALITY: AntiAliasingQuality = 'low';
export const ANTI_ALIASING_QUALITY_STORAGE_KEY =
  'dont-sleep-with-the-fishes.anti-aliasing-quality';

export interface AntiAliasingQualityPreference
  extends StoredPreference<AntiAliasingQuality> {}

export function parseAntiAliasingQuality(value: unknown): AntiAliasingQuality {
  return value === 'high' ? value : DEFAULT_ANTI_ALIASING_QUALITY;
}

export function antiAliasingSamples(
  quality: AntiAliasingQuality,
  maximumSamples: number,
): number {
  const requestedSamples = quality === 'high' ? 4 : 2;
  const supportedSamples = Number.isFinite(maximumSamples)
    ? Math.max(0, Math.floor(maximumSamples))
    : 0;
  return Math.min(requestedSamples, supportedSamples);
}

export function createAntiAliasingQualityPreference(
  apply: (value: AntiAliasingQuality) => void = () => undefined,
  storage: PreferenceStorage | null = browserStorage(),
): AntiAliasingQualityPreference {
  return createStoredPreference(
    DEFAULT_ANTI_ALIASING_QUALITY,
    ANTI_ALIASING_QUALITY_STORAGE_KEY,
    parseAntiAliasingQuality,
    apply,
    storage,
  );
}

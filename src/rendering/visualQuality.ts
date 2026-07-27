export type VisualQuality = 'low' | 'high';

export const DEFAULT_VISUAL_QUALITY: VisualQuality = 'low';
export const VISUAL_QUALITY_STORAGE_KEY =
  'dont-sleep-with-the-fishes.visual-quality';

type QualityStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface VisualQualityPreference {
  get(): VisualQuality;
  set(value: VisualQuality): void;
}

export function parseVisualQuality(value: unknown): VisualQuality {
  return value === 'high' ? 'high' : DEFAULT_VISUAL_QUALITY;
}

function browserStorage(): QualityStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function createVisualQualityPreference(
  apply: (value: VisualQuality) => void = () => undefined,
  storage: QualityStorage | null = browserStorage(),
): VisualQualityPreference {
  let current = DEFAULT_VISUAL_QUALITY;
  try {
    current = parseVisualQuality(storage?.getItem(VISUAL_QUALITY_STORAGE_KEY));
  } catch {
    current = DEFAULT_VISUAL_QUALITY;
  }
  return Object.freeze({
    get: () => current,
    set: (value: VisualQuality) => {
      if (value === current) return;
      current = value;
      apply(value);
      try {
        storage?.setItem(VISUAL_QUALITY_STORAGE_KEY, value);
      } catch {
        // Storage is optional; the in-memory choice still applies.
      }
    },
  });
}

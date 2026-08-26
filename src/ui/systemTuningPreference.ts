import { browserStorage, type PreferenceStorage } from '../browser/storage';
import {
  ITEM_AMBIENT_OCCLUSION_DEFAULT_INTENSITY,
  ITEM_AMBIENT_OCCLUSION_DEFAULT_RADIUS,
  type ItemAmbientOcclusionMode,
} from '../rendering/ItemAmbientOcclusion';
import { clampPostProcessingSetting } from '../rendering/postProcessingControls';
import {
  PRESENTATION_WEATHER_IDS,
  type PresentationWeatherId,
} from '../weather/presentationWeather';
import type { SkyPhase } from '../world/skyPalette';

export interface SystemTuningState {
  readonly ambientOcclusionMode: ItemAmbientOcclusionMode;
  readonly ambientOcclusionIntensity: number;
  readonly ambientOcclusionRadius: number;
  readonly performanceStatsVisible: boolean;
  readonly cameraFieldOfView: number;
  readonly weatherOverride: PresentationWeatherId | null;
  readonly phaseOverride: SkyPhase | null;
  readonly volumetricCloudsEnabled: boolean;
}

export interface SystemTuningPreference {
  get(): Readonly<SystemTuningState>;
  set<K extends keyof SystemTuningState>(
    key: K,
    value: SystemTuningState[K],
  ): void;
}

export const SYSTEM_TUNING_STORAGE_KEY =
  'dont-sleep-with-the-fishes.system-tuning';

export const DEFAULT_SYSTEM_TUNING_STATE = Object.freeze({
  ambientOcclusionMode: 'composite',
  ambientOcclusionIntensity: ITEM_AMBIENT_OCCLUSION_DEFAULT_INTENSITY,
  ambientOcclusionRadius: ITEM_AMBIENT_OCCLUSION_DEFAULT_RADIUS,
  performanceStatsVisible: false,
  cameraFieldOfView: 80,
  weatherOverride: null,
  phaseOverride: null,
  volumetricCloudsEnabled: false,
} satisfies SystemTuningState);

const AMBIENT_OCCLUSION_MODES: readonly ItemAmbientOcclusionMode[] = [
  'composite',
  'debug',
  'off',
];

function clampFieldOfView(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(110, Math.max(40, value));
}

function parseState(value: unknown): SystemTuningState {
  if (typeof value !== 'object' || value === null) return DEFAULT_SYSTEM_TUNING_STATE;
  const stored = value as Record<string, unknown>;
  const ambientOcclusionMode = AMBIENT_OCCLUSION_MODES.includes(
    stored.ambientOcclusionMode as ItemAmbientOcclusionMode,
  )
    ? (stored.ambientOcclusionMode as ItemAmbientOcclusionMode)
    : DEFAULT_SYSTEM_TUNING_STATE.ambientOcclusionMode;
  const ambientOcclusionIntensity = clampPostProcessingSetting(
    'ambientOcclusionIntensity',
    typeof stored.ambientOcclusionIntensity === 'number'
      && Number.isFinite(stored.ambientOcclusionIntensity)
      ? stored.ambientOcclusionIntensity
      : DEFAULT_SYSTEM_TUNING_STATE.ambientOcclusionIntensity,
  );
  const ambientOcclusionRadius = clampPostProcessingSetting(
    'ambientOcclusionRadius',
    typeof stored.ambientOcclusionRadius === 'number'
      && Number.isFinite(stored.ambientOcclusionRadius)
      ? stored.ambientOcclusionRadius
      : DEFAULT_SYSTEM_TUNING_STATE.ambientOcclusionRadius,
  );
  const weatherOverride = PRESENTATION_WEATHER_IDS.includes(
    stored.weatherOverride as PresentationWeatherId,
  )
    ? (stored.weatherOverride as PresentationWeatherId)
    : DEFAULT_SYSTEM_TUNING_STATE.weatherOverride;
  const phaseOverride = stored.phaseOverride === 'day' || stored.phaseOverride === 'night'
    ? stored.phaseOverride
    : DEFAULT_SYSTEM_TUNING_STATE.phaseOverride;

  return Object.freeze({
    ambientOcclusionMode,
    ambientOcclusionIntensity,
    ambientOcclusionRadius,
    performanceStatsVisible:
      typeof stored.performanceStatsVisible === 'boolean'
        ? stored.performanceStatsVisible
        : DEFAULT_SYSTEM_TUNING_STATE.performanceStatsVisible,
    cameraFieldOfView: clampFieldOfView(
      stored.cameraFieldOfView,
      DEFAULT_SYSTEM_TUNING_STATE.cameraFieldOfView,
    ),
    weatherOverride,
    phaseOverride,
    volumetricCloudsEnabled:
      typeof stored.volumetricCloudsEnabled === 'boolean'
        ? stored.volumetricCloudsEnabled
        : DEFAULT_SYSTEM_TUNING_STATE.volumetricCloudsEnabled,
  });
}

export function createSystemTuningPreference(
  storage: PreferenceStorage | null = browserStorage(),
): SystemTuningPreference {
  let current: Readonly<SystemTuningState> = DEFAULT_SYSTEM_TUNING_STATE;
  try {
    const raw = storage?.getItem(SYSTEM_TUNING_STORAGE_KEY);
    current = parseState(raw === null || raw === undefined ? null : JSON.parse(raw));
  } catch {
    current = DEFAULT_SYSTEM_TUNING_STATE;
  }

  return {
    get: () => current,
    set: (key, value) => {
      current = Object.freeze({ ...current, [key]: value });
      try {
        storage?.setItem(SYSTEM_TUNING_STORAGE_KEY, JSON.stringify(current));
      } catch {
        // Storage is optional; the in-memory choice still applies.
      }
    },
  };
}

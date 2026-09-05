import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SYSTEM_TUNING_STATE,
  SYSTEM_TUNING_STORAGE_KEY,
  createSystemTuningPreference,
} from '../src/ui/systemTuningPreference';

describe('SystemTuningPreference', () => {
  it('uses safe defaults without stored state', () => {
    const storage = { getItem: vi.fn().mockReturnValue(null), setItem: vi.fn() };
    expect(createSystemTuningPreference(storage).get()).toEqual(
      DEFAULT_SYSTEM_TUNING_STATE,
    );
  });

  it('keeps valid fields and replaces invalid fields', () => {
    const storage = {
      getItem: vi.fn().mockReturnValue(JSON.stringify({
        ambientOcclusionMode: 'off',
        ambientOcclusionQuality: 'high',
        ambientOcclusionIntensity: 99,
        ambientOcclusionRadius: 0.16,
        performanceStatsVisible: true,
        cameraFieldOfView: 91,
        weatherOverride: 'rain',
        phaseOverride: 'night',
        volumetricCloudsEnabled: true,
      })),
      setItem: vi.fn(),
    };
    expect(createSystemTuningPreference(storage).get()).toEqual({
      ambientOcclusionMode: 'off',
      ambientOcclusionQuality: 'high',
      ambientOcclusionIntensity: 1,
      ambientOcclusionRadius: 0.16,
      performanceStatsVisible: true,
      cameraFieldOfView: 91,
      weatherOverride: 'rain',
      phaseOverride: 'night',
      volumetricCloudsEnabled: true,
    });
    expect(storage.getItem).toHaveBeenCalledWith(SYSTEM_TUNING_STORAGE_KEY);
  });

  it('writes one updated JSON state', () => {
    const storage = { getItem: vi.fn().mockReturnValue(null), setItem: vi.fn() };
    const preference = createSystemTuningPreference(storage);
    preference.set('volumetricCloudsEnabled', true);
    expect(JSON.parse(storage.setItem.mock.calls[0]![1])).toMatchObject({
      volumetricCloudsEnabled: true,
      cameraFieldOfView: 80,
    });
  });

  it('keeps the current value when storage throws', () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error('read'); }),
      setItem: vi.fn(() => { throw new Error('write'); }),
    };
    const preference = createSystemTuningPreference(storage);
    expect(() => preference.set('performanceStatsVisible', true)).not.toThrow();
    expect(preference.get().performanceStatsVisible).toBe(true);
  });
});

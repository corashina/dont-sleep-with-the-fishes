import { describe, expect, it, vi } from 'vitest';
import {
  createWaterQualityPreference,
  parseWaterQuality,
  WATER_QUALITY_STORAGE_KEY,
} from '../src/rendering/waterQuality';

describe('water quality preference', () => {
  it('accepts only low and high', () => {
    expect(parseWaterQuality('high')).toBe('high');
    expect(parseWaterQuality('low')).toBe('low');
    expect(parseWaterQuality('ultra')).toBe('low');
    expect(parseWaterQuality(null)).toBe('low');
  });

  it('loads, applies, and persists changes without repeating equal values', () => {
    const storage = {
      getItem: vi.fn(() => 'high'),
      setItem: vi.fn(),
    };
    const apply = vi.fn();
    const preference = createWaterQualityPreference(apply, storage);

    expect(preference.get()).toBe('high');
    preference.set('low');
    preference.set('low');

    expect(apply).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledWith('low');
    expect(storage.setItem).toHaveBeenCalledWith(
      WATER_QUALITY_STORAGE_KEY,
      'low',
    );
  });

  it('falls back to low when storage throws', () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error('blocked'); }),
      setItem: vi.fn(() => { throw new Error('blocked'); }),
    };
    const preference = createWaterQualityPreference(vi.fn(), storage);
    expect(preference.get()).toBe('low');
    expect(() => preference.set('high')).not.toThrow();
    expect(preference.get()).toBe('high');
  });
});

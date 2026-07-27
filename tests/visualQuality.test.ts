import { describe, expect, it, vi } from 'vitest';
import {
  createVisualQualityPreference,
  parseVisualQuality,
  VISUAL_QUALITY_STORAGE_KEY,
} from '../src/rendering/visualQuality';

describe('visual quality preference', () => {
  it('accepts only low and high', () => {
    expect(parseVisualQuality('high')).toBe('high');
    expect(parseVisualQuality('low')).toBe('low');
    expect(parseVisualQuality('ultra')).toBe('low');
    expect(parseVisualQuality(null)).toBe('low');
  });

  it('loads, applies, and persists changes without repeating equal values', () => {
    const storage = {
      getItem: vi.fn(() => 'high'),
      setItem: vi.fn(),
    };
    const apply = vi.fn();
    const preference = createVisualQualityPreference(apply, storage);

    expect(preference.get()).toBe('high');
    preference.set('low');
    preference.set('low');

    expect(apply).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledWith('low');
    expect(storage.setItem).toHaveBeenCalledWith(
      VISUAL_QUALITY_STORAGE_KEY,
      'low',
    );
  });

  it('falls back to low when storage throws', () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error('blocked'); }),
      setItem: vi.fn(() => { throw new Error('blocked'); }),
    };
    const preference = createVisualQualityPreference(vi.fn(), storage);
    expect(preference.get()).toBe('low');
    expect(() => preference.set('high')).not.toThrow();
    expect(preference.get()).toBe('high');
  });
});

// Importance: 4/5. Protects stored water quality values.

import { describe, expect, it, vi } from 'vitest';
import {
  createWaterQualityPreference,
  DEFAULT_WATER_QUALITY,
  WATER_QUALITY_STORAGE_KEY,
} from '../src/rendering/waterQuality';

describe('water quality preference', () => {
  it.each([
    { stored: 'low', expected: 'low' },
    { stored: 'high', expected: 'high' },
    { stored: 'ultra', expected: 'ultra' },
    { stored: 'medium', expected: DEFAULT_WATER_QUALITY },
    { stored: null, expected: DEFAULT_WATER_QUALITY },
  ] as const)('loads $stored as $expected', ({ stored, expected }) => {
    const storage = {
      getItem: vi.fn(() => stored),
      setItem: vi.fn(),
    };
    const preference = createWaterQualityPreference(
      () => undefined,
      storage,
    );

    expect(preference.get()).toBe(expected);
  });

  it('stores and applies Ultra', () => {
    const apply = vi.fn();
    const storage = {
      getItem: vi.fn(() => 'low'),
      setItem: vi.fn(),
    };
    const preference = createWaterQualityPreference(apply, storage);

    preference.set('ultra');

    expect(preference.get()).toBe('ultra');
    expect(apply).toHaveBeenCalledWith('ultra');
    expect(storage.setItem).toHaveBeenCalledWith(
      WATER_QUALITY_STORAGE_KEY,
      'ultra',
    );
  });
});

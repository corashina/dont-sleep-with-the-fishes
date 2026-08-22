// Importance: 8/10. Protects stored anti-aliasing quality and GPU sample limits.

import { describe, expect, it, vi } from 'vitest';
import {
  antiAliasingSamples,
  ANTI_ALIASING_QUALITY_STORAGE_KEY,
  createAntiAliasingQualityPreference,
} from '../src/rendering/antiAliasingQuality';

describe('anti-aliasing quality', () => {
  it.each([
    { stored: 'low', expected: 'low' },
    { stored: 'high', expected: 'high' },
    { stored: 'medium', expected: 'low' },
    { stored: null, expected: 'low' },
  ] as const)('loads $stored as $expected', ({ stored, expected }) => {
    const storage = {
      getItem: vi.fn(() => stored),
      setItem: vi.fn(),
    };
    const preference = createAntiAliasingQualityPreference(
      () => undefined,
      storage,
    );

    expect(preference.get()).toBe(expected);
  });

  it('stores and applies High', () => {
    const apply = vi.fn();
    const storage = {
      getItem: vi.fn(() => 'low'),
      setItem: vi.fn(),
    };
    const preference = createAntiAliasingQualityPreference(apply, storage);

    preference.set('high');

    expect(preference.get()).toBe('high');
    expect(apply).toHaveBeenCalledWith('high');
    expect(storage.setItem).toHaveBeenCalledWith(
      ANTI_ALIASING_QUALITY_STORAGE_KEY,
      'high',
    );
  });

  it.each([
    { quality: 'low', maximum: 8, expected: 2 },
    { quality: 'high', maximum: 8, expected: 4 },
    { quality: 'high', maximum: 2, expected: 2 },
    { quality: 'low', maximum: 0, expected: 0 },
  ] as const)(
    'uses $expected samples for $quality with a $maximum sample limit',
    ({ quality, maximum, expected }) => {
      expect(antiAliasingSamples(quality, maximum)).toBe(expected);
    },
  );
});

import { expect, it, vi } from 'vitest';
import { DEFAULT_POSTERIZATION, normalizePosterization } from '../src/rendering/posterization';
import { createSystemTuningPreference } from '../src/ui/systemTuningPreference';

it('defaults to enabled at 25 percent and ignores the removed experiment settings', () => {
  expect(createSystemTuningPreference(null).get().posterization).toEqual({ enabled: true, strength: .25 });
  const storage = { getItem: () => JSON.stringify({ filters: { posterization: { enabled: false, strength: .4 } } }), setItem: vi.fn() };
  expect(createSystemTuningPreference(storage).get().posterization).toEqual(DEFAULT_POSTERIZATION);
});

it('saves strength and the off choice independently from other settings', () => {
  let stored: string | null = null;
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } };
  const preference = createSystemTuningPreference(storage);
  preference.set('weatherOverride', 'rain');
  preference.set('posterization', { enabled: false, strength: .6 });
  expect(createSystemTuningPreference(storage).get()).toMatchObject({
    posterization: { enabled: false, strength: .6 }, weatherOverride: 'rain',
  });
});

it('clamps stored strength and rejects invalid settings', () => {
  expect(normalizePosterization({ enabled: false, strength: 99 })).toEqual({ enabled: false, strength: 1 });
  expect(normalizePosterization({ strength: -1 }).strength).toBe(0);
  expect(normalizePosterization({ enabled: 'false', strength: Infinity })).toEqual(DEFAULT_POSTERIZATION);
  expect(Object.isFrozen(normalizePosterization(null))).toBe(true);
});

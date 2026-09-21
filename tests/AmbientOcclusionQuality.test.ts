import { expect, it } from 'vitest';
import { createSystemTuningPreference } from '../src/ui/systemTuningPreference';

it('restores AO quality and the off choice from saved settings', () => {
  let stored: string | null = null;
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } };
  const preference = createSystemTuningPreference(storage);
  preference.set('ambientOcclusionQuality', 'high');
  preference.set('ambientOcclusionMode', 'off');
  expect(createSystemTuningPreference(storage).get()).toMatchObject({
    ambientOcclusionQuality: 'high', ambientOcclusionMode: 'off',
  });
});

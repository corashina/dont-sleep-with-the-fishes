import { expect, it } from 'vitest';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ItemAmbientOcclusionPass } from '../src/rendering/ItemAmbientOcclusion';
import { createSystemTuningPreference } from '../src/ui/systemTuningPreference';

it('changes AO resolution and sampling while preserving debug output', () => {
  const pass = new ItemAmbientOcclusionPass('debug', 'low');
  try {
    pass.setSize(1000, 500);
    expect([pass.width, pass.height]).toEqual([400, 200]);
    expect(pass.gtaoMaterial.defines.SAMPLES).toBe(6);
    pass.setQuality('high');
    expect([pass.width, pass.height]).toEqual([1000, 500]);
    expect(pass.gtaoMaterial.defines.SAMPLES).toBe(16);
    expect(pass.output).toBe(GTAOPass.OUTPUT.AO);
    pass.setMode('off');
    expect(pass.enabled).toBe(false);
    pass.setMode('composite');
    expect(pass.enabled).toBe(true);
    expect(pass.output).toBe(GTAOPass.OUTPUT.Default);
  } finally {
    pass.dispose();
  }
});

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

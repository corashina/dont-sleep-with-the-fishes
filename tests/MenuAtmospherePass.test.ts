// Importance: 8/10. Protects menu-only atmosphere and quality scaling.
import { expect, it } from 'vitest';
import {
  MENU_ATMOSPHERE_QUALITY,
  MenuAtmospherePass,
} from '../src/rendering/MenuAtmospherePass';

it('enables atmosphere only for the menu at medium and high quality', () => {
  const pass = new MenuAtmospherePass();

  pass.setProfile(true, 'low');
  expect(pass.enabled).toBe(false);

  pass.setProfile(true, 'medium');
  expect(pass.enabled).toBe(true);
  expect(pass.uniforms.gradeStrength!.value)
    .toBe(MENU_ATMOSPHERE_QUALITY.medium.gradeStrength);
  expect(pass.uniforms.vignetteStrength!.value)
    .toBe(MENU_ATMOSPHERE_QUALITY.medium.vignetteStrength);

  pass.setProfile(false, 'high');
  expect(pass.enabled).toBe(false);
  expect(pass.uniforms.grainStrength!.value).toBe(0);
  pass.dispose();
});

it('scales the strongest effects to high quality and sanitizes time', () => {
  const pass = new MenuAtmospherePass();
  expect(MENU_ATMOSPHERE_QUALITY.high.bloomStrength)
    .toBeGreaterThan(MENU_ATMOSPHERE_QUALITY.medium.bloomStrength);
  expect(MENU_ATMOSPHERE_QUALITY.high.grainStrength)
    .toBeGreaterThan(MENU_ATMOSPHERE_QUALITY.medium.grainStrength);

  pass.setTime(Number.NaN);
  expect(pass.uniforms.time!.value).toBe(0);
  pass.setTime(12.5);
  expect(pass.uniforms.time!.value).toBe(12.5);
  pass.dispose();
});

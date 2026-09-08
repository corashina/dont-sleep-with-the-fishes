import {
  Scene,
  Vector2,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import {
  VolumetricClouds,
} from '../src/world/VolumetricClouds';
import { volumetricCloudProfile } from '../src/world/volumetricCloudProfiles';
import { skyPaletteFor } from '../src/world/skyPalette';

function updateCloudWeather(
  clouds: VolumetricClouds,
  weather: 'calm' | 'overcast' | 'squall',
  time: number,
  delta: number,
): number {
  const state = { weather, phase: 'day' as const, severity: 0 };
  return clouds.update({
    time,
    delta,
    cameraPosition: new Vector3(3, 5, 7),
    state,
    palette: skyPaletteFor(state),
  });
}

describe('VolumetricClouds', () => {

  it('integrates wind by delta when weather and absolute time change', () => {
    const clouds = new VolumetricClouds(new Scene(), 'low');
    clouds.setEnabled(true);
    updateCloudWeather(clouds, 'calm', 1, 1);
    const windOffset = clouds.material.uniforms.uWindOffset!.value as Vector2;
    const before = windOffset.clone();

    updateCloudWeather(clouds, 'squall', 1_000_000, 0.25);

    const travel = windOffset.distanceTo(before);
    expect(travel).toBeGreaterThan(0);
    expect(travel).toBeLessThanOrEqual(
      volumetricCloudProfile('squall').wind.length() * 0.25,
    );
    clouds.dispose();
  });

  it('sanitizes non-finite frame inputs', () => {
    const clouds = new VolumetricClouds(new Scene(), 'high');
    clouds.setEnabled(true);
    const state = { weather: 'calm' as const, phase: 'day' as const, severity: 0 };

    const strength = clouds.update({
      time: Number.NaN,
      delta: Number.POSITIVE_INFINITY,
      cameraPosition: new Vector3(Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY),
      state,
      palette: skyPaletteFor(state),
    });

    expect(strength).toBe(0);
    expect(clouds.mesh.position.toArray()).toEqual([0, 0, 0]);
    expect(clouds.material.uniforms.uTime!.value).toBe(0);
    clouds.dispose();
  });
});

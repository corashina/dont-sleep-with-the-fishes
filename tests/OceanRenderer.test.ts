// Importance: 4/5. Protects the cheap horizon transition and uniform ownership.
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  OCEAN_SURFACE_QUALITY,
  OceanRenderer,
} from '../src/ocean/OceanRenderer';

describe('OceanRenderer horizon haze', () => {
  it.each([
    ['low', [35, 120, 0.88]],
    ['high', [45, 145, 0.82]],
  ] as const)('uses the %s quality haze settings', (quality, expected) => {
    const ocean = new OceanRenderer(quality);

    expect([
      OCEAN_SURFACE_QUALITY[quality].horizonHazeStart,
      OCEAN_SURFACE_QUALITY[quality].horizonHazeEnd,
      OCEAN_SURFACE_QUALITY[quality].horizonHazeStrength,
    ]).toEqual(expected);
    expect(
      (ocean.material.uniforms.uHorizonHaze!.value as Vector3).toArray(),
    ).toEqual(expected);

    ocean.dispose();
  });

  it('updates the existing haze uniform when quality changes', () => {
    const ocean = new OceanRenderer('low');
    const haze = ocean.material.uniforms.uHorizonHaze!.value as Vector3;

    ocean.setQuality('high');

    expect(ocean.material.uniforms.uHorizonHaze!.value).toBe(haze);
    expect(haze.toArray()).toEqual([45, 145, 0.82]);
    ocean.dispose();
  });

  it('disposes safely after a quality change', () => {
    const ocean = new OceanRenderer('low');

    ocean.setQuality('high');
    expect(() => ocean.dispose()).not.toThrow();
    expect(() => ocean.dispose()).not.toThrow();
  });
});

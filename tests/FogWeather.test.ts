import { describe, expect, it } from 'vitest';
import { FogExp2, Scene, Texture, Vector3, type Color } from 'three';
import { Skybox } from '../src/world/Skybox';
import { Environment } from '../src/world/Environment';

describe('fog weather visibility', () => {
  // Importance: 95/100. Dense fog must preserve nearby interaction visibility.
  it.each(['day', 'night'] as const)('keeps nearby objects visible and hides distant objects during %s', (phase) => {
    const scene = new Scene();
    const moon = new Texture();
    const environment = new Environment(scene, moon);
    const camera = new Vector3(0, 1.5, 0);
    try {
      environment.setPhase(phase);
      environment.setWeather('fog');
      environment.update(2, 2, camera);
      const fog = scene.fog as FogExp2;
      const transmission = (distance: number) => Math.exp(-((fog.density * distance) ** 2));
      expect(transmission(4)).toBeGreaterThan(0.8);
      expect(transmission(24)).toBeLessThan(0.05);
      expect(environment.atmosphere.starVisibility).toBe(0);
      expect(environment.atmosphere.fogVolume).toBe(1);
      // Importance: 92/100. A uniform grey sky erases the visible height separation.
      const luminance = (color: Color) => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
      const palette = environment.atmosphere;
      expect(luminance(palette.horizonColor)).toBeGreaterThan(luminance(palette.zenithColor) * 2);
      expect(luminance(palette.upperColor)).toBeLessThan(luminance(palette.horizonColor) * 0.8);
      if (phase === 'night') expect(environment.atmosphere.moonVisibility).toBeGreaterThan(0.5);
      expect(scene.getObjectByName('weather-mist')!.visible).toBe(false);

      environment.setWeather('calm');
      environment.update(4, 2, camera);
      expect(transmission(24)).toBeGreaterThan(0.85);
      expect(environment.atmosphere.fogVolume).toBe(0);
    } finally {
      environment.dispose();
      moon.dispose();
    }
  });
});

// Importance: 95/100. Interrupted transitions must not leave a fog overlay behind.
it('fades the fog volume with the palette and clears it after an interrupted transition', () => {
  const scene = new Scene();
  const moon = new Texture();
  const camera = new Vector3(0, 1.5, 0);
  const sky = new Skybox(scene, { phase: 'night', weather: 'calm', severity: 0 }, moon);
  try {
    sky.update(0.75, { phase: 'night', weather: 'fog', severity: 0 }, camera);
    expect(sky.palette.fogVolume).toBeCloseTo(0.5);
    expect(sky.material.uniforms.uFogVolume!.value).toBeCloseTo(0.5);
    sky.update(0.75, { phase: 'night', weather: 'calm', severity: 0 }, camera);
    expect(sky.palette.fogVolume).toBeCloseTo(0.25);
    sky.update(0.75, { phase: 'night', weather: 'calm', severity: 0 }, camera);
    expect(sky.palette.fogVolume).toBe(0);
    expect(sky.material.uniforms.uFogVolume!.value).toBe(0);
    expect(sky.material.uniforms.uFogTime!.value).toBe(sky.fogTime);
  } finally {
    sky.dispose();
    moon.dispose();
  }
});

import { describe, expect, it } from 'vitest';
import { FogExp2, Scene, Texture, Vector3 } from 'three';
import { Environment } from '../src/world/Environment';

describe('fog weather visibility', () => {
  // Importance: 95/100. Dense fog must preserve nearby interaction visibility.
  it.each(['night'] as const)('keeps nearby objects visible and hides distant water during %s', (phase) => {
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
      expect(scene.getObjectByName('weather-mist')!.visible).toBe(false);

      environment.setWeather('calm');
      environment.update(4, 2, camera);
      expect(transmission(24)).toBeGreaterThan(0.85);
    } finally {
      environment.dispose();
      moon.dispose();
    }
  });
});

import { describe,expect,it } from 'vitest';
import { Color,Vector3 } from 'three';
import { OceanRenderer,type OceanAtmosphere } from '../src/ocean/OceanRenderer';
import { HIGH_WATER_LOOK } from '../src/ocean/highWaterLook';
import { SUN_DIRECTION } from '../src/world/celestialLight';

function atmosphere(phase: 'day' | 'night'): OceanAtmosphere {
  return {
    phase,
    fogColor: new Color('#829b9e'),
    horizonColor: new Color('#b9d1cd'),
    skyColor: new Color('#145f91'),
    sunColor: new Color('#ffdda0'),
    sunVisibility: 0.08,
  };
}

describe('shared High water look', () => {
  it.each(['day', 'night'] as const)('keeps the shared colors and each scene light direction during %s', (phase) => {
    const lab = new OceanRenderer('high');
    const survival = new OceanRenderer('high', [0, 0.24, -1]);
    const scavenging = new OceanRenderer('high');
    const look = HIGH_WATER_LOOK[phase];
    const gameAtmosphere = atmosphere(phase);
    try {
      lab.update(1, 1, look.fogDensity, {
        ...gameAtmosphere, fogColor: look.fogColor,
        horizonColor: look.skyColor, skyColor: look.skyColor,
        sunColor: look.sunColor, sunVisibility: look.lightStrength,
      });
      survival.update(1, 0.75, 0.04, gameAtmosphere);
      scavenging.update(1, 1.7, 0.08, gameAtmosphere);
      for (const ocean of [survival, scavenging]) {
        for (const key of [
          'uFogColor', 'uHorizonColor', 'uSkyColor', 'uSunColor',
          'uWaterReflectionSky', 'uWaterOpenRadiance',
        ]) {
          expect(ocean.material.uniforms[key]!.value).toEqual(lab.material.uniforms[key]!.value);
        }
        expect(ocean.material.uniforms.uFogDensity!.value).toBe(look.fogDensity);
        expect(ocean.material.uniforms.uDirectLightStrength!.value).toBe(look.lightStrength);
      }
      expect(survival.material.uniforms.uAmplitudeScale!.value).toBe(0.75);
      expect(scavenging.material.uniforms.uAmplitudeScale!.value).toBe(1.7);
      expect(survival.material.uniforms.uLightDirection!.value).toEqual(new Vector3(0, 0.24, -1).normalize());
      expect(scavenging.material.uniforms.uLightDirection!.value).toEqual(new Vector3(...SUN_DIRECTION).normalize());
    } finally {
      lab.dispose();
      survival.dispose();
      scavenging.dispose();
    }
  });
});

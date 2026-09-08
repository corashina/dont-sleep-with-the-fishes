import { describe, expect, it } from 'vitest';
import { Color, Vector3 } from 'three';
import { OceanRenderer, type OceanAtmosphere } from '../src/ocean/OceanRenderer';
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
  it.each(['day', 'night'] as const)('keeps the lab lighting in different %s game atmospheres', (phase) => {
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
          'uWaterReflectionSky', 'uWaterOpenRadiance', 'uLightDirection',
        ]) {
          expect(ocean.material.uniforms[key]!.value).toEqual(lab.material.uniforms[key]!.value);
        }
        expect(ocean.material.uniforms.uFogDensity!.value).toBe(look.fogDensity);
        expect(ocean.material.uniforms.uDirectLightStrength!.value).toBe(look.lightStrength);
      }
      expect(survival.material.uniforms.uAmplitudeScale!.value).toBe(0.75);
      expect(scavenging.material.uniforms.uAmplitudeScale!.value).toBe(1.7);
    } finally {
      lab.dispose();
      survival.dispose();
      scavenging.dispose();
    }
  });

  it('restores scene lighting on Low and the shared preset on High without another frame', () => {
    const direction = [0, 0.24, -1] as const;
    const ocean = new OceanRenderer('high', direction);
    const scene = atmosphere('night');
    try {
      ocean.update(2, 1, 0.04, scene);
      ocean.setQuality('low');
      expect(ocean.material.uniforms.uFogDensity!.value).toBe(0.04);
      expect(ocean.material.uniforms.uSkyColor!.value).toEqual(scene.skyColor);
      expect(ocean.material.uniforms.uLightDirection!.value).toEqual(new Vector3(...direction).normalize());
      expect(ocean.material.uniforms.uWaterReflectionDepth!.value).toBeNull();
      ocean.setQuality('high');
      expect(ocean.material.uniforms.uSkyColor!.value).toEqual(HIGH_WATER_LOOK.night.skyColor);
      expect(ocean.material.uniforms.uLightDirection!.value).toEqual(new Vector3(...SUN_DIRECTION).normalize());
      expect(ocean.material.uniforms.uWaterReflectionDepth!.value.isDepthTexture).toBe(true);
    } finally {
      ocean.dispose();
    }
  });
});

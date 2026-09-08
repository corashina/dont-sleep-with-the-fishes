import { Color } from 'three';
import { SUN_DIRECTION } from '../world/celestialLight';
import type { OceanShaderUniforms } from './oceanShader';

/** The approved water-lab lighting, shared by every High ocean. */
export const HIGH_WATER_LOOK = {
  day: {
    fogColor: new Color('#173d4a'),
    skyColor: new Color('#8bb8bd'),
    reflectionColor: new Color('#78a7b0'),
    sunColor: new Color('#ffe0a2'),
    fogDensity: 0.006,
    lightStrength: 1,
    // Linear diffuse radiance of the lab's lit, shallow water background.
    openRadiance: new Color().setRGB(0.144, 0.105, 0.046),
  },
  night: {
    fogColor: new Color('#0b2333'),
    skyColor: new Color('#173d5e'),
    reflectionColor: new Color('#071523'),
    sunColor: new Color('#8ab3d9'),
    fogDensity: 0.012,
    lightStrength: 0.25,
    openRadiance: new Color().setRGB(0.025, 0.042, 0.038),
  },
} as const;

export function applyHighWaterLook(
  uniforms: OceanShaderUniforms,
  phase: 'day' | 'night',
): void {
  const look = HIGH_WATER_LOOK[phase];
  uniforms.uFogColor.value.copy(look.fogColor);
  uniforms.uFogDensity.value = look.fogDensity;
  uniforms.uHorizonColor.value.copy(look.skyColor);
  uniforms.uSkyColor.value.copy(look.skyColor);
  uniforms.uSunColor.value.copy(look.sunColor);
  uniforms.uDirectLightStrength.value = look.lightStrength;
  uniforms.uLightDirection.value.set(...SUN_DIRECTION).normalize();
  uniforms.uWaterReflectionSky.value.copy(look.reflectionColor);
  uniforms.uWaterOpenRadiance.value.copy(look.openRadiance);
}

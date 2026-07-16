import { Color, Vector2, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  OCEAN_SURFACE_QUALITY,
  OceanRenderer,
} from '../src/ocean/OceanRenderer';
import { SUN_DIRECTION } from '../src/world/celestialLight';

describe('OceanRenderer', () => {
  it('uses the balanced surface density and ordered detail fade', () => {
    const ocean = new OceanRenderer();
    const position = ocean.mesh.geometry.getAttribute('position');

    expect(OCEAN_SURFACE_QUALITY).toEqual({
      segments: 192,
      detailFadeNear: 28,
      detailFadeFar: 92,
    });
    expect(ocean.mesh.geometry.parameters.widthSegments).toBe(192);
    expect(ocean.mesh.geometry.parameters.heightSegments).toBe(192);
    expect(position.count).toBe(193 * 193);
    expect(ocean.material.uniforms.uDetailFade!.value).toEqual(new Vector2(28, 92));
    expect(OCEAN_SURFACE_QUALITY.detailFadeNear)
      .toBeLessThan(OCEAN_SURFACE_QUALITY.detailFadeFar);

    ocean.dispose();
  });

  it('includes layered chop, broken foam, and two-scale sun light', () => {
    const ocean = new OceanRenderer();
    const shader = ocean.material.fragmentShader;

    expect(shader).toContain('vec2 windWarp(');
    expect(shader).toContain('vec2 warpedDetailSlope(');
    expect(shader).toContain('float foamBreakup(');
    expect(shader).toContain('float foamBody(');
    expect(shader).toContain('float foamCap(');
    expect(shader).toContain('float sunCore =');
    expect(shader).toContain('float sunSheen =');
    expect(shader).not.toContain('vec2 rippleSlope(');

    ocean.dispose();
  });

  it('gates each tapered footprint by the displaced fragment local height', () => {
    const ocean = new OceanRenderer();
    const shader = ocean.material.fragmentShader;

    expect(shader).toContain('uniform float uExclusionMinimumLocalYs[2];');
    expect(shader).toContain('exclusionLocal.y >= uExclusionMinimumLocalYs[i]');

    ocean.dispose();
  });

  it('aims direct light along the normalized shared sun direction', () => {
    const ocean = new OceanRenderer();
    const expected = new Vector3(...SUN_DIRECTION).normalize();

    expect(ocean.material.uniforms.uLightDirection!.value).toEqual(expected);

    ocean.dispose();
  });

  it('uploads clamped atmospheric sun visibility as direct-light strength', () => {
    const ocean = new OceanRenderer();
    const atmosphere = {
      fogColor: new Color(),
      horizonColor: new Color(),
      skyColor: new Color(),
      sunColor: new Color(),
      sunVisibility: 1.4,
    };

    ocean.update(0, 1, 0.018, atmosphere);
    expect(ocean.material.uniforms.uDirectLightStrength?.value).toBe(1);

    atmosphere.sunVisibility = -0.2;
    ocean.update(0, 1, 0.018, atmosphere);
    expect(ocean.material.uniforms.uDirectLightStrength?.value).toBe(0);

    ocean.dispose();
  });

  it('attenuates forward scatter and both sun highlights with direct-light strength', () => {
    const ocean = new OceanRenderer();
    const shader = ocean.material.fragmentShader;

    expect(shader).toContain(
      'waterBody += uShallowColor * forwardScatter * uDirectLightStrength',
    );
    expect(shader).toContain(
      'color += uSunColor * (sunCore + sunSheen) * uDirectLightStrength',
    );

    ocean.dispose();
  });

  it('layers bright crest caps inside broader weather-scaled foam patches', () => {
    const ocean = new OceanRenderer();
    const shader = ocean.material.fragmentShader;

    expect(shader).toContain('float foamBody(');
    expect(shader).toContain('float foamCap(');
    expect(shader).toContain('return bodyFoam * crest * breaking * coverage;');
    expect(shader).toContain('float bodyFoam = foamBody(vHeight, vWaveSlope)');
    expect(shader).toContain('float capFoam = foamCap(vHeight, vWaveSlope, bodyFoam)');
    expect(shader).toContain('float bodyDistanceFade =');
    expect(shader).toContain('float capDistanceFade =');
    expect(shader).toContain('float foam = clamp(bodyFoam + capFoam, 0.0, 1.0);');
    expect(shader).toContain('foam * 0.72 + capFoam * 0.22');
    expect(shader).toContain('color = mix(color, uFoamColor, bodyFoam * 0.60);');
    expect(shader).toContain('color = mix(color, uFoamColor, capFoam * 0.88);');
    expect(shader).not.toContain('float crestFoam(');

    ocean.dispose();
  });
});

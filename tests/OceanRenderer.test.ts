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

  it('builds domain-warped foam ribbons in world-space wind coordinates', () => {
    const ocean = new OceanRenderer();
    const shader = ocean.material.fragmentShader;

    expect(shader).toContain('vec2 windWarp(');
    expect(shader).toContain('vec2 warpedDetailSlope(');
    expect(shader).toContain('float hash21(vec2 position)');
    expect(shader).toContain('float valueNoise(vec2 position)');
    expect(shader).toContain('float foamRibbonNoise(vec2 worldPosition)');
    expect(shader).toContain('float foamEdgeNoise(vec2 worldPosition)');
    expect(shader).toContain(
      'vec2 windSpace = vec2(dot(drifted, wind), dot(drifted, crossWind));',
    );
    expect(shader).toContain('vec2 warpedSpace = windSpace + vec2(');
    expect(shader).toContain('float coarse = valueNoise(');
    expect(shader).toContain('float medium = valueNoise(');
    expect(shader).toContain('float edge = valueNoise(');
    expect(shader).not.toContain('float foamBreakup(');
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

  it('uses weather-scaled ribbon thresholds and zero-capable nearby edge erosion', () => {
    const ocean = new OceanRenderer();
    const shader = ocean.material.fragmentShader;

    expect(shader).toContain(
      'float weather = clamp((uAmplitudeScale - 0.78) / 0.57, 0.0, 1.0);',
    );
    expect(shader).toContain('float crestStart = mix(0.31, 0.13, weather);');
    expect(shader).toContain('float slopeStart = mix(0.11, 0.055, weather);');
    expect(shader).toContain('float ribbonStart = mix(0.57, 0.42, weather);');
    expect(shader).toContain(
      'float erodedEdge = smoothstep(0.14, 0.44, edgeNoise);',
    );
    expect(shader).toContain(
      'float edgeMask = mix(1.0, erodedEdge, fineFade);',
    );
    expect(shader).not.toContain('mix(0.72, 1.0, erodedEdge)');
    expect(shader).toContain(
      'return clamp(crestEnvelope * ribbon * edgeMask * strength, 0.0, 1.0);',
    );

    ocean.dispose();
  });

  it('nests cream crest caps inside distance-faded foam bodies', () => {
    const ocean = new OceanRenderer();
    const shader = ocean.material.fragmentShader;
    const bodyFadeIndex = shader.indexOf('bodyFoam *= bodyDistanceFade;');
    const capIndex = shader.indexOf(
      'float capFoam = foamCap(vHeight, vWaveSlope, bodyFoam, ribbonNoise);',
    );

    expect(shader).toContain('float foamBody(');
    expect(shader).toContain('float foamCap(');
    expect(shader).toContain('float crestStart = mix(0.48, 0.29, weather);');
    expect(shader).toContain('float slopeStart = mix(0.22, 0.13, weather);');
    expect(shader).toContain('float ribbonStart = mix(0.68, 0.55, weather);');
    expect(shader).toContain(
      'return clamp(bodyFoam * crest * breaking * ribbonCore * strength, 0.0, 1.0);',
    );
    expect(shader).toContain('float fineDetailFade =');
    expect(shader).toContain('float bodyDistanceFade =');
    expect(shader).toContain('float capDistanceFade =');
    expect(bodyFadeIndex).toBeGreaterThan(-1);
    expect(capIndex).toBeGreaterThan(bodyFadeIndex);
    expect(shader).toContain('float foam = clamp(bodyFoam + capFoam, 0.0, 1.0);');
    expect(shader).toContain(
      'vec3 capFoamColor = mix(uFoamColor, uSunColor, 0.08 * uDirectLightStrength);',
    );
    expect(shader).toContain('color = mix(color, uFoamColor, bodyFoam * 0.64);');
    expect(shader).toContain('color = mix(color, capFoamColor, capFoam * 0.90);');
    expect(shader).not.toContain('float crestFoam(');

    ocean.dispose();
  });

  it('orders fine, cap, and body fade-out distances', () => {
    const ocean = new OceanRenderer();
    const shader = ocean.material.fragmentShader;
    const detailFade = ocean.material.uniforms.uDetailFade!.value as Vector2;

    expect(shader).toContain(`float fineDetailFade = 1.0 - smoothstep(
      uDetailFade.x * 0.72,
      uDetailFade.x,
      vViewDepth
    );`);
    expect(shader).toContain(`float capDistanceFade = 1.0 - smoothstep(
      uDetailFade.y * 0.48,
      uDetailFade.y * 0.74,
      vViewDepth
    );`);
    expect(shader).toContain(`float bodyDistanceFade = 1.0 - smoothstep(
      uDetailFade.y * 0.62,
      uDetailFade.y * 0.96,
      vViewDepth
    );`);
    expect(detailFade.x).toBeLessThan(detailFade.y * 0.74);
    expect(detailFade.y * 0.74).toBeLessThan(detailFade.y * 0.96);

    ocean.dispose();
  });
});

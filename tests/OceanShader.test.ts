import { Color, Matrix4, Vector2, Vector3, Vector4 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  MAX_OCEAN_EXCLUSIONS,
  OCEAN_FRAGMENT_SHADER,
  OCEAN_VERTEX_SHADER,
  createOceanShaderDefinition,
} from '../src/ocean/oceanShader';

const UNIFORM_NAMES = [
  'uTime',
  'uAmplitudeScale',
  'uOrigin',
  'uDetailFade',
  'uDirections',
  'uParameters',
  'uPhases',
  'uVortexCenter',
  'uVortexRadius',
  'uVortexDepression',
  'uVortexTangentStrength',
  'uVortexPhase',
  'uVortexStrength',
  'uDeepColor',
  'uShallowColor',
  'uFoamColor',
  'uFogColor',
  'uSkyColor',
  'uHorizonColor',
  'uHorizonFog',
  'uSunColor',
  'uDirectLightStrength',
  'uFogDensity',
  'uLightDirection',
  'uExclusionCount',
  'uExclusionWorldToLocal',
  'uExclusionBounds',
  'uExclusionLowerBounds',
  'uExclusionTaperStarts',
  'uExclusionLowerTaperStarts',
  'uExclusionMinimumLocalYs',
  'uExclusionUpperLocalYs',
] as const;

describe('ocean shader definition', () => {
  it.each([
    ['low', {}, [28, 92], [150, 650, 0.86], [0x162c35, 0x42656a, 0xb7b7a5]],
    ['high', { HIGH_QUALITY_WATER: 1 }, [40, 128], [180, 750, 0.82], [0x073844, 0x35a6a0, 0xd4ded4]],
    ['ultra', { HIGH_QUALITY_WATER: 1, ULTRA_QUALITY_WATER: 1 }, [52, 160], [210, 820, 0.78], [0x062932, 0x2f7377, 0xc6cdc4]],
  ] as const)(
    'builds the exact %s shader quality values',
    (quality, defines, detailFade, horizonFog, colors) => {
      const definition = createOceanShaderDefinition(quality);

      expect(definition.vertexShader).toBe(OCEAN_VERTEX_SHADER);
      expect(definition.fragmentShader).toBe(OCEAN_FRAGMENT_SHADER);
      expect(definition.defines).toEqual(defines);
      expect(Object.isFrozen(definition)).toBe(true);
      expect(Object.isFrozen(definition.defines)).toBe(true);
      expect(Object.isFrozen(definition.uniforms)).toBe(false);
      expect(Object.keys(definition.uniforms)).toEqual(UNIFORM_NAMES);
      expect(definition.uniforms.uDetailFade.value.toArray()).toEqual(detailFade);
      expect(definition.uniforms.uHorizonFog.value.toArray()).toEqual(horizonFog);
      expect([
        definition.uniforms.uDeepColor.value.getHex(),
        definition.uniforms.uShallowColor.value.getHex(),
        definition.uniforms.uFoamColor.value.getHex(),
      ]).toEqual(colors);
    },
  );

  it('builds the exact initial uniform graph', () => {
    const { uniforms } = createOceanShaderDefinition('low');

    expect(MAX_OCEAN_EXCLUSIONS).toBe(2);
    expect(uniforms.uTime.value).toBe(0);
    expect(uniforms.uAmplitudeScale.value).toBe(1);
    expect(uniforms.uOrigin.value).toEqual(new Vector2());
    expect(uniforms.uDirections.value.map((value) => value.toArray())).toEqual([
      [0.92, 0.39],
      [-0.35, 0.94],
      [0.18, -0.98],
      [-0.81, -0.59],
    ]);
    expect(uniforms.uParameters.value.map((value) => value.toArray())).toEqual([
      [0.42, 12, 0.82, 0.42],
      [0.24, 7.4, 1.08, 0.34],
      [0.13, 4.1, 1.42, 0.25],
      [0.08, 2.6, 1.88, 0.18],
    ]);
    expect(uniforms.uPhases.value).toEqual([0.2, 1.7, 3.1, 4.6]);
    expect(uniforms.uVortexCenter.value).toEqual(new Vector2());
    expect([
      uniforms.uVortexRadius.value,
      uniforms.uVortexDepression.value,
      uniforms.uVortexTangentStrength.value,
      uniforms.uVortexPhase.value,
      uniforms.uVortexStrength.value,
    ]).toEqual([0, 0, 0, 0, 0]);
    expect(uniforms.uFogColor.value).toEqual(new Color(0x27343b));
    expect(uniforms.uSkyColor.value).toEqual(new Color(0x496b75));
    expect(uniforms.uHorizonColor.value).toEqual(new Color(0x6f8587));
    expect(uniforms.uSunColor.value).toEqual(new Color(0xfff1cf));
    expect(uniforms.uDirectLightStrength.value).toBe(1);
    expect(uniforms.uFogDensity.value).toBe(0.018);
    expect(uniforms.uLightDirection.value).toEqual(new Vector3());
    expect(uniforms.uExclusionCount.value).toBe(0);
    expect(uniforms.uExclusionWorldToLocal.value).toEqual([
      new Matrix4(),
      new Matrix4(),
    ]);
    expect(uniforms.uExclusionBounds.value).toEqual([
      new Vector4(),
      new Vector4(),
    ]);
    expect(uniforms.uExclusionLowerBounds.value).toEqual([
      new Vector4(),
      new Vector4(),
    ]);
    expect(uniforms.uExclusionTaperStarts.value).toEqual([
      new Vector2(),
      new Vector2(),
    ]);
    expect(uniforms.uExclusionLowerTaperStarts.value).toEqual([
      new Vector2(),
      new Vector2(),
    ]);
    expect(uniforms.uExclusionMinimumLocalYs.value).toEqual([
      -1_000_000,
      -1_000_000,
    ]);
    expect(uniforms.uExclusionUpperLocalYs.value).toEqual([
      1_000_000,
      1_000_000,
    ]);
  });

  it('creates independent mutable uniforms and values', () => {
    const first = createOceanShaderDefinition('low');
    const second = createOceanShaderDefinition('low');

    expect(first.uniforms).not.toBe(second.uniforms);
    for (const name of UNIFORM_NAMES) {
      expect(first.uniforms[name]).not.toBe(second.uniforms[name]);
      expect(Object.isFrozen(first.uniforms[name])).toBe(false);
      const firstValue: unknown = first.uniforms[name].value;
      const secondValue: unknown = second.uniforms[name].value;
      if (typeof firstValue === 'object' && firstValue !== null) {
        expect(firstValue).not.toBe(secondValue);
      }
    }

    first.uniforms.uDetailFade.value.set(1, 2);
    expect(second.uniforms.uDetailFade.value.toArray()).toEqual([28, 92]);
  });

  it('keeps all characterized shader markers', () => {
    expect(OCEAN_VERTEX_SHADER).toContain('geometryLod');
    expect(OCEAN_VERTEX_SHADER).toContain('resolvedGeometryWave');
    expect(OCEAN_FRAGMENT_SHADER).toContain('sampleSurfaceWave');
    expect(OCEAN_FRAGMENT_SHADER).toContain(
      'sampleSurfaceWave(vOceanPosition, waveHeight, waveDerivative)',
    );
    expect(OCEAN_FRAGMENT_SHADER).toContain('vec2 ultraQualityMicroSlope');
    expect(OCEAN_FRAGMENT_SHADER).toContain('float ultraSurfaceRoughness');
    expect(OCEAN_FRAGMENT_SHADER).toContain('float ultraSunGlint');
    expect(OCEAN_FRAGMENT_SHADER).toContain('ultraOpticalPath');
    expect(OCEAN_FRAGMENT_SHADER).toContain('ultraBroadReflection');
    expect(OCEAN_FRAGMENT_SHADER).toContain('ultraReflectionBlur');
    expect(OCEAN_FRAGMENT_SHADER).toContain('vec2 ultraQualityFoam');
    expect(OCEAN_FRAGMENT_SHADER).toContain('ultraFoamDistanceFade');
    expect(OCEAN_FRAGMENT_SHADER).toContain('ultraFoamColor');
    expect(OCEAN_FRAGMENT_SHADER).toContain('gl_FragColor');
    expect(OCEAN_FRAGMENT_SHADER).not.toContain('vWorldNormal');
    expect(OCEAN_FRAGMENT_SHADER).not.toContain('sampler2D');
  });
});

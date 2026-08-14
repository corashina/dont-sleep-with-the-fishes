// Importance: 4/5. Protects the low-cost graded ocean horizon geometry.
import {
  type BufferAttribute,
  type BufferGeometry,
  Color,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  OCEAN_SURFACE_QUALITY,
  OceanRenderer,
  type OceanSurfaceQuality,
} from '../src/ocean/OceanRenderer';
import {
  createInactiveVortexWaveState,
  type VortexWaveState,
} from '../src/ocean/WaveField';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

vi.mock('three/addons/utils/BufferGeometryUtils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three/addons/utils/BufferGeometryUtils.js')>();
  return {
    ...actual,
    mergeGeometries: vi.fn(actual.mergeGeometries),
  };
});

function centerlineRadialDistances(ocean: OceanRenderer): number[] {
  const positions = ocean.horizonMesh.geometry.getAttribute(
    'position',
  ) as BufferAttribute;
  const innerHalfExtent = OCEAN_SURFACE_QUALITY.low.surfaceExtent / 2;
  const distances = new Set<number>();

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    if (Math.abs(x) > 0.0001 || z < innerHalfExtent - 0.0001) continue;
    distances.add(Number(z.toFixed(4)));
  }

  return [...distances].sort((a, b) => a - b);
}

function expectedHorizonVertexCount(
  quality: Readonly<OceanSurfaceQuality>,
): number {
  const edgeVertices = quality.segments + 1;
  const radialVertices = quality.horizonRadialSegments + 1;
  return 4 * edgeVertices * radialVertices
    + 4 * radialVertices * radialVertices;
}

function triangleCount(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  if (index === null) throw new Error('Expected indexed ocean geometry.');
  return index.count / 3;
}

describe('OceanRenderer horizon geometry', () => {
  it('keeps wave shading independent from horizon mesh density', () => {
    const ocean = new OceanRenderer('low');

    expect(ocean.material.vertexShader).toContain('geometryLod');
    expect(ocean.material.vertexShader).toContain('resolvedGeometryWave');
    expect(ocean.material.fragmentShader).toContain('sampleSurfaceWave');
    expect(ocean.material.fragmentShader).toContain(
      'sampleSurfaceWave(vOceanPosition, waveHeight, waveDerivative)',
    );
    expect(ocean.material.fragmentShader).not.toContain('vWorldNormal');

    ocean.dispose();
  });

  it('copies active and inactive vortex state into shader uniforms', () => {
    const ocean = new OceanRenderer('low');
    const active: VortexWaveState = {
      centerX: 0,
      centerZ: -7,
      radius: 8,
      depression: 1.1,
      tangentStrength: 0.8,
      phase: 0.4,
      strength: 1,
    };

    ocean.setVortex(active);
    expect(ocean.vortexStateForTest()).toEqual(active);

    active.strength = 0.25;
    expect(ocean.vortexStateForTest()!.strength).toBe(1);

    ocean.setVortex({
      centerX: Number.NaN,
      centerZ: Number.POSITIVE_INFINITY,
      radius: Number.NEGATIVE_INFINITY,
      depression: Number.NaN,
      tangentStrength: Number.POSITIVE_INFINITY,
      phase: Number.NaN,
      strength: Number.NEGATIVE_INFINITY,
    });
    expect(Object.values(ocean.vortexStateForTest()).every(Number.isFinite)).toBe(true);

    ocean.setVortex(createInactiveVortexWaveState());
    expect(ocean.vortexStateForTest()!.strength).toBe(0);
    ocean.dispose();
  });

  it.each([
    ['low', [150, 650, 0.86]],
    ['high', [180, 750, 0.82]],
    ['ultra', [210, 820, 0.78]],
  ] as const)(
    'concentrates %s quality vertices beside the surface join',
    (qualityName, expectedFog) => {
      const quality = OCEAN_SURFACE_QUALITY[qualityName];
      const ocean = new OceanRenderer(qualityName);
      const distances = centerlineRadialDistances(ocean);
      const innerHalfExtent = quality.surfaceExtent / 2;
      const nearCellSize = quality.surfaceExtent / quality.segments;
      const firstStep = distances[1]! - distances[0]!;
      const lastStep = distances.at(-1)! - distances.at(-2)!;

      expect(distances).toHaveLength(quality.horizonRadialSegments + 1);
      expect(distances[0]).toBeCloseTo(innerHalfExtent, 4);
      expect(distances.at(-1)).toBeCloseTo(quality.horizonHalfExtent, 4);
      expect(firstStep).toBeLessThanOrEqual(nearCellSize * 1.5);
      expect(firstStep).toBeLessThan(lastStep);
      expect(
        ocean.horizonMesh.geometry.getAttribute('position').count,
      ).toBe(expectedHorizonVertexCount(quality));
      expect(
        (ocean.material.uniforms.uHorizonFog!.value as Vector3).toArray(),
      ).toEqual(expectedFog);

      ocean.dispose();
    },
  );

  it('keeps Ultra geometry below twice High geometry', () => {
    const high = new OceanRenderer('high');
    const ultra = new OceanRenderer('ultra');

    expect(OCEAN_SURFACE_QUALITY.ultra.horizonRadialSegments).toBe(96);
    expect(triangleCount(ultra.mesh.geometry)).toBe(294_912);
    expect(triangleCount(ultra.mesh.geometry)).toBeLessThan(
      triangleCount(high.mesh.geometry) * 2,
    );
    expect(
      ultra.horizonMesh.geometry.getAttribute('position').count,
    ).toBeLessThan(
      high.horizonMesh.geometry.getAttribute('position').count * 2,
    );
    expect(ultra.mesh.children).toEqual([ultra.horizonMesh]);
    expect(ultra.horizonMesh.material).toBe(ultra.material);

    high.dispose();
    ultra.dispose();
  });

  it.each([
    ['low', {}],
    ['high', { HIGH_QUALITY_WATER: 1 }],
    ['ultra', { HIGH_QUALITY_WATER: 1, ULTRA_QUALITY_WATER: 1 }],
  ] as const)('uses the exact %s shader defines', (quality, expectedDefines) => {
    const ocean = new OceanRenderer(quality);

    expect(ocean.material.defines ?? {}).toEqual(expectedDefines);
    ocean.dispose();
  });

  it('keeps the four displacement waves identical in Ultra', () => {
    const low = new OceanRenderer('low');
    const ultra = new OceanRenderer('ultra');
    const parameters = (ocean: OceanRenderer): number[][] => (
      ocean.material.uniforms.uParameters!.value as Vector4[]
    ).map((value) => value.toArray());

    expect(parameters(ultra)).toEqual(parameters(low));
    expect(parameters(ultra)).toHaveLength(4);

    low.dispose();
    ultra.dispose();
  });

  it('contains a bounded procedural Ultra surface and light model', () => {
    const ocean = new OceanRenderer('ultra');
    const shader = ocean.material.fragmentShader;
    const microStart = shader.indexOf('vec2 ultraQualityMicroSlope');
    const microEnd = shader.indexOf('#endif', microStart);
    const microSource = shader.slice(microStart, microEnd);

    expect(microStart).toBeGreaterThan(-1);
    expect(microSource.match(/float band[A-D] =/g)).toHaveLength(4);
    expect(shader).toContain('float ultraSurfaceRoughness');
    expect(shader).toContain('float ultraSunGlint');
    expect(shader).toContain('ultraOpticalPath');
    expect(shader).toContain('ultraBroadReflection');
    expect(shader).toContain('ultraReflectionBlur');
    expect(shader).not.toContain('sampler2D');
    expect(
      Object.keys(ocean.material.uniforms)
        .filter((name) => name.startsWith('uUltra')),
    ).toEqual([]);
    expect(ocean.material.transparent).toBe(false);

    ocean.dispose();
  });

  it('keeps Ultra reflection below the dark-body preservation limit', () => {
    const ocean = new OceanRenderer('ultra');
    const shader = ocean.material.fragmentShader;
    const ultraStart = shader.indexOf(
      '#ifdef ULTRA_QUALITY_WATER',
      shader.indexOf('float reflectionStrength'),
    );
    const ultraEnd = shader.indexOf('#else', ultraStart);
    const ultraReflection = shader.slice(ultraStart, ultraEnd);

    expect(ultraReflection).toContain(
      '0.05 + fresnel * mix(0.63, 0.45, ultraRoughnessT)',
    );
    expect(ultraReflection).toContain('0.68');

    ocean.dispose();
  });

  it('uses bounded weather-aware Ultra foam instead of stacked High foam', () => {
    const ocean = new OceanRenderer('ultra');
    const shader = ocean.material.fragmentShader;
    const foamStart = shader.indexOf('vec2 ultraQualityFoam');
    const foamEnd = shader.indexOf('#endif', foamStart);
    const foamSource = shader.slice(foamStart, foamEnd);
    const coverageStart = shader.indexOf(
      '#ifdef ULTRA_QUALITY_WATER',
      shader.indexOf('float capFoam;'),
    );
    const coverageEnd = shader.indexOf('float capDistanceFade', coverageStart);
    const coverageElse = shader.indexOf('#else', coverageStart);
    const ultraCoverage = shader.slice(coverageStart, coverageElse);
    const nonUltraCoverage = shader.slice(coverageElse, coverageEnd);
    const colorStart = shader.lastIndexOf(
      '#ifdef ULTRA_QUALITY_WATER',
      shader.indexOf('vec3 ultraFoamColor'),
    );
    const colorEnd = shader.indexOf('float fogFactor', colorStart);
    const colorElse = shader.indexOf('#else', colorStart);
    const ultraColor = shader.slice(colorStart, colorElse);
    const nonUltraColor = shader.slice(colorElse, colorEnd);

    expect(foamStart).toBeGreaterThan(-1);
    expect(foamSource).toContain('calmSuppression');
    expect(foamSource).toContain('trailingEnvelope');
    expect(foamSource).not.toContain('for (');
    expect(shader).toContain('ultraFoamDistanceFade');
    expect(shader).toContain('ultraFoamColor');
    expect(shader).toContain('bodyFoam = max(bodyFoam * 0.42, ultraFoam.x)');
    expect(coverageElse).toBeGreaterThan(coverageStart);
    expect(ultraCoverage).not.toContain('highQualityFoamCoverage');
    expect(ultraCoverage).not.toContain('highQualityCrestCap');
    expect(nonUltraCoverage).toContain('highQualityFoamCoverage');
    expect(nonUltraCoverage).toContain('highQualityCrestCap');
    expect(colorStart).toBeGreaterThan(-1);
    expect(colorElse).toBeGreaterThan(colorStart);
    expect(ultraColor).not.toContain('highFoamLayer');
    expect(nonUltraColor).toContain('highFoamLayer');

    ocean.dispose();
  });

  it('keeps rejected Ultra storm streaks below the continuous-foam limit', () => {
    const ocean = new OceanRenderer('ultra');
    const shader = ocean.material.fragmentShader;
    const foamStart = shader.indexOf('vec2 ultraQualityFoam');
    const foamEnd = shader.indexOf('#endif', foamStart);
    const foamSource = shader.slice(foamStart, foamEnd);

    expect(foamSource).toContain(
      'crest * breaking * mix(0.12, 1.0, streakMask)',
    );
    expect(foamSource).not.toContain(
      'crest * breaking * mix(0.45, 1.0, streakMask)',
    );

    ocean.dispose();
  });

  it('rebuilds geometry and state across Low, Ultra, and High', () => {
    const ocean = new OceanRenderer('low');
    const lowSurface = ocean.mesh.geometry;
    const lowHorizon = ocean.horizonMesh.geometry;
    const lowSurfaceDispose = vi.spyOn(lowSurface, 'dispose');
    const lowHorizonDispose = vi.spyOn(lowHorizon, 'dispose');
    const lowMaterialVersion = ocean.material.version;
    const directions = ocean.material.uniforms.uDirections!.value;
    const parameters = ocean.material.uniforms.uParameters!.value;
    const phases = ocean.material.uniforms.uPhases!.value;

    ocean.setQuality('ultra');

    expect(ocean.mesh.geometry).not.toBe(lowSurface);
    expect(lowSurfaceDispose).toHaveBeenCalledOnce();
    expect(lowHorizonDispose).toHaveBeenCalledOnce();
    expect(ocean.material.version).toBe(lowMaterialVersion + 1);
    expect(ocean.material.uniforms.uDirections!.value).toBe(directions);
    expect(ocean.material.uniforms.uParameters!.value).toBe(parameters);
    expect(ocean.material.uniforms.uPhases!.value).toBe(phases);
    expect((ocean.material.uniforms.uDetailFade!.value as Vector2).toArray())
      .toEqual([52, 160]);
    expect((ocean.material.uniforms.uHorizonFog!.value as Vector3).toArray())
      .toEqual([210, 820, 0.78]);
    expect((ocean.material.uniforms.uDeepColor!.value as Color).getHex())
      .toBe(0x062932);
    expect((ocean.material.uniforms.uShallowColor!.value as Color).getHex())
      .toBe(0x2f7377);
    expect((ocean.material.uniforms.uFoamColor!.value as Color).getHex())
      .toBe(0xc6cdc4);
    expect(ocean.material.defines).toEqual({
      HIGH_QUALITY_WATER: 1,
      ULTRA_QUALITY_WATER: 1,
    });
    const ultraSurface = ocean.mesh.geometry;
    const ultraHorizon = ocean.horizonMesh.geometry;
    const ultraSurfaceDispose = vi.spyOn(ultraSurface, 'dispose');
    const ultraHorizonDispose = vi.spyOn(ultraHorizon, 'dispose');
    const ultraMaterialVersion = ocean.material.version;

    ocean.setQuality('high');

    expect(ocean.mesh.geometry).not.toBe(ultraSurface);
    expect(ultraSurfaceDispose).toHaveBeenCalledOnce();
    expect(ultraHorizonDispose).toHaveBeenCalledOnce();
    expect(ocean.material.version).toBe(ultraMaterialVersion + 1);
    expect((ocean.material.uniforms.uDetailFade!.value as Vector2).toArray())
      .toEqual([40, 128]);
    expect((ocean.material.uniforms.uDeepColor!.value as Color).getHex())
      .toBe(0x073844);
    expect(ocean.material.defines).toEqual({ HIGH_QUALITY_WATER: 1 });
    ocean.dispose();
  });

  it('rolls back a failed horizon replacement without changing renderer state', () => {
    const ocean = new OceanRenderer('low');
    const surface = ocean.mesh.geometry;
    const horizon = ocean.horizonMesh.geometry;
    const surfaceDispose = vi.spyOn(surface, 'dispose');
    const horizonDispose = vi.spyOn(horizon, 'dispose');
    const detailFade = (ocean.material.uniforms.uDetailFade!.value as Vector2)
      .clone();
    const horizonFog = (ocean.material.uniforms.uHorizonFog!.value as Vector3)
      .clone();
    const deepColor = (ocean.material.uniforms.uDeepColor!.value as Color).clone();
    const shallowColor = (ocean.material.uniforms.uShallowColor!.value as Color).clone();
    const foamColor = (ocean.material.uniforms.uFoamColor!.value as Color).clone();
    const defines = ocean.material.defines;
    const materialVersion = ocean.material.version;
    const failure = new Error('horizon build failed');

    vi.mocked(mergeGeometries).mockImplementationOnce(() => {
      throw failure;
    });

    expect(() => ocean.setQuality('ultra')).toThrow(failure);
    expect(ocean.mesh.geometry).toBe(surface);
    expect(ocean.horizonMesh.geometry).toBe(horizon);
    expect(surfaceDispose).not.toHaveBeenCalled();
    expect(horizonDispose).not.toHaveBeenCalled();
    expect((ocean as unknown as { quality: string }).quality).toBe('low');
    expect(ocean.material.defines).toBe(defines);
    expect(ocean.material.version).toBe(materialVersion);
    expect(ocean.material.uniforms.uDetailFade!.value).toEqual(detailFade);
    expect(ocean.material.uniforms.uHorizonFog!.value).toEqual(horizonFog);
    expect(ocean.material.uniforms.uDeepColor!.value).toEqual(deepColor);
    expect(ocean.material.uniforms.uShallowColor!.value).toEqual(shallowColor);
    expect(ocean.material.uniforms.uFoamColor!.value).toEqual(foamColor);

    ocean.dispose();
  });

  it('disposes safely after a quality change', () => {
    const ocean = new OceanRenderer('low');

    ocean.setQuality('ultra');
    expect(() => ocean.dispose()).not.toThrow();
    expect(() => ocean.dispose()).not.toThrow();
  });
});

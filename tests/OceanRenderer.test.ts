// Importance: 4/5. Protects the low-cost graded ocean horizon geometry.
import { type BufferAttribute, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  OCEAN_SURFACE_QUALITY,
  OceanRenderer,
  type OceanSurfaceQuality,
} from '../src/ocean/OceanRenderer';
import {
  createInactiveVortexWaveState,
  type VortexWaveState,
} from '../src/ocean/WaveField';

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

describe('OceanRenderer horizon geometry', () => {
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

  it('rebuilds the graded horizon when quality changes', () => {
    const ocean = new OceanRenderer('low');

    ocean.setQuality('high');

    const quality = OCEAN_SURFACE_QUALITY.high;
    const distances = centerlineRadialDistances(ocean);
    expect(distances).toHaveLength(quality.horizonRadialSegments + 1);
    expect(distances[1]! - distances[0]!).toBeLessThanOrEqual(
      (quality.surfaceExtent / quality.segments) * 1.5,
    );
    expect(
      ocean.horizonMesh.geometry.getAttribute('position').count,
    ).toBe(expectedHorizonVertexCount(quality));
    expect(ocean.material.uniforms.uHorizonHaze).toBeUndefined();
    expect(
      ocean.material.uniforms.uDistantDetailStrength,
    ).toBeUndefined();
    expect(
      (ocean.material.uniforms.uHorizonFog!.value as Vector3).toArray(),
    ).toEqual([180, 750, 0.82]);
    ocean.dispose();
  });

  it('disposes safely after a quality change', () => {
    const ocean = new OceanRenderer('low');

    ocean.setQuality('high');
    expect(() => ocean.dispose()).not.toThrow();
    expect(() => ocean.dispose()).not.toThrow();
  });
});

// Importance: 8/10. Protects exact ocean surface and graded horizon geometry.
import {
  BufferGeometry,
  PlaneGeometry,
  type BufferAttribute,
} from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as oceanGeometry from '../src/ocean/oceanGeometry';
import {
  createOceanHorizonGeometry,
  createOceanSurfaceGeometry,
} from '../src/ocean/oceanGeometry';

vi.mock('three/addons/utils/BufferGeometryUtils.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('three/addons/utils/BufferGeometryUtils.js')
  >();
  return {
    ...actual,
    mergeGeometries: vi.fn(actual.mergeGeometries),
  };
});

interface OceanSurfaceQuality {
  readonly segments: number;
  readonly surfaceExtent: number;
  readonly horizonHalfExtent: number;
  readonly horizonRadialSegments: number;
  readonly horizonRadialExponent: number;
}

const OCEAN_SURFACE_QUALITY = Object.freeze({
  low: Object.freeze({
    segments: 192,
    surfaceExtent: 180,
    horizonHalfExtent: 1100,
    horizonRadialSegments: 48,
    horizonRadialExponent: 1.75,
  }),
  high: Object.freeze({
    segments: 288,
    surfaceExtent: 180,
    horizonHalfExtent: 1100,
    horizonRadialSegments: 72,
    horizonRadialExponent: 1.75,
  }),
  ultra: Object.freeze({
    segments: 384,
    surfaceExtent: 180,
    horizonHalfExtent: 1100,
    horizonRadialSegments: 96,
    horizonRadialExponent: 1.75,
  }),
}) satisfies Readonly<Record<string, Readonly<OceanSurfaceQuality>>>;

const QUALITY_FIXTURES = [
  ['low', 192, 48, 37_249, 221_184, 47_432, 276_480, Uint16Array],
  ['high', 288, 72, 83_521, 497_664, 105_704, 622_080, Uint32Array],
  ['ultra', 384, 96, 148_225, 884_736, 187_016, 1_105_920, Uint32Array],
] as const;

const GEOMETRY_HASHES = {
  low: {
    surface: {
      position: '63305a99',
      normal: '21bacc8c',
      uv: '18302ee9',
      index: '88d5ae2a',
    },
    horizon: {
      position: '7aaa8c25',
      normal: '6b062655',
      uv: '328b2335',
      index: '825b96f1',
    },
  },
  high: {
    surface: {
      position: 'ad59d339',
      normal: 'aa05850c',
      uv: 'cb5f6e25',
      index: '0d600e82',
    },
    horizon: {
      position: 'dc9fe3b1',
      normal: '20f7f995',
      uv: 'fdbd93f5',
      index: '85c620db',
    },
  },
  ultra: {
    surface: {
      position: 'badc38dd',
      normal: '9676338c',
      uv: '6450a451',
      index: 'ea193256',
    },
    horizon: {
      position: '2c94bc5d',
      normal: '368295d5',
      uv: '851f1045',
      index: '6bd1d347',
    },
  },
} as const;

function hashBytes(array: ArrayLike<number> & ArrayBufferView): string {
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function geometryHashes(geometry: BufferGeometry): Record<string, string> {
  return {
    position: hashBytes(geometry.getAttribute('position').array),
    normal: hashBytes(geometry.getAttribute('normal').array),
    uv: hashBytes(geometry.getAttribute('uv').array),
    index: hashBytes(geometry.getIndex()!.array),
  };
}

function expectAttributeLayout(geometry: BufferGeometry): void {
  expect(Object.keys(geometry.attributes)).toEqual(['position', 'normal', 'uv']);
  for (const [name, itemSize] of [
    ['position', 3],
    ['normal', 3],
    ['uv', 2],
  ] as const) {
    const attribute = geometry.getAttribute(name) as BufferAttribute;
    expect(attribute.itemSize).toBe(itemSize);
    expect(attribute.array).toBeInstanceOf(Float32Array);
  }
}

function expectDefaultBoundsAndRanges(geometry: BufferGeometry): void {
  expect(geometry.boundingBox).toBeNull();
  expect(geometry.boundingSphere).toBeNull();
  expect(geometry.groups).toEqual([]);
  expect(geometry.drawRange).toEqual({ start: 0, count: Infinity });
}

function panelEndpoint(
  positions: BufferAttribute,
  start: number,
  count: number,
): readonly [readonly [number, number], readonly [number, number]] {
  return [
    [positions.getX(start), positions.getZ(start)],
    [positions.getX(start + count - 1), positions.getZ(start + count - 1)],
  ];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('oceanGeometry', () => {
  it('exports only the two public geometry builders', () => {
    expect(Object.keys(oceanGeometry).sort()).toEqual([
      'createOceanHorizonGeometry',
      'createOceanSurfaceGeometry',
    ]);
  });

  it.each(QUALITY_FIXTURES)(
    'builds exact %s surface and horizon buffers',
    (
      qualityName,
      segments,
      radialSegments,
      surfaceVertices,
      surfaceIndices,
      horizonVertices,
      horizonIndices,
      IndexArray,
    ) => {
      const quality = OCEAN_SURFACE_QUALITY[qualityName];
      const surface = createOceanSurfaceGeometry(quality);
      const horizon = createOceanHorizonGeometry(quality);
      try {
        expect(quality.segments).toBe(segments);
        expect(quality.horizonRadialSegments).toBe(radialSegments);
        expect(surface).toBeInstanceOf(PlaneGeometry);
        expect(surface.getAttribute('position').count).toBe(surfaceVertices);
        expect(surface.getIndex()!.count).toBe(surfaceIndices);
        expect(surface.getIndex()!.array).toBeInstanceOf(IndexArray);
        expect(horizon.getAttribute('position').count).toBe(horizonVertices);
        expect(horizon.getIndex()!.count).toBe(horizonIndices);
        expect(horizon.getIndex()!.array).toBeInstanceOf(IndexArray);
        expectAttributeLayout(surface);
        expectAttributeLayout(horizon);
        expectDefaultBoundsAndRanges(surface);
        expectDefaultBoundsAndRanges(horizon);
        expect(geometryHashes(surface)).toEqual(
          GEOMETRY_HASHES[qualityName].surface,
        );
        expect(geometryHashes(horizon)).toEqual(
          GEOMETRY_HASHES[qualityName].horizon,
        );
      } finally {
        surface.dispose();
        horizon.dispose();
      }
    },
  );

  it.each(QUALITY_FIXTURES)(
    'keeps the exact %s horizon panel order and endpoints',
    (qualityName) => {
      const quality = OCEAN_SURFACE_QUALITY[qualityName];
      const horizon = createOceanHorizonGeometry(quality);
      try {
        const positions = horizon.getAttribute('position') as BufferAttribute;
        const edgePanelVertices = (
          (quality.segments + 1) * (quality.horizonRadialSegments + 1)
        );
        const cornerPanelVertices = (quality.horizonRadialSegments + 1) ** 2;
        const expected = [
          [[-90, 90], [90, 1100]],
          [[-90, -1100], [90, -90]],
          [[90, -90], [1100, 90]],
          [[-1100, -90], [-90, 90]],
          [[90, 90], [1100, 1100]],
          [[90, -1100], [1100, -90]],
          [[-1100, 90], [-90, 1100]],
          [[-1100, -1100], [-90, -90]],
        ] as const;
        let start = 0;
        expected.forEach((endpoints, index) => {
          const count = index < 4 ? edgePanelVertices : cornerPanelVertices;
          expect(panelEndpoint(positions, start, count)).toEqual(endpoints);
          start += count;
        });
        expect(start).toBe(positions.count);
      } finally {
        horizon.dispose();
      }
    },
  );

  it('uses the exact radial grading equation', () => {
    const quality = OCEAN_SURFACE_QUALITY.low;
    const horizon = createOceanHorizonGeometry(quality);
    try {
      const positions = horizon.getAttribute('position') as BufferAttribute;
      const rowSize = quality.segments + 1;
      const radialIndex = 17;
      const actual = positions.getZ(radialIndex * rowSize);
      const progress = radialIndex / quality.horizonRadialSegments;
      const expected = 90 + 1010 * Math.pow(progress, 1.75);
      expect(actual).toBeCloseTo(expected, 4);
    } finally {
      horizon.dispose();
    }
  });

  it('disposes all panels when merge returns null', () => {
    const dispose = vi.spyOn(PlaneGeometry.prototype, 'dispose');
    vi.mocked(mergeGeometries).mockReturnValueOnce(
      null as unknown as BufferGeometry,
    );

    expect(() => createOceanHorizonGeometry(
      OCEAN_SURFACE_QUALITY.low,
    )).toThrow('Unable to build ocean horizon geometry.');
    expect(dispose).toHaveBeenCalledTimes(8);
  });

  it('disposes all temporary panels after a successful merge', () => {
    const dispose = vi.spyOn(PlaneGeometry.prototype, 'dispose');

    const horizon = createOceanHorizonGeometry(OCEAN_SURFACE_QUALITY.low);

    expect(dispose).toHaveBeenCalledTimes(8);
    horizon.dispose();
  });

  it('disposes all panels and preserves a merge error', () => {
    const primaryError = { source: 'merge' };
    const cleanupError = new Error('panel cleanup failed');
    const dispose = vi.spyOn(PlaneGeometry.prototype, 'dispose')
      .mockImplementationOnce(() => {
        throw cleanupError;
      });
    vi.mocked(mergeGeometries).mockImplementationOnce(() => {
      throw primaryError;
    });
    let thrown: unknown;

    try {
      createOceanHorizonGeometry(OCEAN_SURFACE_QUALITY.low);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(primaryError);
    expect(dispose).toHaveBeenCalledTimes(8);
  });

  it('disposes all panels and the merged geometry after cleanup failure', () => {
    const cleanupError = { source: 'panel cleanup' };
    const merged = new BufferGeometry();
    const mergedDispose = vi.spyOn(merged, 'dispose');
    const dispose = vi.spyOn(PlaneGeometry.prototype, 'dispose')
      .mockImplementationOnce(() => {
        throw cleanupError;
      });
    vi.mocked(mergeGeometries).mockReturnValueOnce(merged);
    let thrown: unknown;

    try {
      createOceanHorizonGeometry(OCEAN_SURFACE_QUALITY.low);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(cleanupError);
    expect(dispose).toHaveBeenCalledTimes(8);
    expect(mergedDispose).toHaveBeenCalledOnce();
  });

  it('cleans a surface when rotation fails', () => {
    const failure = { source: 'surface rotation' };
    const dispose = vi.spyOn(PlaneGeometry.prototype, 'dispose');
    vi.spyOn(PlaneGeometry.prototype, 'rotateX').mockImplementationOnce(() => {
      throw failure;
    });
    let thrown: unknown;

    try {
      createOceanSurfaceGeometry(OCEAN_SURFACE_QUALITY.low);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(failure);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('cleans the active panel when panel setup fails', () => {
    const failure = { source: 'panel setup' };
    const dispose = vi.spyOn(PlaneGeometry.prototype, 'dispose');
    vi.spyOn(PlaneGeometry.prototype, 'translate').mockImplementationOnce(() => {
      throw failure;
    });
    let thrown: unknown;

    try {
      createOceanHorizonGeometry(OCEAN_SURFACE_QUALITY.low);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(failure);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('accepts immutable quality inputs', () => {
    const quality: Readonly<OceanSurfaceQuality> = Object.freeze({
      ...OCEAN_SURFACE_QUALITY.low,
    });
    const surface = createOceanSurfaceGeometry(quality);
    const horizon = createOceanHorizonGeometry(quality);
    surface.dispose();
    horizon.dispose();
  });
});

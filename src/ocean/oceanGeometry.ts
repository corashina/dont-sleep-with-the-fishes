import {
  BufferGeometry,
  PlaneGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WaterQuality } from '../rendering/waterQuality';
import {
  ignoreCleanupError,
  runCleanupSteps,
} from '../world/SceneResources';

export interface OceanSurfaceQuality {
  readonly segments: number;
  readonly surfaceExtent: number;
  readonly horizonHalfExtent: number;
  readonly horizonRadialSegments: number;
  readonly horizonRadialExponent: number;
}

export const OCEAN_SURFACE_QUALITY = Object.freeze({
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
}) satisfies Readonly<Record<WaterQuality, Readonly<OceanSurfaceQuality>>>;

function createOceanPanel(
  width: number,
  depth: number,
  widthSegments: number,
  depthSegments: number,
  centerX: number,
  centerZ: number,
  grading?: Readonly<{
    xDirection?: -1 | 1;
    zDirection?: -1 | 1;
    innerHalfExtent: number;
    outerHalfExtent: number;
    exponent: number;
  }>,
): PlaneGeometry {
  const panel = new PlaneGeometry(width, depth, widthSegments, depthSegments);
  try {
    panel.rotateX(-Math.PI / 2);
    panel.translate(centerX, 0, centerZ);
    if (grading) {
      const positions = panel.getAttribute('position');
      const span = grading.outerHalfExtent - grading.innerHalfExtent;
      const grade = (value: number, direction: -1 | 1): number => {
        const distance = direction * value;
        const progress = Math.min(
          1,
          Math.max(0, (distance - grading.innerHalfExtent) / span),
        );
        return direction * (
          grading.innerHalfExtent
          + span * Math.pow(progress, grading.exponent)
        );
      };
      for (let index = 0; index < positions.count; index += 1) {
        if (grading.xDirection) {
          positions.setX(
            index,
            grade(positions.getX(index), grading.xDirection),
          );
        }
        if (grading.zDirection) {
          positions.setZ(
            index,
            grade(positions.getZ(index), grading.zDirection),
          );
        }
      }
      positions.needsUpdate = true;
    }
  } catch (error) {
    ignoreCleanupError(() => panel.dispose());
    throw error;
  }
  return panel;
}

export function createOceanSurfaceGeometry(
  quality: Readonly<OceanSurfaceQuality>,
): BufferGeometry {
  const geometry = new PlaneGeometry(
    quality.surfaceExtent,
    quality.surfaceExtent,
    quality.segments,
    quality.segments,
  );
  try {
    geometry.rotateX(-Math.PI / 2);
  } catch (error) {
    ignoreCleanupError(() => geometry.dispose());
    throw error;
  }
  return geometry;
}

export function createOceanHorizonGeometry(
  quality: Readonly<OceanSurfaceQuality>,
): BufferGeometry {
  const innerHalfExtent = quality.surfaceExtent / 2;
  const outerHalfExtent = quality.horizonHalfExtent;
  const ringSpan = outerHalfExtent - innerHalfExtent;
  const ringCenter = innerHalfExtent + ringSpan / 2;
  const edgeSegments = quality.segments;
  const radialSegments = quality.horizonRadialSegments;
  const grade = (
    xDirection?: -1 | 1,
    zDirection?: -1 | 1,
  ) => ({
    xDirection,
    zDirection,
    innerHalfExtent,
    outerHalfExtent,
    exponent: quality.horizonRadialExponent,
  });
  const panels: PlaneGeometry[] = [];
  let geometry: BufferGeometry | undefined;
  let primaryFailed = false;
  try {
    panels.push(createOceanPanel(
      quality.surfaceExtent, ringSpan, edgeSegments, radialSegments,
      0, ringCenter, grade(undefined, 1),
    ));
    panels.push(createOceanPanel(
      quality.surfaceExtent, ringSpan, edgeSegments, radialSegments,
      0, -ringCenter, grade(undefined, -1),
    ));
    panels.push(createOceanPanel(
      ringSpan, quality.surfaceExtent, radialSegments, edgeSegments,
      ringCenter, 0, grade(1),
    ));
    panels.push(createOceanPanel(
      ringSpan, quality.surfaceExtent, radialSegments, edgeSegments,
      -ringCenter, 0, grade(-1),
    ));
    panels.push(createOceanPanel(
      ringSpan, ringSpan, radialSegments, radialSegments,
      ringCenter, ringCenter, grade(1, 1),
    ));
    panels.push(createOceanPanel(
      ringSpan, ringSpan, radialSegments, radialSegments,
      ringCenter, -ringCenter, grade(1, -1),
    ));
    panels.push(createOceanPanel(
      ringSpan, ringSpan, radialSegments, radialSegments,
      -ringCenter, ringCenter, grade(-1, 1),
    ));
    panels.push(createOceanPanel(
      ringSpan, ringSpan, radialSegments, radialSegments,
      -ringCenter, -ringCenter, grade(-1, -1),
    ));
    geometry = mergeGeometries(panels) ?? undefined;
    if (!geometry) {
      throw new Error('Unable to build ocean horizon geometry.');
    }
  } catch (error) {
    primaryFailed = true;
    throw error;
  } finally {
    if (primaryFailed) {
      ignoreCleanupError(() => runCleanupSteps(
        panels.map((panel) => () => panel.dispose()),
      ));
    } else {
      try {
        runCleanupSteps(panels.map((panel) => () => panel.dispose()));
      } catch (error) {
        ignoreCleanupError(() => geometry?.dispose());
        throw error;
      }
    }
  }
  return geometry;
}

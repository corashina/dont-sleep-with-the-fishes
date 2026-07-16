import { Vector3 } from 'three';
import type { WaterExclusionRegion } from '../../src/ocean/WaterExclusion';

export function pointInWaterExclusion(
  point: Vector3,
  region: WaterExclusionRegion,
): boolean {
  const local = point.clone().applyMatrix4(region.worldToLocal);
  if (region.minimumLocalY !== undefined && local.y < region.minimumLocalY) return false;
  const halfWidth = Math.max(Math.abs(region.bounds.x), Math.abs(region.bounds.y));
  const halfLength = Math.max(Math.abs(region.bounds.z), Math.abs(region.bounds.w));
  const localAbsZ = Math.abs(local.z);
  if (localAbsZ > halfLength) return false;

  const taperSpan = Math.max(halfLength - region.taperStart, 0);
  const taperProgress = taperSpan > 0
    ? Math.min(Math.max((localAbsZ - region.taperStart) / taperSpan, 0), 1)
    : 0;
  const localHalfWidth = halfWidth * Math.sqrt(Math.max(0, 1 - taperProgress ** 2));
  return Math.abs(local.x) <= localHalfWidth;
}

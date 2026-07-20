import { Vector3 } from 'three';
import {
  UNBOUNDED_MINIMUM_LOCAL_Y,
  type WaterExclusionRegion,
} from '../../src/ocean/WaterExclusion';

export function pointInWaterExclusion(
  point: Vector3,
  region: WaterExclusionRegion,
): boolean {
  const local = point.clone().applyMatrix4(region.worldToLocal);
  const minimumLocalY = region.minimumLocalY ?? UNBOUNDED_MINIMUM_LOCAL_Y;
  if (local.y < minimumLocalY) return false;
  const upperHalfWidth = Math.max(Math.abs(region.bounds.x), Math.abs(region.bounds.y));
  const upperHalfLength = Math.max(Math.abs(region.bounds.z), Math.abs(region.bounds.w));
  const lowerHalfWidth = region.lowerHalfWidth ?? upperHalfWidth;
  const lowerHalfLength = region.lowerHalfLength ?? upperHalfLength;
  const lowerTaperStart = region.lowerTaperStart ?? region.taperStart;
  const upperLocalY = region.upperLocalY ?? minimumLocalY;
  const heightSpan = Math.max(upperLocalY - minimumLocalY, 1e-4);
  const profileProgress = Math.min(1, Math.max(0, (local.y - minimumLocalY) / heightSpan));
  const halfWidth = lowerHalfWidth
    + (upperHalfWidth - lowerHalfWidth)
      * profileProgress;
  const halfLength = lowerHalfLength
    + (upperHalfLength - lowerHalfLength)
      * profileProgress;
  const taperStart = lowerTaperStart
    + (region.taperStart - lowerTaperStart) * profileProgress;
  const localAbsZ = Math.abs(local.z);
  if (localAbsZ > halfLength) return false;
  const taperSpan = Math.max(0, halfLength - taperStart);
  const taperProgress = taperSpan === 0
    ? 0
    : Math.min(1, Math.max(0, (localAbsZ - taperStart) / taperSpan));
  const localHalfWidth = halfWidth * Math.sqrt(Math.max(0, 1 - taperProgress ** 2));
  return Math.abs(local.x) <= localHalfWidth;
}

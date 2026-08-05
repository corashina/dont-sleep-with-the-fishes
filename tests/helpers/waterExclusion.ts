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
  if (local.y < minimumLocalY || local.y > region.upperLocalY) return false;
  const upperLocalY = region.upperLocalY ?? minimumLocalY;
  const heightSpan = Math.max(upperLocalY - minimumLocalY, 1e-4);
  const profileProgress = Math.min(1, Math.max(0, (local.y - minimumLocalY) / heightSpan));
  const mix = (lower: number, upper: number): number =>
    lower + (upper - lower) * profileProgress;
  const minX = mix(region.lowerBounds.x, region.bounds.x);
  const maxX = mix(region.lowerBounds.y, region.bounds.y);
  const minZ = mix(region.lowerBounds.z, region.bounds.z);
  const maxZ = mix(region.lowerBounds.w, region.bounds.w);
  if (local.z < minZ || local.z > maxZ) return false;
  const taperStartMinZ = mix(region.lowerTaperStarts.x, region.taperStarts.x);
  const taperStartMaxZ = mix(region.lowerTaperStarts.y, region.taperStarts.y);
  let taperProgress = 0;
  if (local.z < taperStartMinZ) {
    const taperSpan = Math.max(0, taperStartMinZ - minZ);
    taperProgress = taperSpan === 0
      ? 0
      : Math.min(1, Math.max(0, (taperStartMinZ - local.z) / taperSpan));
  } else if (local.z > taperStartMaxZ) {
    const taperSpan = Math.max(0, maxZ - taperStartMaxZ);
    taperProgress = taperSpan === 0
      ? 0
      : Math.min(1, Math.max(0, (local.z - taperStartMaxZ) / taperSpan));
  }
  const halfWidth = (maxX - minX) / 2;
  const centerX = (minX + maxX) / 2;
  const localHalfWidth = halfWidth * Math.sqrt(Math.max(0, 1 - taperProgress ** 2));
  return Math.abs(local.x - centerX) <= localHalfWidth;
}

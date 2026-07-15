import { Vector3 } from 'three';
import type { WaterExclusionRegion } from '../../src/ocean/WaterExclusion';

export function pointInWaterExclusion(
  point: Vector3,
  region: WaterExclusionRegion,
): boolean {
  const local = point.clone().applyMatrix4(region.worldToLocal);
  return local.x >= region.bounds.x && local.x <= region.bounds.y
    && local.z >= region.bounds.z && local.z <= region.bounds.w;
}

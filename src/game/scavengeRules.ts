export const SCAVENGE_DURATION_SECONDS = 60;

export interface RectXZ {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface PointXZ {
  readonly x: number;
  readonly z: number;
}

export function containsPointXZ(bounds: RectXZ, point: PointXZ): boolean {
  return point.x >= bounds.minX
    && point.x <= bounds.maxX
    && point.z >= bounds.minZ
    && point.z <= bounds.maxZ;
}

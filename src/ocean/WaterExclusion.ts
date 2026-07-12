import { Matrix4, type Object3D, Vector3, Vector4 } from 'three';

export interface WaterExclusionRegion {
  worldToLocal: Matrix4;
  bounds: Vector4;
}

export function createWaterExclusion(
  object: Object3D,
  halfWidth: number,
  halfLength: number,
): WaterExclusionRegion {
  object.updateWorldMatrix(true, false);
  return {
    worldToLocal: object.matrixWorld.clone().invert(),
    bounds: new Vector4(-halfWidth, halfWidth, -halfLength, halfLength),
  };
}

export function pointInWaterExclusion(
  point: Vector3,
  region: WaterExclusionRegion,
): boolean {
  const local = point.clone().applyMatrix4(region.worldToLocal);
  return local.x >= region.bounds.x && local.x <= region.bounds.y
    && local.z >= region.bounds.z && local.z <= region.bounds.w;
}

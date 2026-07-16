import { Matrix4, type Object3D, Vector4 } from 'three';

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

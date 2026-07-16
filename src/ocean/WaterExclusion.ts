import { Matrix4, type Object3D, Vector4 } from 'three';

export const UNBOUNDED_MINIMUM_LOCAL_Y = -1_000_000;

export interface WaterExclusionRegion {
  worldToLocal: Matrix4;
  bounds: Vector4;
  taperStart: number;
  minimumLocalY?: number;
}

export function createWaterExclusion(
  object: Object3D,
  halfWidth: number,
  halfLength: number,
  taperStart: number = halfLength,
  minimumLocalY?: number,
): WaterExclusionRegion {
  object.updateWorldMatrix(true, false);
  return {
    worldToLocal: object.matrixWorld.clone().invert(),
    bounds: new Vector4(-halfWidth, halfWidth, -halfLength, halfLength),
    taperStart,
    minimumLocalY,
  };
}

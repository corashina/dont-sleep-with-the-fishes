import { Matrix4, type Object3D, Vector4 } from 'three';

export const UNBOUNDED_MINIMUM_LOCAL_Y = -1_000_000;

export interface WaterExclusionHeightProfile {
  readonly lowerHalfWidth: number;
  readonly lowerHalfLength: number;
  readonly lowerTaperStart: number;
  readonly upperLocalY: number;
}

export interface WaterExclusionRegion {
  worldToLocal: Matrix4;
  bounds: Vector4;
  taperStart: number;
  minimumLocalY?: number;
  lowerHalfWidth: number;
  lowerHalfLength: number;
  lowerTaperStart: number;
  upperLocalY: number;
}

export function createWaterExclusion(
  object: Object3D,
  halfWidth: number,
  halfLength: number,
  taperStart: number = halfLength,
  minimumLocalY?: number,
  heightProfile?: WaterExclusionHeightProfile,
): WaterExclusionRegion {
  object.updateWorldMatrix(true, false);
  return {
    worldToLocal: object.matrixWorld.clone().invert(),
    bounds: new Vector4(-halfWidth, halfWidth, -halfLength, halfLength),
    taperStart,
    minimumLocalY,
    lowerHalfWidth: heightProfile?.lowerHalfWidth ?? halfWidth,
    lowerHalfLength: heightProfile?.lowerHalfLength ?? halfLength,
    lowerTaperStart: heightProfile?.lowerTaperStart ?? taperStart,
    upperLocalY: heightProfile?.upperLocalY
      ?? (minimumLocalY ?? UNBOUNDED_MINIMUM_LOCAL_Y),
  };
}

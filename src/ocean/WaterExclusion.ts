import { Matrix4, type Object3D, Vector2, Vector4 } from 'three';

export const UNBOUNDED_MINIMUM_LOCAL_Y = -1_000_000;
export const UNBOUNDED_MAXIMUM_LOCAL_Y = 1_000_000;

export interface WaterExclusionHeightProfile {
  readonly lowerHalfWidth: number;
  readonly lowerHalfLength: number;
  readonly lowerTaperStart: number;
  readonly upperLocalY: number;
}

export interface WaterExclusionLongitudinalProfile {
  readonly minZ: number;
  readonly maxZ: number;
  readonly taperStartMinZ: number;
  readonly taperStartMaxZ: number;
  readonly lowerMinZ: number;
  readonly lowerMaxZ: number;
  readonly lowerTaperStartMinZ: number;
  readonly lowerTaperStartMaxZ: number;
}

export interface WaterExclusionRegion {
  worldToLocal: Matrix4;
  bounds: Vector4;
  taperStarts: Vector2;
  minimumLocalY?: number;
  lowerBounds: Vector4;
  lowerTaperStarts: Vector2;
  upperLocalY: number;
}

export function createWaterExclusion(
  object: Object3D,
  halfWidth: number,
  halfLength: number,
  taperStart: number = halfLength,
  minimumLocalY?: number,
  heightProfile?: WaterExclusionHeightProfile,
  longitudinalProfile?: WaterExclusionLongitudinalProfile,
): WaterExclusionRegion {
  object.updateWorldMatrix(true, false);
  const lowerHalfWidth = heightProfile?.lowerHalfWidth ?? halfWidth;
  const lowerHalfLength = heightProfile?.lowerHalfLength ?? halfLength;
  const lowerTaperStart = heightProfile?.lowerTaperStart ?? taperStart;
  return {
    worldToLocal: object.matrixWorld.clone().invert(),
    bounds: new Vector4(
      -halfWidth,
      halfWidth,
      longitudinalProfile?.minZ ?? -halfLength,
      longitudinalProfile?.maxZ ?? halfLength,
    ),
    taperStarts: new Vector2(
      longitudinalProfile?.taperStartMinZ ?? -taperStart,
      longitudinalProfile?.taperStartMaxZ ?? taperStart,
    ),
    minimumLocalY,
    lowerBounds: new Vector4(
      -lowerHalfWidth,
      lowerHalfWidth,
      longitudinalProfile?.lowerMinZ ?? -lowerHalfLength,
      longitudinalProfile?.lowerMaxZ ?? lowerHalfLength,
    ),
    lowerTaperStarts: new Vector2(
      longitudinalProfile?.lowerTaperStartMinZ ?? -lowerTaperStart,
      longitudinalProfile?.lowerTaperStartMaxZ ?? lowerTaperStart,
    ),
    upperLocalY: heightProfile?.upperLocalY ?? UNBOUNDED_MAXIMUM_LOCAL_Y,
  };
}

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
  return {
    worldToLocal: object.matrixWorld.clone().invert(),
    bounds: createUpperBounds(halfWidth, halfLength, longitudinalProfile),
    taperStarts: createUpperTaperStarts(taperStart, longitudinalProfile),
    minimumLocalY,
    lowerBounds: createLowerBounds(halfWidth, halfLength, heightProfile, longitudinalProfile),
    lowerTaperStarts: createLowerTaperStarts(taperStart, heightProfile, longitudinalProfile),
    upperLocalY: heightProfile?.upperLocalY ?? UNBOUNDED_MAXIMUM_LOCAL_Y,
  };
}

function createUpperBounds(
  halfWidth: number,
  halfLength: number,
  profile: WaterExclusionLongitudinalProfile | undefined,
): Vector4 {
  return new Vector4(-halfWidth, halfWidth, profile?.minZ ?? -halfLength, profile?.maxZ ?? halfLength);
}

function createUpperTaperStarts(
  taperStart: number,
  profile: WaterExclusionLongitudinalProfile | undefined,
): Vector2 {
  return new Vector2(profile?.taperStartMinZ ?? -taperStart, profile?.taperStartMaxZ ?? taperStart);
}

function createLowerBounds(
  halfWidth: number,
  halfLength: number,
  heightProfile: WaterExclusionHeightProfile | undefined,
  longitudinalProfile: WaterExclusionLongitudinalProfile | undefined,
): Vector4 {
  const lowerHalfWidth = heightProfile?.lowerHalfWidth ?? halfWidth;
  const lowerHalfLength = heightProfile?.lowerHalfLength ?? halfLength;
  return new Vector4(
    -lowerHalfWidth,
    lowerHalfWidth,
    longitudinalProfile?.lowerMinZ ?? -lowerHalfLength,
    longitudinalProfile?.lowerMaxZ ?? lowerHalfLength,
  );
}

function createLowerTaperStarts(
  taperStart: number,
  heightProfile: WaterExclusionHeightProfile | undefined,
  longitudinalProfile: WaterExclusionLongitudinalProfile | undefined,
): Vector2 {
  const lowerTaperStart = heightProfile?.lowerTaperStart ?? taperStart;
  return new Vector2(
    longitudinalProfile?.lowerTaperStartMinZ ?? -lowerTaperStart,
    longitudinalProfile?.lowerTaperStartMaxZ ?? lowerTaperStart,
  );
}

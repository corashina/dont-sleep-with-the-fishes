import { Box3, type Object3D, type PerspectiveCamera, Vector3 } from 'three';
import { ITEM_DEFINITIONS, ITEM_IDS, type ItemId } from '../game/ItemState';
import {
  projectObjectScreenBounds,
  projectScreenBounds,
  type ProjectedScreenBounds,
} from '../rendering/projectScreenBounds';
import type { DayActionId } from './survivalTypes';
import type { BoatSupplyGroupId } from '../world/BoatSupplyLayout';

export const ACTION_FOR_ITEM = Object.freeze(Object.fromEntries(
  ITEM_IDS.flatMap((id) => {
    const action = ITEM_DEFINITIONS[id].dayAction;
    return action === null ? [] : [[id, action]];
  }),
) as Readonly<Partial<Record<ItemId, DayActionId>>>);

export interface BoatInteractionHitArea {
  width: number;
  height: number;
  depth: number;
}

export type ProjectedBoatBounds = ProjectedScreenBounds;

export type BoatToolId = 'repairTools' | 'fishingRod';

export interface BoatInteractionAnchor {
  readonly id: string;
  readonly itemType: ItemId | null;
  readonly supplyGroupId?: BoatSupplyGroupId;
  readonly toolId: BoatToolId | null;
  readonly action: DayActionId | null;
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
  readonly depleted: boolean;
  readonly remainingUses: number | null;
  readonly quantity?: number;
  readonly usableQuantity?: number;
  readonly brokenQuantity?: number;
  readonly backingInstanceId?: import('../game/ItemState').ItemInstanceId | null;
  readonly hitArea?: BoatInteractionHitArea;
}

export function projectBoatBounds(
  bounds: Box3,
  camera: PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
): ProjectedBoatBounds {
  return projectScreenBounds(bounds, camera, viewportWidth, viewportHeight);
}

export function projectBoatObjectBounds(
  root: Object3D,
  camera: PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
): ProjectedBoatBounds {
  return projectObjectScreenBounds(root, camera, viewportWidth, viewportHeight);
}

export function projectBoatAnchor(
  worldPosition: Vector3,
  camera: PerspectiveCamera,
  width: number,
  height: number,
): Pick<BoatInteractionAnchor, 'x' | 'y' | 'visible'> {
  camera.updateWorldMatrix(true, false);
  const cameraSpace = worldPosition.clone().applyMatrix4(camera.matrixWorldInverse);
  const projected = worldPosition.clone().project(camera);
  return {
    x: (projected.x * 0.5 + 0.5) * width,
    y: (-projected.y * 0.5 + 0.5) * height,
    visible: cameraSpace.z < 0
      && Math.abs(projected.x) <= 1
      && Math.abs(projected.y) <= 1,
  };
}

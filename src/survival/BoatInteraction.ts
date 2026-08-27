import { Box3, type Object3D, type PerspectiveCamera, Vector3 } from 'three';
import type { ItemId } from '../game/ItemState';
import {
  createObjectScreenBoundsCache,
  projectCachedObjectScreenBounds,
  projectCachedObjectScreenBoundsInto,
  projectObjectScreenBounds,
  projectObjectScreenBoundsInto,
  projectScreenBounds,
  type ObjectScreenBoundsCache,
  type ProjectedScreenBounds,
} from '../rendering/projectScreenBounds';
import type { DayActionId, EventResponseId } from './survivalTypes';
import type { BoatSupplyGroupId } from '../world/BoatStorage';
import type { InspectableEventId } from './eventCatalog';

export interface BoatInteractionHitArea {
  width: number;
  height: number;
  depth: number;
}

export type ProjectedBoatBounds = ProjectedScreenBounds;
export type BoatObjectBoundsCache = ObjectScreenBoundsCache;

export type BoatToolId = 'repairTools' | 'fishingRod' | 'pillow' | 'chest';

export interface BoatInteractionAnchor {
  readonly id: string;
  readonly companionId?: 'carlitos';
  readonly label?: string;
  readonly description?: string;
  readonly tooltip?: boolean;
  readonly eventChoiceId?: EventResponseId;
  readonly eventFocusId?: InspectableEventId;
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

export function projectBoatObjectBoundsInto(
  output: ProjectedBoatBounds,
  root: Object3D,
  camera: PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
): ProjectedBoatBounds {
  return projectObjectScreenBoundsInto(
    output,
    root,
    camera,
    viewportWidth,
    viewportHeight,
  );
}

export function createBoatObjectBoundsCache(
  root: Object3D,
): BoatObjectBoundsCache | null {
  return createObjectScreenBoundsCache(root);
}

export function projectCachedBoatObjectBounds(
  root: Object3D,
  cache: BoatObjectBoundsCache | null,
  camera: PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
): ProjectedBoatBounds {
  return projectCachedObjectScreenBounds(
    root,
    cache,
    camera,
    viewportWidth,
    viewportHeight,
  );
}

export function projectCachedBoatObjectBoundsInto(
  output: ProjectedBoatBounds,
  root: Object3D,
  cache: BoatObjectBoundsCache | null,
  camera: PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
): ProjectedBoatBounds {
  return projectCachedObjectScreenBoundsInto(
    output,
    root,
    cache,
    camera,
    viewportWidth,
    viewportHeight,
  );
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

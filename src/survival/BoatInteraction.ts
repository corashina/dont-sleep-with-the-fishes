import type { Object3D, PerspectiveCamera } from 'three';
import type { ItemId } from '../game/ItemState';
import {
  createObjectScreenBoundsCache,
  projectCachedObjectScreenBoundsInto,
  projectObjectScreenBoundsInto,
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

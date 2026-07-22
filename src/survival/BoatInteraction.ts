import { Box3, type PerspectiveCamera, Vector3 } from 'three';
import { ITEM_DEFINITIONS, ITEM_IDS, type ItemId } from '../game/ItemState';
import type { DayActionId } from './survivalTypes';

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

export interface ProjectedBoatBounds extends BoatInteractionHitArea {
  x: number;
  y: number;
  visible: boolean;
}

export type BoatToolId = 'repairTools' | 'fishingRod';

export interface BoatInteractionAnchor {
  readonly id: string;
  readonly itemType: ItemId | null;
  readonly toolId: BoatToolId | null;
  readonly action: DayActionId | null;
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
  readonly depleted: boolean;
  readonly remainingUses: number | null;
  readonly hitArea?: BoatInteractionHitArea;
}

const TARGET_PADDING = 8;
const MINIMUM_TARGET = 44;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

function hiddenBounds(): ProjectedBoatBounds {
  return { x: 0, y: 0, width: 0, height: 0, depth: 0, visible: false };
}

function cornersOf(bounds: Box3): Vector3[] {
  const { min, max } = bounds;
  return [
    new Vector3(min.x, min.y, min.z),
    new Vector3(min.x, min.y, max.z),
    new Vector3(min.x, max.y, min.z),
    new Vector3(min.x, max.y, max.z),
    new Vector3(max.x, min.y, min.z),
    new Vector3(max.x, min.y, max.z),
    new Vector3(max.x, max.y, min.z),
    new Vector3(max.x, max.y, max.z),
  ];
}

export function projectBoatBounds(
  bounds: Box3,
  camera: PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
): ProjectedBoatBounds {
  if (bounds.isEmpty() || viewportWidth <= 0 || viewportHeight <= 0) return hiddenBounds();
  camera.updateWorldMatrix(true, false);
  const center = bounds.getCenter(new Vector3());
  const cameraCenter = center.clone().applyMatrix4(camera.matrixWorldInverse);
  if (cameraCenter.z >= 0) return hiddenBounds();

  const screenPoints = cornersOf(bounds).map((corner) => {
    const projected = corner.project(camera);
    return {
      x: (projected.x * 0.5 + 0.5) * viewportWidth,
      y: (-projected.y * 0.5 + 0.5) * viewportHeight,
    };
  });
  if (screenPoints.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))) return hiddenBounds();

  const rawLeft = Math.min(...screenPoints.map(({ x }) => x));
  const rawRight = Math.max(...screenPoints.map(({ x }) => x));
  const rawTop = Math.min(...screenPoints.map(({ y }) => y));
  const rawBottom = Math.max(...screenPoints.map(({ y }) => y));
  if (rawRight < 0 || rawLeft > viewportWidth || rawBottom < 0 || rawTop > viewportHeight) return hiddenBounds();

  const clippedLeft = clamp(rawLeft - TARGET_PADDING, 0, viewportWidth);
  const clippedRight = clamp(rawRight + TARGET_PADDING, 0, viewportWidth);
  const clippedTop = clamp(rawTop - TARGET_PADDING, 0, viewportHeight);
  const clippedBottom = clamp(rawBottom + TARGET_PADDING, 0, viewportHeight);
  const width = Math.min(viewportWidth, Math.max(MINIMUM_TARGET, clippedRight - clippedLeft));
  const height = Math.min(viewportHeight, Math.max(MINIMUM_TARGET, clippedBottom - clippedTop));
  const rawX = (clippedLeft + clippedRight) / 2;
  const rawY = (clippedTop + clippedBottom) / 2;

  return {
    x: clamp(rawX, width / 2, viewportWidth - width / 2),
    y: clamp(rawY, height / 2, viewportHeight - height / 2),
    width,
    height,
    depth: -cameraCenter.z,
    visible: true,
  };
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

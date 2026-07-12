import type { PerspectiveCamera, Vector3 } from 'three';
import { RUNTIME_ITEM_IDS, runtimeItemDefinition } from '../canonical/items';
import type { ItemId } from '../game/ItemState';
import type { DayActionId } from './survivalTypes';

export const ACTION_FOR_ITEM = Object.freeze(Object.fromEntries(
  RUNTIME_ITEM_IDS.flatMap((itemId) => {
    const action = runtimeItemDefinition(itemId).dayAction;
    return action === null ? [] : [[itemId, action]];
  }),
)) as Readonly<Partial<Record<ItemId, DayActionId>>>;

export interface BoatInteractionAnchor {
  id: string;
  itemType: ItemId | null;
  action: DayActionId | null;
  x: number;
  y: number;
  visible: boolean;
  depleted: boolean;
  remainingUses: number | null;
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

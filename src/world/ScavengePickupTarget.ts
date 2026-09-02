import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { type ItemId } from '../game/ItemState';
import { ITEM_MODEL_SPECS } from './itemModelManifest';

const EXPANDED_PICKUP_ITEM_IDS: ReadonlySet<ItemId> = new Set([
  'fishingNet',
  'swimRing',
  'anchor',
  'ductTape',
]);

export const SCAVENGE_PICKUP_TARGET_NAME = 'scavenge-pickup-target';

export function addScavengePickupTarget(root: Group, itemId: ItemId): void {
  if (!EXPANDED_PICKUP_ITEM_IDS.has(itemId)) return;

  const { min, max } = ITEM_MODEL_SPECS[itemId].normalizedBounds;
  const target = new Mesh(
    new BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]),
    new MeshBasicMaterial(),
  );
  target.name = SCAVENGE_PICKUP_TARGET_NAME;
  target.position.set(
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  );
  target.visible = false;
  root.add(target);
}

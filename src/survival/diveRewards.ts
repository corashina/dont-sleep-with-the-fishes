import { ITEM_DEFINITIONS, ITEM_IDS, type ItemId } from '../game/ItemState';
import { drawMissingItem } from './itemRewards';
import type { RandomSource } from './survivalTypes';

export function drawDiveItem(
  ownedItemIds: ReadonlySet<ItemId>,
  random: RandomSource,
): ItemId | null {
  return drawMissingItem(
    ownedItemIds,
    ITEM_IDS.filter((id) => id !== 'carlitos'),
    random,
    (itemId) => 4 - ITEM_DEFINITIONS[itemId].weight,
  );
}

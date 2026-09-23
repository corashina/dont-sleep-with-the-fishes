import type { ItemId } from '../game/ItemState';
import type { EventInventoryMutation, RandomSource } from './survivalTypes';
import { drawBackpackItem } from './itemRewards';

export function drawMidnightCampItems(
  owned: ReadonlySet<ItemId>,
  random: RandomSource,
): readonly EventInventoryMutation[] {
  const itemId = drawBackpackItem(owned, random);
  return itemId === null ? [] : [{ kind: 'gain', itemId, quantity: 1, fallbackFood: 1 }];
}

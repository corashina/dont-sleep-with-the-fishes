import type { ItemId } from '../game/ItemState';
import type { EventInventoryMutation, RandomSource } from './survivalTypes';
import { drawBackpackItem } from './itemRewards';

const CAMP_ITEM_CHANCES = [
  ['energyBar', 0.5],
  ['ductTape', 0.5],
] as const;

export function drawMidnightCampItems(
  owned: ReadonlySet<ItemId>,
  random: RandomSource,
  backpack: boolean,
): readonly EventInventoryMutation[] {
  const items: EventInventoryMutation[] = [];
  const reserved = new Set(owned);
  // Food and bait use the camp's separate 0–2 rolls.
  reserved.add('cannedFood');
  reserved.add('baitTin');
  for (const [itemId, chance] of CAMP_ITEM_CHANCES) {
    const found = random.next() < chance;
    if (found && !owned.has(itemId)) {
      items.push({ kind: 'gain', itemId, quantity: 1, fallbackFood: 1 });
      reserved.add(itemId);
    }
  }
  if (backpack) {
    const itemId = drawBackpackItem(reserved, random);
    if (itemId !== null) items.push({ kind: 'gain', itemId, quantity: 1, fallbackFood: 1 });
  }
  return items;
}

import { ITEM_DEFINITIONS, ITEM_IDS, type ItemId } from '../game/ItemState';
import type { RandomSource } from './survivalTypes';

export function drawDiveItem(
  presentItemIds: ReadonlySet<ItemId>,
  random: RandomSource,
): ItemId | null {
  // Carlitos is a companion, not an inventory item.
  const candidates = ITEM_IDS.filter((id) => id !== 'carlitos' && !presentItemIds.has(id));
  const total = candidates.reduce((sum, id) => sum + 4 - ITEM_DEFINITIONS[id].weight, 0);
  if (total === 0) return null;

  let roll = random.next() * total;
  for (const id of candidates) {
    roll -= 4 - ITEM_DEFINITIONS[id].weight;
    if (roll < 0) return id;
  }
  throw new Error('Dive item roll is outside the reward pool.');
}

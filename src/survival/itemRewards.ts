import { ITEM_IDS, type ItemId } from '../game/ItemState';
import type { RandomSource } from './survivalTypes';

export type ItemRewardWeight = (itemId: ItemId) => number;

export const BACKPACK_ITEM_IDS = ITEM_IDS.filter((id) => id !== 'carlitos');

export function drawBackpackItem(owned: ReadonlySet<ItemId>, random: RandomSource): ItemId | null {
  return drawMissingItem(owned, BACKPACK_ITEM_IDS, random, (id) => id === 'scubaSet' ? 3 : 1);
}

export function missingItemRewards(
  owned: ReadonlySet<ItemId>,
  pool: readonly ItemId[],
): readonly ItemId[] {
  const seen = new Set<ItemId>();
  return pool.filter((itemId) => {
    if (owned.has(itemId) || seen.has(itemId)) return false;
    seen.add(itemId);
    return true;
  });
}

export function drawMissingItem(
  owned: ReadonlySet<ItemId>,
  pool: readonly ItemId[],
  random: RandomSource,
  weight: ItemRewardWeight = () => 1,
): ItemId | null {
  const candidates = missingItemRewards(owned, pool);
  if (candidates.length === 0) return null;

  const weights = candidates.map((itemId) => weight(itemId));
  if (weights.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError('Item reward weights must be finite and greater than zero.');
  }
  const total = weights.reduce((sum, value) => sum + value, 0);
  const value = random.next();
  const finiteRoll = Number.isFinite(value) ? value : 0;
  let roll = Math.min(0.999999, Math.max(0, finiteRoll)) * total;
  for (let index = 0; index < candidates.length; index += 1) {
    roll -= weights[index]!;
    if (roll < 0) return candidates[index]!;
  }
  return candidates[candidates.length - 1]!;
}

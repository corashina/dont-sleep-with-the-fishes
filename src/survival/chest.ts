import { ITEM_IDS, type ItemId } from '../game/ItemState';
import { drawMissingItem } from './itemRewards';
import type { RandomSource } from './survivalTypes';

export const CHEST_MIMIC_MIN_NIGHTS = 2;
export const CHEST_MIMIC_CHANCE = 0.35;

export type ChestReward =
  | { readonly kind: 'item'; readonly itemId: ItemId }
  | {
      readonly kind: 'resource';
      readonly resource: 'food' | 'bait';
      readonly quantity: number;
    };

const CHEST_ITEM_REWARDS = ITEM_IDS.filter((id) => id !== 'carlitos');

export function drawChestReward(
  ownedItemIds: ReadonlySet<ItemId>,
  random: RandomSource,
): ChestReward {
  const itemId = drawMissingItem(
    ownedItemIds,
    CHEST_ITEM_REWARDS,
    random,
    (candidate) => candidate === 'scubaSet' ? 3 : 1,
  );
  return itemId === null
    ? { kind: 'resource', resource: 'food', quantity: 2 }
    : { kind: 'item', itemId };
}

export function shouldBecomeMimic(
  acquiredDay: number,
  currentDay: number,
  random: RandomSource,
): boolean {
  if (currentDay - acquiredDay < CHEST_MIMIC_MIN_NIGHTS) return false;
  return random.next() < CHEST_MIMIC_CHANCE;
}

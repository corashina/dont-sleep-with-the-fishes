import {
  ITEM_DEFINITIONS,
  ITEM_IDS,
  type ItemId,
} from '../game/ItemState';
import { drawMissingItem, missingItemRewards } from './itemRewards';
import type { RandomSource } from './survivalTypes';

export const HANDYMAN_ITEM_IDS: readonly ItemId[] = Object.freeze(
  ITEM_IDS.filter((id) => id !== 'carlitos'),
);

export function eligibleHandymanRewards(
  owned: ReadonlySet<ItemId>,
  payment: ItemId,
): readonly ItemId[] {
  return missingItemRewards(owned, handymanRewardPool(payment));
}

export function selectHandymanReward(
  owned: ReadonlySet<ItemId>,
  payment: ItemId,
  random: RandomSource,
): ItemId | null {
  return drawMissingItem(owned, handymanRewardPool(payment), random);
}

function handymanRewardPool(payment: ItemId): readonly ItemId[] {
  const paymentWeight = ITEM_DEFINITIONS[payment].weight;
  return HANDYMAN_ITEM_IDS.filter((candidate) => (
    candidate !== payment
    && ITEM_DEFINITIONS[candidate].weight === paymentWeight
  ));
}

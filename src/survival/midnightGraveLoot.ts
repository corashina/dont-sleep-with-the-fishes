import { ITEM_DEFINITIONS, ITEM_IDS, type ItemId } from '../game/ItemState';
import { missingItemRewards } from './itemRewards';
import type { RandomSource, WeightedEventOutcome } from './survivalTypes';

const GRAVE_ITEMS = ITEM_IDS.filter((id) => ITEM_DEFINITIONS[id].weight === 1
  && id !== 'cannedFood' && id !== 'baitTin');

export function drawMidnightGraveLoot(
  owned: ReadonlySet<ItemId>,
  random: RandomSource,
): WeightedEventOutcome['effects'] {
  const candidates = ['food', 'bait', ...missingItemRewards(owned, GRAVE_ITEMS)] as const;
  const roll = Math.min(0.999999, Math.max(0, random.next()));
  const reward = candidates[Math.floor(roll * candidates.length)]!;
  if (reward === 'food' || reward === 'bait') {
    return { resources: [{ resource: reward, operation: 'add', value: 1 }] };
  }
  return { items: [{ kind: 'gain', itemId: reward, quantity: 1, fallbackFood: 1 }] };
}

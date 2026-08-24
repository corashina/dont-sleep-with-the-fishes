import type { ItemId } from '../game/ItemState';
import type { FishingTerminalResult } from './FishingSession';
import type { ItemCondition, ResourceDelta } from './survivalTypes';

export interface FishingSettlement {
  readonly code: 'fish-missed' | 'fish-caught' | 'utility-caught' | 'junk-caught';
  readonly message: string;
  readonly deltas: Readonly<ResourceDelta>;
  readonly food: 0 | 1 | 2;
  readonly baitConsumed: boolean;
  readonly itemReward: Readonly<{
    itemId: ItemId;
    condition: Extract<ItemCondition, 'usable' | 'broken'>;
  }> | null;
}

export function fishingSettlement(
  result: FishingTerminalResult,
  capturedBait: boolean,
): FishingSettlement {
  const reward = result.kind === 'catch' ? result.catch.reward : { kind: 'none' as const };
  const food = reward.kind === 'food' ? reward.amount : 0;
  const baitConsumed = reward.kind === 'food' && capturedBait;
  const deltas: ResourceDelta = {};
  if (food > 0) deltas.food = food;
  if (reward.kind === 'bait') deltas.bait = reward.amount;
  if (baitConsumed) deltas.bait = -1;
  const itemReward = reward.kind === 'item'
    ? Object.freeze({ itemId: reward.itemId, condition: reward.condition })
    : null;
  const code = result.kind === 'miss'
    ? 'fish-missed'
    : result.catch.kind === 'fish'
      ? 'fish-caught'
      : result.catch.kind === 'utility'
        ? 'utility-caught'
        : 'junk-caught';
  const message = result.kind === 'miss'
    ? 'The fish got away.'
    : result.catch.kind === 'fish'
      ? `You caught a ${result.catch.label.toLocaleLowerCase('en-US')}.`
      : `You reeled in ${result.catch.label.toLocaleLowerCase('en-US')}.`;

  return Object.freeze({
    code,
    message,
    deltas: Object.freeze(deltas),
    food,
    baitConsumed,
    itemReward,
  });
}

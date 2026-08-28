import type { ItemId } from '../game/ItemState';
import type { FishingCatchReward } from './fishingCatalog';
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

function settlementCode(result: FishingTerminalResult): FishingSettlement['code'] {
  if (result.kind === 'miss') return 'fish-missed';
  if (result.catch.kind === 'fish') return 'fish-caught';
  return result.catch.kind === 'utility' ? 'utility-caught' : 'junk-caught';
}

function settlementMessage(result: FishingTerminalResult): string {
  if (result.kind === 'miss') return 'The fish got away.';
  const label = result.catch.label.toLocaleLowerCase('en-US');
  return result.catch.kind === 'fish'
    ? `You caught a ${label}.`
    : `You reeled in ${label}.`;
}

function settlementDeltas(
  reward: FishingCatchReward,
  food: number,
  baitConsumed: boolean,
): ResourceDelta {
  const deltas: ResourceDelta = {};
  if (food > 0) deltas.food = food;
  if (reward.kind === 'bait') deltas.bait = reward.amount;
  if (baitConsumed) deltas.bait = -1;
  return deltas;
}

export function fishingSettlement(
  result: FishingTerminalResult,
  capturedBait: boolean,
): FishingSettlement {
  const reward = result.kind === 'catch' ? result.catch.reward : { kind: 'none' as const };
  const food = reward.kind === 'food' ? reward.amount : 0;
  const baitConsumed = reward.kind === 'food' && capturedBait;
  const deltas = settlementDeltas(reward, food, baitConsumed);
  const itemReward = reward.kind === 'item'
    ? Object.freeze({ itemId: reward.itemId, condition: reward.condition })
    : null;

  return Object.freeze({
    code: settlementCode(result),
    message: settlementMessage(result),
    deltas: Object.freeze(deltas),
    food,
    baitConsumed,
    itemReward,
  });
}

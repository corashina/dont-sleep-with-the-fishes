import { describe, expect, it } from 'vitest';
import { ITEM_IDS, type ItemId } from '../src/game/ItemState';
import { drawChestReward } from '../src/survival/chest';
import { sequenceRandom } from './helpers/random';

describe('chest rewards', () => {
  const rewardItems = ITEM_IDS.filter((itemId) => itemId !== 'carlitos');

  it.each(rewardItems)('can award missing %s', (missing) => {
    const owned = new Set<ItemId>(rewardItems.filter((itemId) => itemId !== missing));
    expect(drawChestReward(owned, sequenceRandom([0]))).toEqual({ kind: 'item', itemId: missing });
  });

  it('gives scuba gear three times the weight of other items', () => {
    const owned = new Set<ItemId>(rewardItems.filter((itemId) => (
      itemId !== 'compass' && itemId !== 'scubaSet'
    )));

    expect(drawChestReward(owned, sequenceRandom([0.249999]))).toEqual({ kind: 'item', itemId: 'compass' });
    expect(drawChestReward(owned, sequenceRandom([0.25]))).toEqual({ kind: 'item', itemId: 'scubaSet' });
  });

  it('gives two food when every reward item is owned', () => {
    expect(drawChestReward(new Set(rewardItems), sequenceRandom([0]))).toEqual({
      kind: 'resource',
      resource: 'food',
      quantity: 2,
    });
  });
});

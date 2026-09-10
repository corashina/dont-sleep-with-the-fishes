import { describe,expect,it } from 'vitest';
import { ITEM_IDS } from '../src/game/ItemState';
import { drawChestReward } from '../src/survival/chest';
import { sequenceRandom } from './helpers/random';

describe('chest rewards', () => {
  it('gives missing Duct Tape the combined weight four', () => {
    const active = new Set(ITEM_IDS.filter((id) => id !== 'ductTape'));

    expect(drawChestReward(active, sequenceRandom([3.999 / 9]))).toEqual({
      kind: 'item',
      itemId: 'ductTape',
    });
    expect(drawChestReward(active, sequenceRandom([4 / 9]))).toEqual({
      kind: 'resource',
      resource: 'food',
      quantity: 2,
    });
  });

  it('keeps active Duct Tape at weight two', () => {
    const active = new Set(ITEM_IDS);

    expect(drawChestReward(active, sequenceRandom([1.999 / 7]))).toEqual({
      kind: 'item',
      itemId: 'ductTape',
    });
    expect(drawChestReward(active, sequenceRandom([2 / 7]))).toEqual({
      kind: 'resource',
      resource: 'food',
      quantity: 2,
    });
  });
});

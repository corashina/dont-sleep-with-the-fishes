import { describe, expect, it } from 'vitest';
import { FISHING_CATCHES } from '../src/survival/fishingCatalog';
import { fishingSettlement } from '../src/survival/fishingSettlementRules';

describe('fishingSettlement', () => {

  it('returns frozen item rewards and resource deltas', () => {
    const compass = FISHING_CATCHES.find(({ id }) => id === 'brokenCompass');
    if (compass === undefined) throw new Error('Missing compass fishing fixture.');

    const settlement = fishingSettlement({ kind: 'catch', catch: compass }, false);

    expect(settlement).toMatchObject({
      code: 'utility-caught',
      message: 'You reeled in broken compass.',
      deltas: {},
      food: 0,
      baitConsumed: false,
      itemReward: { itemId: 'compass', condition: 'broken' },
    });
    expect(Object.isFrozen(settlement)).toBe(true);
    expect(Object.isFrozen(settlement.deltas)).toBe(true);
    expect(Object.isFrozen(settlement.itemReward)).toBe(true);
  });
});

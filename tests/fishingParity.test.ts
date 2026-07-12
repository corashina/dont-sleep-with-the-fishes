import { describe, expect, it } from 'vitest';
import { FISHING_CATCHES, eligibleCatches } from '../src/canonical/fishing';
import { resolveFishing } from '../src/survival/fishing';
import { sequenceRandom } from '../src/survival/random';

describe('canonical fishing parity', () => {
  it('encodes every documented catch with its exact weight, first day, and food value', () => {
    expect(FISHING_CATCHES.map(({ id, weight, minDay, food }) => [id, weight, minDay, food])).toEqual([
      ['cod', 20, 0, 1], ['flounder', 15, 0, 1], ['salmon', 24, 0, 1],
      ['tuna', 5, 3, 2], ['crab', 14, 2, 1], ['squid', 7, 3, 2],
      ['sardine', 45, 0, 1], ['bass', 30, 0, 1], ['herring', 20, 0, 1],
      ['redSnapper', 20, 0, 1], ['mackerel', 15, 0, 1], ['clownfish', 1, 0, 1],
      ['swordfish', 1, 0, 3], ['seaweed', 82, 0, 0], ['boot', 72, 0, 0],
      ['plasticBottle', 60, 0, 0], ['fishlet', 12, 2, 0], ['worms', 5, 0, 0],
      ['wetDuctTape', 5, 3, 0], ['brokenCompass', 5, 0, 0],
      ['tornFishingNet', 3, 0, 0], ['energyBar', 8, 0, 0],
    ]);
  });

  it('excludes lore rewards and consumes bait only for food catches and Fishlet', () => {
    const ids = FISHING_CATCHES.map(({ id }) => id);
    expect(ids.some((id) => /lore|heartPiece/i.test(id))).toBe(false);

    for (const entry of FISHING_CATCHES) {
      expect(entry.consumesBait, entry.id).toBe(entry.food > 0 || entry.id === 'fishlet');
    }
  });

  it('filters catches by their inclusive minimum day', () => {
    expect(eligibleCatches(1).map(({ id }) => id)).not.toEqual(expect.arrayContaining([
      'tuna', 'crab', 'squid', 'fishlet', 'wetDuctTape',
    ]));
    expect(eligibleCatches(2).map(({ id }) => id)).toEqual(expect.arrayContaining(['crab', 'fishlet']));
    expect(eligibleCatches(2).map(({ id }) => id)).not.toEqual(expect.arrayContaining([
      'tuna', 'squid', 'wetDuctTape',
    ]));
    expect(eligibleCatches(3)).toEqual(FISHING_CATCHES);
  });

  it('draws on stable exact-weight boundaries', () => {
    expect(resolveFishing(3, false, sequenceRandom([0])).id).toBe('cod');
    expect(resolveFishing(3, false, sequenceRandom([19.999 / 469])).id).toBe('cod');
    expect(resolveFishing(3, false, sequenceRandom([20 / 469])).id).toBe('flounder');
    expect(resolveFishing(3, false, sequenceRandom([461 / 469])).id).toBe('energyBar');
  });

  it('maps resource and tool catches to stable runtime items and conditions', () => {
    expect(resolveFishing(3, true, sequenceRandom([443 / 469]))).toMatchObject({
      id: 'worms', itemGain: 'baitTin', itemCondition: 'usable', consumesBait: false,
    });
    expect(resolveFishing(3, true, sequenceRandom([448 / 469]))).toMatchObject({
      id: 'wetDuctTape', itemGain: 'ductTape', itemCondition: 'usable', consumesBait: false,
    });
    expect(resolveFishing(3, true, sequenceRandom([453 / 469]))).toMatchObject({
      id: 'brokenCompass', itemGain: 'compass', itemCondition: 'broken', consumesBait: false,
    });
    expect(resolveFishing(3, true, sequenceRandom([458 / 469]))).toMatchObject({
      id: 'tornFishingNet', itemGain: 'fishingNet', itemCondition: 'broken', consumesBait: false,
    });
    expect(resolveFishing(3, true, sequenceRandom([461 / 469]))).toMatchObject({
      id: 'energyBar', itemGain: 'energyBar', itemCondition: 'usable', consumesBait: false,
    });
  });
});

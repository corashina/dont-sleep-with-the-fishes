import { describe,expect,it } from 'vitest';
import { eligibleFishingCatches,selectFishingCatch } from '../src/survival/fishingCatalog';
import { fishingSettlement } from '../src/survival/fishingSettlementRules';
import type { SimpleJunkId } from '../src/survival/JunkCatchModels';

const ids: readonly SimpleJunkId[] = [
  'trafficCone', 'clothesHanger', 'toiletPlunger', 'golfBall', 'bowlingPin', 'tableTennisPaddle',
];

describe('new junk catches', () => {
  it.each(['rod', 'net'] as const)('draws every new catch with the %s and awards no food or items', (gear) => {
    const entries = eligibleFishingCatches(0, true, new Set(), 1, gear);
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
    for (const id of ids) {
      const index = entries.findIndex((entry) => entry.catch.id === id);
      expect(index).toBeGreaterThanOrEqual(0);
      const before = entries.slice(0, index).reduce((sum, entry) => sum + entry.weight, 0);
      const selected = selectFishingCatch(0, true, (before + entries[index]!.weight / 2) / total, new Set(), 1, gear);
      expect(selected.id).toBe(id);
      expect(fishingSettlement({ kind: 'catch', catch: selected }, true)).toMatchObject({
        code: 'junk-caught', food: 0, deltas: {}, itemReward: null, baitConsumed: false,
      });
    }
  });

});

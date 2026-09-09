import { describe, expect, it } from 'vitest';
import { ITEM_IDS, type ItemId } from '../src/game/ItemState';
import { FISHING_CATCHES, eligibleFishingCatches } from '../src/survival/fishingCatalog';
import { formatFishingResult } from '../src/survival/SurvivalFishingFlow';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { SURVIVAL_BALANCE } from '../src/survival/survivalBalance';
import { sequenceRandom } from './helpers/random';

describe('net catch agreement', () => {
  it('settles one catch and names it in the popup for every catch roll', () => {
    for (let index = 0; index < 1000; index += 1) {
      const game = new SurvivalSession([{ instanceId: 'fishingNet-1', type: 'fishingNet' }], {
        seed: 1, random: sequenceRandom([0, index / 1000]),
      });
      const begun = game.beginFishing('net');
      if (!begun.accepted) throw new Error('Net unavailable');
      begun.attempt.cast({ x: 0, z: -6.4 });
      begun.attempt.completeCast();
      const result = begun.attempt.view().result!;
      expect(result.kind).toBe('catch');
      if (result.kind !== 'catch') throw new Error('Expected one catch');
      const outcome = game.finishFishing(begun.attempt.view().id, result);
      const popup = formatFishingResult(result, outcome);
      expect(outcome.accepted).toBe(true);
      expect(popup.message).toContain(result.catch.label);
      expect(popup.items.length).toBeLessThanOrEqual(1);
      if (result.catch.reward.kind === 'none') {
        expect(popup.items).toEqual([]);
        expect(popup.message).toContain('No usable reward.');
      }
    }
  });

  it.each(['plasticBottle', 'brokenCan', 'crushedCan'] as const)('names %s instead of claiming nothing was found', (id) => {
    const caught = FISHING_CATCHES.find((entry) => entry.id === id)!;
    const game = new SurvivalSession([], { seed: 1 });
    const popup = formatFishingResult({ kind: 'catch', catch: caught }, game.beginFishing().outcome);
    expect(popup.message).toBe(`${caught.label}. No usable reward.`);
    expect(popup.items).toEqual([]);
  });

  it('gives about 10% more useful reward per energy than an unbaited rod', () => {
    for (const day of [0, 1, 2, 3, 10, 55]) {
      for (const active of [new Set<ItemId>(['fishingNet']), new Set(ITEM_IDS)]) {
        const expected = (gear: 'rod' | 'net') => {
          const entries = eligibleFishingCatches(day, false, active, 1, gear);
          const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
          const reward = entries.reduce((sum, { catch: entry, weight }) => {
            const value = entry.reward.kind === 'none' ? 0 : entry.reward.kind === 'food' ? entry.reward.amount : 1;
            return sum + value * weight / total;
          }, 0);
          return reward / SURVIVAL_BALANCE.actions[gear === 'net' ? 'netEnergy' : 'fishEnergy'];
        };
        expect(expected('net') / expected('rod')).toBeGreaterThanOrEqual(1.05);
        expect(expected('net') / expected('rod')).toBeLessThanOrEqual(1.15);
      }
    }
  });
});

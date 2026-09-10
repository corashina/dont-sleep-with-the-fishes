import { describe,expect,it } from 'vitest';
import { FISHING_CATCHES } from '../src/survival/fishingCatalog';
import { formatFishingResult } from '../src/survival/SurvivalFishingFlow';
import { SurvivalSession } from '../src/survival/SurvivalSession';
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
});

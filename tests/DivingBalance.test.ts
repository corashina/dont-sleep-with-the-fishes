import { describe,expect,it } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from './helpers/random';

const scuba = { instanceId: 'scubaSet-1', type: 'scubaSet' } as const;

describe('normal diving balance', () => {
  it.each([
    [0, 1], [0.899999, 1], [0.9, 2], [0.989999, 2], [0.99, 3], [0.999999, 3],
  ])('uses quantity roll %s for %s supplies', (quantityRoll, quantity) => {
    for (const [rewardRoll, resource] of [[0, 'food'], [0.5, 'bait']] as const) {
      const session = new SurvivalSession([scuba], {
        seed: 1, weather: 'calm', random: sequenceRandom([0, 0.99, rewardRoll, quantityRoll]),
      });
      expect(session.perform('dive')).toMatchObject({
        accepted: true, deltas: { energy: -3, [resource]: quantity },
      });
      expect(session.snapshot()[resource]).toBe(quantity);
    }
  });

  it.each([
    ['calm', 0.649999, 0.249999, true, true],
    ['calm', 0.65, 0.25, false, false],
    ['overcast', 0.599999, 0.299999, true, true],
    ['overcast', 0.60, 0.30, false, false],
  ] as const)('keeps weather odds at %s (%s, %s)', (weather, successRoll, injuryRoll, recovered, injured) => {
    const session = new SurvivalSession([scuba], {
      seed: 1, weather, random: sequenceRandom([successRoll, injuryRoll, 0, 0, 0]),
    });
    const outcome = session.perform('dive');
    expect(outcome.code).toBe(recovered ? 'dive-recovered' : 'dive-empty');
    expect(outcome.deltas.health).toBe(injured ? -15 : undefined);
  });
});

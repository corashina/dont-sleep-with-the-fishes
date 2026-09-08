import { describe, expect, it } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { survivalEventById } from '../src/survival/eventCatalog';
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

  it.each(Array.from({ length: 31 }, (_, index) => index))(
    'can lose %s plus 15 Health while gaining a reward', (index) => {
      const session = new SurvivalSession([scuba], {
        seed: 1, weather: 'calm', random: sequenceRandom([0, 0, (index + 0.5) / 31, 0, 0]),
      });
      expect(session.perform('dive')).toMatchObject({
        accepted: true, deltas: { energy: -3, health: -(15 + index), food: 1 },
      });
    },
  );

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

describe('wreckage diving balance', () => {
  const choice = survivalEventById('wreckage')!.choices.find((entry) => entry.id === 'dive')!;

  it('gives 40% equipment, 35% supplies, and 25% injury', () => {
    const total = choice.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
    const injury = choice.outcomes.filter((outcome) =>
      outcome.effects.resources?.some((effect) => effect.resource === 'health'));
    const equipment = choice.outcomes.filter((outcome) =>
      outcome.effects.items?.some((mutation) => mutation.kind === 'gain'));
    expect(total).toBeCloseTo(100);
    expect(injury.reduce((sum, outcome) => sum + outcome.weight, 0) / total).toBeCloseTo(0.25);
    expect(equipment.reduce((sum, outcome) => sum + outcome.weight, 0) / total).toBeCloseTo(0.40);
    for (const resource of ['food', 'bait']) {
      const supplies = choice.outcomes.filter((outcome) =>
        outcome.effects.resources?.some((effect) => effect.resource === resource));
      expect(supplies).toHaveLength(3);
      for (const [index, probability] of [0.1575, 0.01575, 0.00175].entries()) {
        expect(supplies[index]!.weight / total).toBeCloseTo(probability, 8);
      }
    }
  });

  it.each([
    [0.40, 'food', 1], [0.56, 'food', 2], [0.574, 'food', 3],
    [0.58, 'bait', 1], [0.74, 'bait', 2], [0.749, 'bait', 3],
  ] as const)('settles %s as %s ×%s', (roll, resource, quantity) => {
    const session = new SurvivalSession([scuba], {
      seed: 1, initialEventId: 'wreckage', initial: { day: 4, energy: 3 },
      random: sequenceRandom([roll]),
    });
    expect(session.resolveEvent({ kind: 'item', choiceId: 'dive', instanceId: scuba.instanceId }))
      .toMatchObject({
        accepted: true, deltas: { energy: -3, [resource]: quantity },
        rewardSummary: { kind: 'resource', id: resource, quantity },
        eventPresentationKey: 'wreckage.dive-loot',
      });
    expect(session.snapshot()[resource]).toBe(quantity);
    expect(session.snapshot().health).toBe(100);
  });
});

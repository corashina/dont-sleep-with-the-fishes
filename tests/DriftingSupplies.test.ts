// Importance: 9/10. Protects merged drifting-supply variants, distance, and loot tiers.

import { describe, expect, it } from 'vitest';
import type { ItemInstance } from '../src/game/ItemState';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import {
  DRIFTING_SUPPLY_KINDS,
  driftingSupplyDistanceFromSeed,
  driftingSupplyKindFromSeed,
  type DriftingSupplyKind,
} from '../src/survival/driftingSupplies';
import { deriveEventVariantSeed } from '../src/survival/eventPresentationOutcome';
import { sequenceRandom } from './helpers/random';

function sessionFor(
  kind: DriftingSupplyKind,
  roll: number,
  energy = 3,
  carlitosEnergy?: number,
): SurvivalSession {
  const day = 3;
  const seed = Array.from({ length: 1_000 }, (_, index) => index).find((candidate) => (
    driftingSupplyKindFromSeed(
      deriveEventVariantSeed(candidate, day, 'drifting-supplies'),
    ) === kind
  ));
  if (seed === undefined) throw new Error(`Missing seed for ${kind}.`);
  const savedItems: readonly ItemInstance[] = carlitosEnergy === undefined
    ? []
    : [{ instanceId: 'carlitos-1', type: 'carlitos' }];
  return new SurvivalSession(savedItems, {
    seed,
    random: sequenceRandom([roll]),
    initial: { day, energy },
    ...(carlitosEnergy === undefined
      ? {}
      : { initialCarlitos: { hunger: 5, energy: carlitosEnergy } }),
    initialEventId: 'drifting-supplies',
  });
}

describe('drifting supplies', () => {

  it('selects every model and distance from the stable event seed', () => {
    const seeds = Array.from({ length: 256 }, (_, seed) => seed);
    expect(new Set(seeds.map(driftingSupplyKindFromSeed)))
      .toEqual(new Set(DRIFTING_SUPPLY_KINDS));
    expect(new Set(seeds.map(driftingSupplyDistanceFromSeed)))
      .toEqual(new Set(['near', 'middle', 'far']));
    for (const kind of DRIFTING_SUPPLY_KINDS) {
      expect(seeds.some((seed) => (
        driftingSupplyKindFromSeed(seed) === kind
        && driftingSupplyDistanceFromSeed(seed) === 'far'
      ))).toBe(true);
    }
  });

  it.each([
    ['barrel', 0.599999, 'food', 1],
    ['barrel', 0.6, 'bait', 1],
    ['lifeboat', 0.599999, 'food', 2],
    ['lifeboat', 0.6, 'bait', 2],
    ['container', 0.549999, 'food', 3],
    ['container', 0.55, 'bait', 3],
    ['container', 0.899999, 'bait', 3],
    ['container', 0.9, 'energyBar', 1],
  ] as const)(
    'uses the %s player reward boundary at %f',
    (kind, roll, rewardId, quantity) => {
      const outcome = sessionFor(kind, roll).resolveEvent({
        kind: 'choice',
        choiceId: 'retrieve',
      });

      expect(outcome.rewardSummary).toEqual(
        rewardId === 'energyBar'
          ? { kind: 'item', id: rewardId, quantity }
          : { kind: 'resource', id: rewardId, quantity },
      );
    },
  );

  it.each([
    ['barrel', 0.599999, 'food', 1],
    ['barrel', 0.6, 'bait', 1],
    ['lifeboat', 0.599999, 'food', 2],
    ['lifeboat', 0.6, 'bait', 2],
    ['container', 0.549999, 'food', 3],
    ['container', 0.55, 'bait', 3],
    ['container', 0.899999, 'bait', 3],
    ['container', 0.9, 'energyBar', 1],
  ] as const)(
    'uses the %s Carlitos reward boundary at %f',
    (kind, roll, rewardId, quantity) => {
      const outcome = sessionFor(kind, roll, 0, 2).resolveEvent({
        kind: 'choice',
        choiceId: 'delegate-carlitos',
      });

      expect(outcome.rewardSummary).toEqual(
        rewardId === 'energyBar'
          ? { kind: 'item', id: rewardId, quantity }
          : { kind: 'resource', id: rewardId, quantity },
      );
    },
  );

  it('can grant an energy bar only from the shipping container', () => {
    const container = sessionFor('container', 0.95).resolveEvent({
      kind: 'choice',
      choiceId: 'retrieve',
    });
    const lifeboat = sessionFor('lifeboat', 0.95).resolveEvent({
      kind: 'choice',
      choiceId: 'retrieve',
    });

    expect(container).toMatchObject({
      accepted: true,
      rewardSummary: { kind: 'item', id: 'energyBar', quantity: 1 },
    });
    expect(lifeboat.rewardSummary).not.toEqual({
      kind: 'item', id: 'energyBar', quantity: 1,
    });
  });
});

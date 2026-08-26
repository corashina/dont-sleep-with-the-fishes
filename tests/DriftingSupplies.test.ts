// Importance: 9/10. Protects merged drifting-supply variants, distance, and loot tiers.

import { describe, expect, it } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import {
  DRIFTING_SUPPLY_KINDS,
  driftingSupplyDistanceFromSeed,
  driftingSupplyKindFromSeed,
  type DriftingSupplyKind,
} from '../src/survival/driftingSupplies';
import { survivalEventById } from '../src/survival/eventCatalog';
import { deriveEventVariantSeed } from '../src/survival/eventPresentationOutcome';
import { sequenceRandom } from './helpers/random';

function sessionFor(
  kind: DriftingSupplyKind,
  roll: number,
  energy = 3,
): SurvivalSession {
  const day = 3;
  const seed = Array.from({ length: 1_000 }, (_, index) => index).find((candidate) => (
    driftingSupplyKindFromSeed(
      deriveEventVariantSeed(candidate, day, 'drifting-supplies'),
    ) === kind
  ));
  if (seed === undefined) throw new Error(`Missing seed for ${kind}.`);
  return new SurvivalSession([], {
    seed,
    random: sequenceRandom([roll]),
    initial: { day, energy },
    initialEventId: 'drifting-supplies',
  });
}

describe('drifting supplies', () => {
  it('replaces the separate barrel and empty-lifeboat events', () => {
    expect(survivalEventById('drifting-supplies')).toMatchObject({
      phase: 'day',
      earliestDay: 3,
      cooldownDays: 3,
    });
    expect(survivalEventById('drifting-barrel')).toBeUndefined();
    expect(survivalEventById('empty-lifeboat')).toBeUndefined();
  });

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
    ['barrel', 1],
    ['lifeboat', 2],
    ['container', 3],
  ] as const)('grants the %s food tier', (kind, quantity) => {
    const outcome = sessionFor(kind, 0).resolveEvent({
      kind: 'choice',
      choiceId: 'retrieve',
    });

    expect(outcome).toMatchObject({
      accepted: true,
      deltas: { energy: -3, food: quantity },
      rewardSummary: { kind: 'resource', id: 'food', quantity },
      eventPresentationKey: 'drifting-supplies.retrieve',
    });
  });

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

  it('requires three energy for every player retrieval', () => {
    const session = sessionFor('lifeboat', 0, 2);
    const before = session.snapshot();

    expect(session.resolveEvent({ kind: 'choice', choiceId: 'retrieve' }))
      .toMatchObject({ accepted: false, code: 'requirements-unmet' });
    expect(session.snapshot()).toEqual(before);
  });
});

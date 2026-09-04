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
import { focusedChoicesFor } from '../src/survival/SurvivalEventFlow';
import { survivalEventById } from '../src/survival/eventCatalog';
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
    ['barrel', 1, 1],
    ['lifeboat', 2, 1],
    ['container', 3, 1],
  ] as const)('grants the %s food tier', (kind, quantity, energyCost) => {
    const outcome = sessionFor(kind, 0).resolveEvent({
      kind: 'choice',
      choiceId: 'retrieve',
    });

    expect(outcome).toMatchObject({
      accepted: true,
      deltas: { energy: -energyCost, food: quantity },
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

  it.each(DRIFTING_SUPPLY_KINDS)(
    'retrieves the %s with one player energy',
    (kind) => {
      const session = sessionFor(kind, 0, 1);

      expect(session.resolveEvent({ kind: 'choice', choiceId: 'retrieve' }))
        .toMatchObject({ accepted: true });
      expect(session.snapshot().energy).toBe(0);
    },
  );

  it.each(DRIFTING_SUPPLY_KINDS)(
    'retrieves the %s with two Carlitos energy',
    (kind) => {
      const session = sessionFor(kind, 0, 0, 2);

      expect(session.resolveEvent({ kind: 'choice', choiceId: 'delegate-carlitos' }))
        .toMatchObject({ accepted: true });
      expect(session.snapshot().carlitos?.energy).toBe(0);
    },
  );

  it.each(DRIFTING_SUPPLY_KINDS)(
    'shows the %s cost for the player and Carlitos',
    (kind) => {
      const session = sessionFor(kind, 0, 1, 2);
      const event = survivalEventById('drifting-supplies');
      if (event === undefined) throw new Error('Missing Drifting Supplies event.');

      expect(focusedChoicesFor(event, session.snapshot())).toEqual([
        expect.objectContaining({ id: 'retrieve', energyCost: 1, unavailableReason: null }),
        expect.objectContaining({
          id: 'delegate-carlitos', energyCost: 2, unavailableReason: null,
        }),
        expect.objectContaining({ id: 'sleep' }),
      ]);
    },
  );
});

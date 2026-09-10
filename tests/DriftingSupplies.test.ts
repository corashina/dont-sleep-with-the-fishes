import type { CarlitosRest } from '../src/survival/CarlitosState';
// Importance: 9/10. Protects merged drifting-supply variants, distance, and loot tiers.

import { describe,expect,it } from 'vitest';
import type { ItemInstance } from '../src/game/ItemState';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import {
  DRIFTING_SUPPLY_KINDS,driftingSupplyKindFromSeed,
  type DriftingSupplyKind
} from '../src/survival/driftingSupplies';
import { deriveEventVariantSeed } from '../src/survival/eventPresentationOutcome';
import { sequenceRandom } from './helpers/random';

function sessionFor(
  kind: DriftingSupplyKind,
  roll: number,
  energy = 3,
  carlitosRest?: CarlitosRest,
): SurvivalSession {
  const day = 3;
  const seed = Array.from({ length: 1_000 }, (_, index) => index).find((candidate) => (
    driftingSupplyKindFromSeed(
      deriveEventVariantSeed(candidate, day, 'drifting-supplies'),
    ) === kind
  ));
  if (seed === undefined) throw new Error(`Missing seed for ${kind}.`);
  const savedItems: readonly ItemInstance[] = carlitosRest === undefined
    ? []
    : [{ instanceId: 'carlitos-1', type: 'carlitos' }];
  return new SurvivalSession(savedItems, {
    seed,
    random: sequenceRandom([roll]),
    initial: { day, energy },
    ...(carlitosRest === undefined
      ? {}
      : { initialCarlitos: { hunger: 5, rest: carlitosRest } }),
    initialEventId: 'drifting-supplies',
  });
}

describe('drifting supplies', () => {

  it.each(DRIFTING_SUPPLY_KINDS)('grants bundles from %s to the player and Carlitos', (kind) => {
    for (const choiceId of ['retrieve', 'delegate-carlitos']) {
      const session = sessionFor(kind, 0.99, 3, 'rested');
      const outcome = session.resolveEvent({ kind: 'choice', choiceId });
      expect(outcome.accepted).toBe(true);
      expect(outcome.rewardSummary).toEqual({ kind: 'bundle', rewards: [
        { kind: 'resource', id: 'food', quantity: 3 },
        { kind: 'resource', id: 'bait', quantity: 3 },
      ] });
      expect(session.snapshot().energy).toBe(choiceId === 'retrieve' ? 2 : 3);
      expect(session.snapshot().carlitos?.rest).toBe(choiceId === 'retrieve' ? 'rested' : 'exhausted');
    }
  });
});

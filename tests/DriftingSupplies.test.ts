import type { CarlitosRest } from '../src/survival/CarlitosState';
// Importance: 9/10. Protects merged drifting-supply variants, distance, and loot tiers.

import { describe,expect,it } from 'vitest';
import type { ItemInstance } from '../src/game/ItemState';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import {
  DRIFTING_LOOT_TYPE_COOLDOWN_DAYS,
  DRIFTING_SUPPLY_KINDS,
  driftingSupplyHistoryId,
  driftingSupplyKindFromSeed,
  isDriftingSupplyKindOnCooldown,
  type DriftingSupplyKind
} from '../src/survival/driftingSupplies';
import { deriveEventVariantSeed } from '../src/survival/eventPresentationOutcome';
import { createSurvivalSaveDocument,parseSurvivalSaveDocument } from '../src/survival/SurvivalSaveData';
import { survivalEventById } from '../src/survival/eventCatalog';
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

function sessionBeforeDawn(
  seed: number,
  day: number,
  lastSeenDays: Readonly<Record<string, number>> = {},
): SurvivalSession {
  const source = new SurvivalSession([], { seed, initial: { day } }).exportCheckpoint();
  return SurvivalSession.restore({
    ...source,
    state: 'nightEvent',
    lastSeenDays,
  });
}

function seedThatOpensSupplyOnDay(day: number, kind: DriftingSupplyKind): number {
  for (let seed = 0; seed < 10_000; seed += 1) {
    const variantSeed = deriveEventVariantSeed(seed, day, 'drifting-supplies');
    if (driftingSupplyKindFromSeed(variantSeed) !== kind) continue;
    const session = sessionBeforeDawn(seed, day - 1);
    session.beginDawn();
    if (session.snapshot().pendingEventId === 'drifting-supplies') return seed;
  }
  throw new Error(`No seed opens ${kind} supplies on day ${day}.`);
}

describe('drifting supplies', () => {

  it('gives each drifting loot type a three-day cooldown', () => {
    expect(DRIFTING_LOOT_TYPE_COOLDOWN_DAYS).toBe(3);
    expect(survivalEventById('drifting-supplies')?.cooldownDays).toBe(1);
    expect(survivalEventById('drifting-chest')?.cooldownDays).toBe(3);

    const lastSeen = new Map([[driftingSupplyHistoryId('barrel'), 5]]);
    expect(isDriftingSupplyKindOnCooldown('barrel', 7, lastSeen)).toBe(true);
    expect(isDriftingSupplyKindOnCooldown('barrel', 8, lastSeen)).toBe(false);
    expect(isDriftingSupplyKindOnCooldown('lifeboat', 6, lastSeen)).toBe(false);
  });

  it('blocks the same supply type but permits a different type on the next day', () => {
    const day = 6;
    const kind: DriftingSupplyKind = 'barrel';
    const seed = seedThatOpensSupplyOnDay(day, kind);

    const repeated = sessionBeforeDawn(seed, day - 1, {
      [driftingSupplyHistoryId(kind)]: day - 1,
    });
    repeated.beginDawn();
    expect(repeated.snapshot().pendingEventId).not.toBe('drifting-supplies');

    const distinct = sessionBeforeDawn(seed, day - 1, {
      [driftingSupplyHistoryId('lifeboat')]: day - 1,
    });
    distinct.beginDawn();
    expect(distinct.snapshot().pendingEventId).toBe('drifting-supplies');
  });

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

  it('saves and restores the last day for each supply type', () => {
    const day = 3;
    const seed = Array.from({ length: 1_000 }, (_, index) => index).find((candidate) => (
      driftingSupplyKindFromSeed(
        deriveEventVariantSeed(candidate, day, 'drifting-supplies'),
      ) === 'container'
    ));
    expect(seed).toBeDefined();
    const session = new SurvivalSession([], {
      seed: seed!,
      initial: { day },
      initialEventId: 'drifting-supplies',
    });
    expect(session.resolveEvent({ kind: 'choice', choiceId: 'sleep' }).accepted).toBe(true);
    const historyId = driftingSupplyHistoryId('container');
    expect(session.exportCheckpoint().lastSeenDays[historyId]).toBe(day);

    const document = createSurvivalSaveDocument({
      scavengeElapsedSeconds: 0,
      session: session.exportCheckpoint(),
    });
    const parsed = parseSurvivalSaveDocument(JSON.parse(JSON.stringify(document)));
    expect(parsed?.checkpoint.session.lastSeenDays[historyId]).toBe(day);
  });
});

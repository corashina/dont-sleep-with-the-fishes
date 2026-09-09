import { describe, expect, it } from 'vitest';
import { ITEM_IDS, type ItemId } from '../src/game/ItemState';
import { eligibleFishingCatches, type FishingGear } from '../src/survival/fishingCatalog';
import { FishingSession } from '../src/survival/FishingSession';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from './helpers/random';

function session(energy = 3, rolls = [0, 0, 0]) {
  return new SurvivalSession([
    { instanceId: 'fishingNet-1', type: 'fishingNet' },
    { instanceId: 'baitTin-1', type: 'baitTin' },
  ], { seed: 1, initial: { energy }, random: sequenceRandom(rolls) });
}

function usefulExpectation(day: number, active: ReadonlySet<ItemId>, gear: FishingGear): number {
  const entries = eligibleFishingCatches(day, false, active, 1, gear);
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  return entries.reduce((sum, { catch: entry, weight }) => {
    const value = entry.reward.kind === 'none' ? 0 : entry.reward.kind === 'food' ? entry.reward.amount : 1;
    return sum + value * weight / total;
  }, 0);
}

describe('net fishing', () => {
  it('charges two energy and refunds an uncast attempt exactly once', () => {
    const game = session();
    const begun = game.beginFishing('net');
    expect(begun.accepted).toBe(true);
    if (!begun.accepted) throw new Error('Net unavailable');
    expect(game.snapshot().energy).toBe(1);
    expect(game.cancelFishing(begun.attempt.view().id).accepted).toBe(true);
    expect(game.snapshot()).toMatchObject({ energy: 3, actedToday: false });
    expect(game.cancelFishing(begun.attempt.view().id).accepted).toBe(false);
    expect(game.snapshot().energy).toBe(3);
  });

  it('requires two energy, daytime, and a usable net', () => {
    expect(session(1).beginFishing('net').accepted).toBe(false);
    const missing = new SurvivalSession([], { seed: 1 });
    expect(missing.beginFishing('net')).toMatchObject({ accepted: false, outcome: { code: 'no-fishing-net' } });
    const broken = new SurvivalSession([{ instanceId: 'fishingNet-1', type: 'fishingNet' }], {
      seed: 1, initialConditions: { 'fishingNet-1': 'broken' },
    });
    expect(broken.beginFishing('net').accepted).toBe(false);
    const night = new SurvivalSession([{ instanceId: 'fishingNet-1', type: 'fishingNet' }], {
      seed: 1, initialEventId: 'school-of-fish',
    });
    expect(night.beginFishing('net').accepted).toBe(false);
  });

  it('automatically settles two catches once, leaves bait and the net intact, and blocks other actions', () => {
    const game = session();
    const before = game.snapshot();
    const begun = game.beginFishing('net');
    if (!begun.accepted) throw new Error('Net unavailable');
    const attempt = begun.attempt;
    expect(game.perform('dive').accepted).toBe(false);
    attempt.cast({ x: 0, z: -6.4 });
    expect(game.cancelFishing(attempt.view().id).accepted).toBe(false);
    attempt.completeCast();
    expect(attempt.reel().accepted).toBe(false);
    const result = attempt.view().result!;
    expect(result.kind).toBe('haul');
    const outcome = game.finishFishing(attempt.view().id, result);
    expect(outcome).toMatchObject({ accepted: true, deltas: { food: 2 } });
    expect(game.snapshot()).toMatchObject({ energy: 1, bait: before.bait, food: before.food + 2 });
    expect(game.snapshot().inventory['fishingNet-1']?.condition).toBe('usable');
    expect(game.finishFishing(attempt.view().id, result).accepted).toBe(false);
    expect(game.snapshot().food).toBe(before.food + 2);
  });

  it('reserves the first unique item before drawing the second catch', () => {
    const game = session(3, [0, 0.99, 0.99]);
    const begun = game.beginFishing('net');
    if (!begun.accepted) throw new Error('Net unavailable');
    begun.attempt.cast({ x: 0, z: -6.4 });
    begun.attempt.completeCast();
    const result = begun.attempt.view().result!;
    if (result.kind !== 'haul') throw new Error('Expected haul');
    const rewards = result.catches.map((entry) => entry.reward);
    expect(rewards.every((reward) => reward.kind === 'item')).toBe(true);
    expect(rewards[0]).not.toEqual(rewards[1]);
    expect(game.finishFishing(begun.attempt.view().id, result).accepted).toBe(true);
  });

  it('ignores bait and never waits for a bite', () => {
    const attempt = new FishingSession({
      id: 'net', gear: 'net', day: 1, capturedBait: true, random: sequenceRandom([0]),
    });
    expect(attempt.snapshot().capturedBait).toBe(false);
    attempt.cast({ x: 0, z: -6.4 });
    attempt.completeCast();
    attempt.advance(100);
    expect(attempt.view()).toMatchObject({ state: 'resolved', result: { kind: 'haul' } });
  });

  it('exceeds the rod useful reward per energy by at least 25% across progression and inventories', () => {
    for (const day of [0, 1, 2, 3, 10, 55]) {
      for (const active of [new Set<ItemId>(['fishingNet']), new Set(ITEM_IDS)]) {
        // Two net catches for two energy equals one weighted draw per energy.
        const rod = usefulExpectation(day, active, 'rod');
        const net = usefulExpectation(day, active, 'net');
        expect(net / rod).toBeGreaterThanOrEqual(1.25);
      }
    }
  });
});

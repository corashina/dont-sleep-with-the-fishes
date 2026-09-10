import { describe, expect, it } from 'vitest';
import { FishingSession } from '../src/survival/FishingSession';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from './helpers/random';

function session(energy = 3, rolls = [0, 0]) {
  return new SurvivalSession([
    { instanceId: 'fishingNet-1', type: 'fishingNet' },
    { instanceId: 'baitTin-1', type: 'baitTin' },
  ], { seed: 1, initial: { energy }, random: sequenceRandom(rolls) });
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

  it('automatically settles one catch once, leaves bait and the net intact, and blocks other actions', () => {
    const game = session(3, [0, 0, 0.20]);
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
    expect(result.kind).toBe('catch');
    const outcome = game.finishFishing(attempt.view().id, result);
    expect(outcome).toMatchObject({ accepted: true, deltas: { food: 1 } });
    expect(game.snapshot()).toMatchObject({ energy: 1, bait: before.bait, food: before.food + 1 });
    expect(game.snapshot().inventory['fishingNet-1']?.condition).toBe('usable');
    expect(game.finishFishing(attempt.view().id, result).accepted).toBe(false);
    expect(game.snapshot().food).toBe(before.food + 1);
  });

  it('ignores bait and never waits for a bite', () => {
    const attempt = new FishingSession({
      id: 'net', gear: 'net', day: 1, capturedBait: true, random: sequenceRandom([0]),
    });
    expect(attempt.snapshot().capturedBait).toBe(false);
    attempt.cast({ x: 0, z: -6.4 });
    attempt.completeCast();
    attempt.advance(100);
    expect(attempt.view()).toMatchObject({ state: 'resolved', result: { kind: 'catch' } });
  });

});

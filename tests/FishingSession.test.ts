import { describe, expect, it } from 'vitest';
import { FishingSession } from '../src/survival/FishingSession';
import type { RandomSource } from '../src/survival/survivalTypes';
import { sequenceRandom } from './helpers/random';

function createSession(draws: readonly number[] = [0, 0]) {
  return new FishingSession({
    id: 'attempt-1',
    day: 1,
    capturedBait: false,
    random: sequenceRandom(draws),
  });
}

function castToWaiting(session: FishingSession): void {
  expect(session.cast({ x: 4, z: -2 }).accepted).toBe(true);
  expect(session.completeCast().accepted).toBe(true);
}

describe('FishingSession', () => {
  it('consumes bite delay then hidden catch during construction', () => {
    const source = sequenceRandom([0.25, 0]);
    const draws: number[] = [];
    const random: RandomSource = { next: () => {
      const value = source.next();
      draws.push(value);
      return value;
    } };

    const session = new FishingSession({ id: 'attempt-1', day: 1, capturedBait: false, random });

    expect(draws).toEqual([0.25, 0]);
    expect(session.snapshot()).toMatchObject({ biteDelaySeconds: 4, result: null });
  });

  it('derives bite delays from the full documented range', () => {
    expect(createSession([0, 0]).snapshot().biteDelaySeconds).toBe(3);
    expect(createSession([0.999999, 0]).snapshot().biteDelaySeconds).toBeCloseTo(6.999996);
  });

  it('follows the legal successful lifecycle', () => {
    const session = createSession();
    expect(session.snapshot().state).toBe('aiming');
    expect(session.cast({ x: 4, z: -2 }).accepted).toBe(true);
    expect(session.snapshot().state).toBe('casting');
    expect(session.completeCast().accepted).toBe(true);
    expect(session.snapshot().state).toBe('waiting');
    session.advance(3);
    expect(session.snapshot().state).toBe('bite');
    expect(session.reel().accepted).toBe(true);
    expect(session.snapshot().state).toBe('reeling');
    expect(session.completeReel().accepted).toBe(true);
    expect(session.snapshot().state).toBe('resolved');
  });

  it('stores an immutable horizontal cast point and rejects invalid or duplicate casts', () => {
    const session = createSession();
    const point = { x: 4, z: -2 };
    expect(session.cast(point).accepted).toBe(true);
    point.x = 99;
    expect(session.snapshot().castPoint).toEqual({ x: 4, z: -2 });
    expect(session.cast({ x: 1, z: 1 }).accepted).toBe(false);

    const invalid = createSession();
    expect(invalid.cast({ x: Number.NaN, z: 1 }).accepted).toBe(false);
    expect(invalid.cast({ x: 1, z: Number.POSITIVE_INFINITY }).accepted).toBe(false);
    expect(invalid.snapshot().state).toBe('aiming');
  });

  it('requires completeCast before waiting', () => {
    const session = createSession();
    expect(session.reel().accepted).toBe(false);
    expect(session.completeCast().accepted).toBe(false);
    expect(session.cast({ x: 1, z: 1 }).accepted).toBe(true);
    expect(session.reel().accepted).toBe(false);
    expect(session.advance(3), 'casting does not advance').toBeUndefined();
    expect(session.snapshot().state).toBe('casting');
    expect(session.completeCast().accepted).toBe(true);
    expect(session.reel().accepted).toBe(false);
  });

  it('advances only finite non-negative elapsed time and preserves bite overflow', () => {
    const session = createSession([0.5, 0]);
    castToWaiting(session);
    expect(() => session.advance(-0.01)).toThrow(RangeError);
    expect(() => session.advance(Number.NaN)).toThrow(RangeError);
    expect(() => session.advance(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    session.advance(5.2);
    expect(session.snapshot()).toMatchObject({ state: 'bite', waitingSeconds: 5 });
    expect(session.snapshot().biteSeconds).toBeCloseTo(0.2);
  });

  it('accepts reels strictly before reaction expiry and misses at expiry', () => {
    const successful = createSession();
    castToWaiting(successful);
    successful.advance(3 + 1.499999);
    expect(successful.reel()).toMatchObject({ accepted: true, result: { kind: 'catch' } });

    const missed = createSession();
    castToWaiting(missed);
    missed.advance(4.5);
    expect(missed.snapshot()).toMatchObject({ state: 'missed', result: { kind: 'miss' } });
    expect(missed.reel().accepted).toBe(false);
  });

  it('keeps the catch hidden until it reels once', () => {
    const session = createSession([0, 0]);
    castToWaiting(session);
    session.advance(3);
    expect(session.snapshot().result).toBeNull();
    const firstReel = session.reel();
    expect(firstReel).toMatchObject({ accepted: true, result: { kind: 'catch', catch: { id: 'cod' } } });
    expect(session.snapshot().result).toBe(firstReel.result);
    expect(session.reel().accepted).toBe(false);
    expect(session.snapshot().state).toBe('reeling');
  });

  it('resolves only a reeling attempt and keeps terminal results stable', () => {
    const session = createSession();
    expect(session.completeReel().accepted).toBe(false);
    castToWaiting(session);
    session.advance(3);
    const result = session.reel().result;
    expect(session.completeReel().accepted).toBe(true);
    expect(session.completeReel().accepted).toBe(false);
    expect(session.snapshot().result).toBe(result);
  });

  it('creates a miss without exposing the discarded catch', () => {
    const session = createSession([0, 0]);
    castToWaiting(session);
    session.advance(4.5);
    expect(session.snapshot().result).toEqual({ kind: 'miss' });
    expect(session.snapshot().result).not.toHaveProperty('catch');
  });

  it('does not progress while a caller omits advance during a pause', () => {
    const session = createSession([0, 0]);
    castToWaiting(session);
    const beforePause = session.snapshot();
    const afterPause = session.snapshot();
    expect(afterPause).toMatchObject({
      state: 'waiting',
      waitingSeconds: beforePause.waitingSeconds,
      biteSeconds: beforePause.biteSeconds,
    });
  });

  it('returns frozen snapshots without exposing its internal cast point', () => {
    const session = createSession();
    session.cast({ x: 4, z: -2 });
    const first = session.snapshot();
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.castPoint)).toBe(true);
    expect(() => { (first.castPoint as { x: number }).x = 99; }).toThrow(TypeError);
    expect(session.snapshot().castPoint).toEqual({ x: 4, z: -2 });
  });
});

// Importance: 10/10 (scaled from 5/5). Protects the fishing state machine.
import { describe,expect,it } from 'vitest';
import { FishingSession } from '../src/survival/FishingSession';
import { SURVIVAL_BALANCE } from '../src/survival/survivalBalance';
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

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid fish weight multiplier %s',
    (fishWeightMultiplier) => {
      expect(() => new FishingSession({
        id: 'attempt-1',
        day: 0,
        capturedBait: false,
        fishWeightMultiplier,
        random: sequenceRandom([0, 0]),
      })).toThrow(RangeError);
    },
  );

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
    expect(SURVIVAL_BALANCE.fishing.reactionSeconds).toBe(6);
    const successful = createSession();
    castToWaiting(successful);
    successful.advance(3 + SURVIVAL_BALANCE.fishing.reactionSeconds - 0.000001);
    expect(successful.reel()).toMatchObject({ accepted: true, result: { kind: 'catch' } });

    const missed = createSession();
    castToWaiting(missed);
    missed.advance(3 + SURVIVAL_BALANCE.fishing.reactionSeconds);
    expect(missed.snapshot()).toMatchObject({ state: 'missed', result: { kind: 'miss' } });
    expect(missed.reel().accepted).toBe(false);
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

  it('reuses a frozen live view for allocation-free state reads', () => {
    const session = createSession();
    const view = session.view();

    expect(Object.isFrozen(view)).toBe(true);
    expect(session.view()).toBe(view);
    expect(view).toMatchObject({ state: 'aiming', castPoint: null, result: null });

    session.cast({ x: 4, z: -2 });

    expect(session.view()).toBe(view);
    expect(view).toMatchObject({ state: 'casting', castPoint: { x: 4, z: -2 } });
    expect(Object.isFrozen(view.castPoint)).toBe(true);
    expect(() => {
      (view as { state: string }).state = 'missed';
    }).toThrow(TypeError);
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

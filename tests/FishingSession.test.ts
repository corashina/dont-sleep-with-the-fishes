// Importance: 10/10 (scaled from 5/5). Protects the fishing state machine.
import { describe,expect,it } from 'vitest';
import { FishingSession } from '../src/survival/FishingSession';
import { SURVIVAL_BALANCE } from '../src/survival/survivalBalance';
import { sequenceRandom } from './helpers/random';
import { landFishingCatch } from './helpers/fishing';

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
  it.each([0, Number.NaN])(
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
    session.advance(session.snapshot().biteDelaySeconds + 0.2);
    expect(session.snapshot()).toMatchObject({ state: 'bite', waitingSeconds: 3.5 });
    expect(session.snapshot().biteSeconds).toBeCloseTo(0.2);
  });

  it('accepts reels strictly before reaction expiry and misses at expiry', () => {
    expect(SURVIVAL_BALANCE.fishing.reactionSeconds).toBe(6);
    const successful = createSession();
    castToWaiting(successful);
    successful.advance(
      successful.snapshot().biteDelaySeconds + SURVIVAL_BALANCE.fishing.reactionSeconds - 0.000001,
    );
    expect(successful.reel()).toMatchObject({ accepted: true });
    expect(successful.view().result).toBeNull();
    expect(successful.view().state).toBe('fighting');

    const missed = createSession();
    castToWaiting(missed);
    missed.advance(missed.snapshot().biteDelaySeconds + SURVIVAL_BALANCE.fishing.reactionSeconds);
    expect(missed.snapshot()).toMatchObject({ state: 'missed', result: { kind: 'miss' } });
    expect(missed.reel().accepted).toBe(false);
  });

  // Importance: 95/100. Catch timing, escape, and immutable rewards protect player resources.
  it('requires four controlled seconds and keeps terminal results stable', () => {
    const session = createSession();
    expect(session.reel().accepted).toBe(false);
    castToWaiting(session);
    session.advance(3);
    session.reel();
    session.advance(0.5);
    expect(session.view().result).toBeNull();
    landFishingCatch(session);
    const result = session.view().result;
    expect(result?.kind).toBe('catch');
    expect(session.view().fightSeconds).toBe(4);
    session.advance(10);
    session.counterPull(100);
    expect(session.reel().accepted).toBe(false);
    expect(session.snapshot().result).toBe(result);
  });

  it('loses an uncontrolled fish, including through a long frame', () => {
    for (const step of [1 / 60, 4]) {
      const session = createSession();
      castToWaiting(session);
      session.advance(3);
      session.reel();
      for (let i = 0; i < 250 && session.view().state === 'fighting'; i++) session.advance(step);
      expect(session.view().result).toEqual({ kind: 'miss' });
      expect(session.view().fightSeconds).toBeLessThan(4);
    }
  });

  it('moves the bite and rejects non-finite counter input', () => {
    const session = createSession();
    castToWaiting(session);
    session.advance(2);
    const before = session.view().fishOffset;
    session.advance(0.2);
    expect(session.view().fishOffset).not.toBe(before);
    session.reel();
    session.counterPull(Number.NaN);
    session.counterPull(Infinity);
    expect(session.view().fishOffset).toBe(0);
    session.advance(0.4);
    const offset = session.view().fishOffset;
    session.counterPull(-20);
    expect(session.view().fishOffset).toBeLessThan(offset);
  });

  it('requires counter-pulling across the movement variants', () => {
    for (let variant = 0; variant < 20; variant++) {
      const idle = createSession([variant / 20, 0]);
      castToWaiting(idle);
      idle.advance(idle.snapshot().biteDelaySeconds);
      idle.reel();
      idle.advance(4);
      expect(idle.view().result?.kind).toBe('miss');
      const controlled = createSession([variant / 20, 0]);
      castToWaiting(controlled);
      controlled.advance(controlled.snapshot().biteDelaySeconds);
      controlled.reel();
      landFishingCatch(controlled);
      expect(controlled.view().result?.kind).toBe('catch');
    }
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

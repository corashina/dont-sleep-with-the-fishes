import { describe, expect, it } from 'vitest';
import { ScavengeSession } from '../src/game/ScavengeSession';

const BLOCKED_STATE_SETUPS = [
  { name: 'paused', enter: (session: ScavengeSession) => session.pause() },
  { name: 'after success', enter: (session: ScavengeSession) => session.evacuate() },
  { name: 'after failure', enter: (session: ScavengeSession) => session.tick(120) },
] as const;

const ITEM_MUTATIONS = [
  { name: 'dropCarried', run: (session: ScavengeSession) => session.dropCarried(), rejected: null },
  { name: 'saveCarried', run: (session: ScavengeSession) => session.saveCarried(), rejected: false },
  { name: 'loseCarried', run: (session: ScavengeSession) => session.loseCarried(), rejected: false },
  { name: 'lose', run: (session: ScavengeSession) => session.lose('ductTape'), rejected: false },
] as const;

describe('ScavengeSession', () => {
  it('starts at 120 seconds and fails exactly once at expiry', () => {
    const session = new ScavengeSession();
    session.start();
    session.tick(119.5);
    expect(session.snapshot().remainingSeconds).toBeCloseTo(0.5);
    session.tick(0.5);
    expect(session.snapshot().status).toBe('failure');
    session.tick(5);
    expect(session.snapshot().remainingSeconds).toBe(0);
  });

  it('does not advance while paused', () => {
    const session = new ScavengeSession();
    session.start();
    session.tick(10);
    session.pause();
    session.tick(40);
    expect(session.snapshot().remainingSeconds).toBe(110);
    session.resume();
    session.tick(1);
    expect(session.snapshot().remainingSeconds).toBe(109);
  });

  it('allows one carried item and five saved items', () => {
    const session = new ScavengeSession();
    session.start();
    expect(session.pickUp('flareGun')).toBe(true);
    expect(session.pickUp('ductTape')).toBe(false);
    expect(session.saveCarried()).toBe(true);

    for (const id of ['ductTape', 'fishingRod', 'baitTin', 'medicalKit'] as const) {
      expect(session.pickUp(id)).toBe(true);
      expect(session.saveCarried()).toBe(true);
    }

    expect(session.snapshot().savedCount).toBe(5);
    expect(session.pickUp('waterJug')).toBe(true);
    expect(session.saveCarried()).toBe(false);
    expect(session.snapshot().carriedItem).toBe('waterJug');
  });

  it('keeps saved and lost transitions idempotent', () => {
    const savedSession = new ScavengeSession();
    savedSession.start();
    savedSession.pickUp('flareGun');
    expect(savedSession.saveCarried()).toBe(true);
    expect(savedSession.lose('flareGun')).toBe(false);
    expect(savedSession.pickUp('flareGun')).toBe(false);
    expect(savedSession.snapshot().items.flareGun).toBe('saved');

    const lostSession = new ScavengeSession();
    lostSession.start();
    lostSession.pickUp('flashlight');
    expect(lostSession.loseCarried()).toBe(true);
    expect(lostSession.lose('flashlight')).toBe(false);
    expect(lostSession.pickUp('flashlight')).toBe(false);
    expect(lostSession.snapshot().items.flashlight).toBe('lost');
  });

  it.each(BLOCKED_STATE_SETUPS)('rejects item mutations while $name', ({ enter }) => {
    for (const mutation of ITEM_MUTATIONS) {
      const session = new ScavengeSession();
      session.start();
      session.pickUp('flareGun');
      enter(session);
      const before = session.snapshot();

      expect.soft(mutation.run(session), mutation.name).toBe(mutation.rejected);
      expect.soft(session.snapshot(), mutation.name).toEqual(before);
    }
  });

  it('commits success only once', () => {
    const session = new ScavengeSession();
    session.start();
    expect(session.evacuate()).toBe(true);
    expect(session.evacuate()).toBe(false);
    expect(session.snapshot().status).toBe('success');
  });
});

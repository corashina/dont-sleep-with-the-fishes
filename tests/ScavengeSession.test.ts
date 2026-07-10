import { describe, expect, it } from 'vitest';
import { ScavengeSession } from '../src/game/ScavengeSession';

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
    const session = new ScavengeSession();
    session.start();
    session.pickUp('flashlight');
    expect(session.loseCarried()).toBe(true);
    expect(session.lose('flashlight')).toBe(false);
    expect(session.snapshot().items.flashlight).toBe('lost');
  });

  it('commits success only once', () => {
    const session = new ScavengeSession();
    session.start();
    expect(session.evacuate()).toBe(true);
    expect(session.evacuate()).toBe(false);
    expect(session.snapshot().status).toBe('success');
  });
});

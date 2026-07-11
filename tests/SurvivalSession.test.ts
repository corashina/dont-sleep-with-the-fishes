import { describe, expect, it } from 'vitest';
import type { ItemId } from '../src/game/ItemState';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from '../src/survival/random';

function stateAfterDawn(day: number, rescueProgress: number, rescueRoll: number) {
  const session = new SurvivalSession([], {
    seed: 1,
    random: sequenceRandom([0, rescueRoll]),
    initial: { day, rescueProgress },
  });
  session.beginDawn();
  return session.snapshot().state;
}

describe('SurvivalSession daytime actions', () => {
  it('starts day one with copied supplies and canned food', () => {
    const saved: ItemId[] = ['cannedFood', 'waterJug'];
    const session = new SurvivalSession(saved, { seed: 9, random: sequenceRandom([0]) });
    saved.length = 0;
    const state = session.snapshot();
    expect(state).toMatchObject({ state: 'day', day: 1, health: 100, hunger: 20, energy: 4, hull: 75, food: 2 });
    expect(state.inventory.waterJug.charges).toBe(3);
  });

  it('fishes deterministically with rod and bait', () => {
    const session = new SurvivalSession(['fishingRod', 'baitTin'], {
      seed: 1,
      random: sequenceRandom([0.1, 0.1]),
    });
    expect(session.perform('fish', 'useBait')).toMatchObject({ accepted: true, deltas: { energy: -2, food: 2, bait: -1 } });
    expect(session.snapshot()).toMatchObject({ energy: 2, food: 2, bait: 2, actedToday: true });
  });

  it('keeps hand-line fishing possible but rejects insufficient energy', () => {
    const session = new SurvivalSession([], { seed: 1, random: sequenceRandom([0.2, 0.8]) });
    expect(session.perform('fish')).toMatchObject({ accepted: true, deltas: { energy: -2, food: 1 } });
    expect(session.perform('fish')).toMatchObject({ accepted: true, deltas: { energy: -2, food: 0 } });
    expect(session.perform('fish')).toMatchObject({ accepted: false, code: 'not-enough-energy' });
  });

  it('applies diving risk and blocks diving in a squall', () => {
    const injured = new SurvivalSession([], { seed: 1, random: sequenceRandom([0.9, 0.1]) });
    expect(injured.perform('dive')).toMatchObject({ accepted: true, deltas: { energy: -3, health: -10 } });
    const storm = new SurvivalSession([], { seed: 1, random: sequenceRandom([0]), weather: 'squall' });
    expect(storm.perform('dive')).toMatchObject({ accepted: false, code: 'weather-blocked' });
  });

  it('eats, repairs, treats, and rests using the documented resources', () => {
    const session = new SurvivalSession(['cannedFood', 'ductTape', 'medicalKit', 'waterJug'], {
      seed: 1,
      random: sequenceRandom([0]),
      initial: { hunger: 80, health: 60, hull: 40, energy: 2 },
    });
    expect(session.perform('eat')).toMatchObject({ deltas: { hunger: -35, food: -1 } });
    expect(session.perform('repair', 'ductTape')).toMatchObject({ deltas: { energy: -2, hull: 15 } });
    expect(session.perform('treat')).toMatchObject({ deltas: { health: 30 } });
    expect(session.perform('rest')).toMatchObject({ deltas: { energy: 2 } });
    expect(session.perform('rest').code).toBe('already-rested');
  });

  it('applies dawn hunger, energy tiers, starvation, and terminal states once', () => {
    const session = new SurvivalSession([], {
      seed: 1,
      random: sequenceRandom([0.99]),
      initial: { hunger: 95, health: 20, hull: 5, energy: 0 },
    });
    session.beginDawn();
    expect(session.snapshot()).toMatchObject({ day: 2, hunger: 100, energy: 2, health: 5 });
    session.beginDawn();
    expect(session.snapshot().state).toBe('dead');
    const terminal = session.snapshot();
    expect(session.perform('fish').accepted).toBe(false);
    expect(session.snapshot()).toEqual(terminal);
  });

  it('opens one day event only after an action and resolves a valid item once', () => {
    const session = new SurvivalSession(['waterJug'], { seed: 2, random: sequenceRandom([0]) });
    expect(session.requestDayEvent().code).toBe('act-first');
    session.perform('fish');
    expect(session.requestDayEvent()).toMatchObject({ accepted: true, code: 'event-opened' });
    expect(session.snapshot().state).toBe('dayEvent');
    const first = session.resolveEvent('waterJug');
    expect(first.accepted).toBe(true);
    const charges = session.snapshot().inventory.waterJug.charges;
    expect(session.resolveEvent('waterJug').accepted).toBe(false);
    expect(session.snapshot().inventory.waterJug.charges).toBe(charges);
  });

  it('does not consume an unsuitable item and applies the authored fallback consequence', () => {
    const session = new SurvivalSession(['waterJug'], {
      seed: 2,
      random: sequenceRandom([0]),
      initialEventId: 'day-sudden-squall',
    });
    const before = session.snapshot().inventory.waterJug.charges;
    expect(session.resolveEvent('waterJug')).toMatchObject({ accepted: true, deltas: { hull: -15 } });
    expect(session.snapshot().inventory.waterJug.charges).toBe(before);
  });

  it('draws a night event, advances dawn, and applies increasing rescue chance', () => {
    const session = new SurvivalSession([], { seed: 2, random: sequenceRandom([0, 0.99, 0.99, 0.99, 0]) });
    session.perform('endDay');
    expect(session.snapshot().state).toBe('nightEvent');
    session.resolveEvent(null);
    expect(session.snapshot().state).toBe('day');
    expect(session.snapshot().day).toBe(2);
  });

  it('guarantees rescue when the flare counters a sighting and stays terminal', () => {
    const session = new SurvivalSession(['flareGun'], {
      seed: 3,
      random: sequenceRandom([0]),
      initial: { day: 5 },
      initialEventId: 'day-distant-aircraft',
    });
    expect(session.resolveEvent('flareGun')).toMatchObject({ accepted: true, cue: 'rescue' });
    expect(session.snapshot().state).toBe('rescued');
    const rescued = session.snapshot();
    expect(session.beginDawn().accepted).toBe(false);
    expect(session.snapshot()).toEqual(rescued);
  });

  it('validates the initial event seam and adopts its phase', () => {
    expect(() => new SurvivalSession([], { seed: 1, initialEventId: 'missing-event' })).toThrow(/unknown/i);
    const session = new SurvivalSession([], { seed: 1, initialEventId: 'night-calm-water' });
    expect(session.snapshot()).toMatchObject({ state: 'nightEvent', pendingEventId: 'night-calm-water' });
  });

  it('caps rescue probability at 0.85 after progress', () => {
    const rescued = new SurvivalSession([], {
      seed: 1,
      random: sequenceRandom([0, 0.849]),
      initial: { day: 20, rescueProgress: 100 },
      initialEventId: 'night-calm-water',
    });
    rescued.resolveEvent(null);
    expect(rescued.snapshot().state).toBe('rescued');

    const missed = new SurvivalSession([], {
      seed: 1,
      random: sequenceRandom([0, 0.851]),
      initial: { day: 20, rescueProgress: 100 },
      initialEventId: 'night-calm-water',
    });
    missed.resolveEvent(null);
    expect(missed.snapshot().state).toBe('day');
  });

  it('starts rescue rolls at 5% on day 5', () => {
    expect(stateAfterDawn(4, 0, 0.049999)).toBe('rescued');
    expect(stateAfterDawn(4, 0, 0.050001)).toBe('day');
  });

  it('increases rescue chance by 8 percentage points on day 6', () => {
    expect(stateAfterDawn(5, 0, 0.129999)).toBe('rescued');
    expect(stateAfterDawn(5, 0, 0.130001)).toBe('day');
  });

  it('caps the base rescue chance at 60%', () => {
    expect(stateAfterDawn(19, 0, 0.599999)).toBe('rescued');
    expect(stateAfterDawn(19, 0, 0.600001)).toBe('day');
  });

  it('caps rescue-progress bonus at 25 percentage points', () => {
    expect(stateAfterDawn(4, 100, 0.299999)).toBe('rescued');
    expect(stateAfterDawn(4, 100, 0.300001)).toBe('day');
  });
});

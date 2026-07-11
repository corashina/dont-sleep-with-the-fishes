import { describe, expect, it } from 'vitest';
import type { ItemId } from '../src/game/ItemState';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from '../src/survival/random';

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
});

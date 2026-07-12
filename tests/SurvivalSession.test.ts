import { describe, expect, it } from 'vitest';
import type { ItemId, ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from '../src/survival/random';

const saved = (...types: ItemId[]): ItemInstance[] => types.map((type, index) => ({
  instanceId: `${type}-${index + 1}` as ItemInstanceId,
  type,
}));

function stateAfterDawn(day: number, rescueProgress: number, rescueRoll: number) {
  const session = new SurvivalSession(saved(), {
    seed: 1,
    random: sequenceRandom([0, rescueRoll]),
    initial: { day, rescueProgress },
  });
  session.beginDawn();
  return session.snapshot().state;
}

describe('SurvivalSession daytime actions', () => {
  it('reports applied rather than requested clamped deltas', () => {
    const eating = new SurvivalSession(saved('cannedFood'), { seed: 1, initial: { hunger: 20 } });
    expect(eating.perform('eat').deltas).toEqual({ hunger: -20, food: -1 });
    const treating = new SurvivalSession(saved('medicalKit'), { seed: 1, initial: { health: 90 } });
    expect(treating.perform('treat').deltas).toEqual({ health: 10 });
    const repairing = new SurvivalSession(saved(), { seed: 1, initial: { hull: 90, energy: 4 } });
    (repairing as unknown as { repairMaterial: number }).repairMaterial = 1;
    expect(repairing.perform('repair', 'repairMaterial').deltas).toEqual({ energy: -2, hull: 10, repairMaterial: -1 });
  });

  it('rejects unowned or exhausted event items without changing the event', () => {
    const unowned = new SurvivalSession(saved(), { seed: 1, initialEventId: 'day-sudden-squall' });
    const before = unowned.snapshot();
    expect(unowned.resolveEvent('waterJug')).toMatchObject({ accepted: false, code: 'item-unavailable' });
    expect(unowned.snapshot()).toEqual(before);
  });

  it('guards dawn while an event is pending and exposes nightfall then dawn cues', () => {
    const session = new SurvivalSession(saved(), { seed: 1, random: sequenceRandom([0, 0.99]) });
    expect(session.perform('endDay').cue).toBe('nightfall');
    const pending = session.snapshot();
    expect(session.beginDawn()).toMatchObject({ accepted: false, code: 'event-pending' });
    expect(session.snapshot()).toEqual(pending);
    session.resolveEvent(null);
    expect(session.snapshot().state).toBe('nightEvent');
    expect(session.beginDawn()).toMatchObject({ accepted: true, cue: 'dawn' });
  });

  it('selects terminal cues from the resulting real state', () => {
    const dead = new SurvivalSession(saved(), { seed: 1, initial: { health: 5 }, initialEventId: 'night-oppressive-darkness' });
    expect(dead.resolveEvent(null).cue).toBe('death');
    const sunk = new SurvivalSession(saved(), { seed: 1, initial: { hull: 10 }, initialEventId: 'night-violent-weather' });
    expect(sunk.resolveEvent(null).cue).toBe('sinking');
  });
  it('starts day one with frozen cloned supplies and one food per can', () => {
    const savedItems = saved('cannedFood', 'waterJug');
    const session = new SurvivalSession(savedItems, { seed: 9, random: sequenceRandom([0]) });
    savedItems.length = 0;
    const state = session.snapshot();
    expect(state).toMatchObject({ state: 'day', day: 1, health: 100, hunger: 20, energy: 4, hull: 75, food: 1 });
    expect(state.inventory.waterJug.charges).toBe(3);
    expect(state.savedItems).toEqual(saved('cannedFood', 'waterJug'));
    expect(state.savedItems).not.toBe(savedItems);
    expect(Object.isFrozen(state.savedItems)).toBe(true);
    expect(state.savedItems.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(state.inventory)).toBe(true);
    expect(Object.isFrozen(state.inventory.waterJug)).toBe(true);
    expect(Object.isFrozen(state.inventory.waterJug.instances)).toBe(true);
    expect(state.inventory.waterJug.instances.every(Object.isFrozen)).toBe(true);
  });

  it('fishes deterministically with rod and bait', () => {
    const session = new SurvivalSession(saved('fishingRod', 'baitTin'), {
      seed: 1,
      random: sequenceRandom([0.1, 0.1, 0]),
    });
    expect(session.perform('fish', 'useBait')).toMatchObject({ accepted: true, deltas: { energy: -2, food: 2, bait: -1 } });
    expect(session.snapshot()).toMatchObject({ energy: 2, food: 2, bait: 2, actedToday: true });
  });

  it('preserves the double roll as one bonus food on a higher-value catch', () => {
    const session = new SurvivalSession(saved('fishingRod'), {
      seed: 1,
      initial: { day: 3 },
      random: sequenceRandom([0, 0, 59 / 469]),
    });

    expect(session.perform('fish')).toMatchObject({
      accepted: true, deltas: { energy: -2, food: 3 },
    });
  });

  it('keeps bait when a successful cast selects junk', () => {
    const session = new SurvivalSession(saved('fishingRod', 'baitTin'), {
      seed: 1,
      random: sequenceRandom([0, 0.99, 191 / 426]),
    });

    expect(session.perform('fish', 'useBait')).toMatchObject({
      accepted: true, code: 'fish-caught', deltas: { energy: -2, food: 0 },
    });
    expect(session.snapshot()).toMatchObject({ food: 0, bait: 3, recoveredBait: 3 });
  });

  it('turns caught worms into one bait use without consuming bait', () => {
    const session = new SurvivalSession(saved('fishingRod', 'baitTin'), {
      seed: 1,
      random: sequenceRandom([0, 0.99, 405 / 426]),
    });

    expect(session.perform('fish', 'useBait')).toMatchObject({
      accepted: true, deltas: { energy: -2, food: 0, bait: 1 },
    });
    expect(session.snapshot()).toMatchObject({ bait: 4, recoveredBait: 3 });
  });

  it('adds caught tools with their documented usable or broken condition', () => {
    const catches = [
      [448 / 469, 'ductTape', 'usable'],
      [453 / 469, 'compass', 'broken'],
      [458 / 469, 'fishingNet', 'broken'],
      [461 / 469, 'energyBar', 'usable'],
    ] as const;

    for (const [catchRoll, itemId, condition] of catches) {
      const session = new SurvivalSession(saved('fishingRod'), {
        seed: 1,
        initial: { day: 3 },
        random: sequenceRandom([0, 0.99, catchRoll]),
      });

      expect(session.perform('fish')).toMatchObject({ accepted: true, code: 'fish-caught' });
      expect(session.snapshot().inventory[itemId].instances).toHaveLength(1);
      expect(session.snapshot().inventory[itemId].instances[0]).toMatchObject({ condition });
    }
  });

  it('does not restore a consumed recovered can when diving finds loose food', () => {
    const session = new SurvivalSession(saved('cannedFood', 'scubaSet'), {
      seed: 1,
      random: sequenceRandom([0, 0.99, 0]),
      initial: { hunger: 80, energy: 5 },
    });

    session.perform('eat');
    expect(session.snapshot()).toMatchObject({ food: 0, recoveredFood: 0 });
    session.perform('dive');

    expect(session.snapshot()).toMatchObject({ food: 1, recoveredFood: 0 });
  });

  it('does not refill a used recovered bait tin when diving finds loose bait', () => {
    const session = new SurvivalSession(saved('fishingRod', 'baitTin', 'scubaSet'), {
      seed: 1,
      random: sequenceRandom([0, 0.99, 0, 0, 0.99, 0.3]),
      initial: { energy: 10 },
    });

    session.perform('fish', 'useBait');
    expect(session.snapshot()).toMatchObject({ bait: 2, recoveredBait: 2 });
    session.perform('dive');

    expect(session.snapshot()).toMatchObject({ bait: 3, recoveredBait: 2 });
  });

  it('requires a rod for fishing and scuba for diving', () => {
    expect(new SurvivalSession(saved(), { seed: 1 }).perform('fish')).toMatchObject({ code: 'no-fishing-rod' });
    expect(new SurvivalSession(saved(), { seed: 1 }).perform('dive')).toMatchObject({ code: 'no-scuba-set' });
    expect(new SurvivalSession(saved('fishingRod'), { seed: 1, random: sequenceRandom([0]) })
      .perform('fish').accepted).toBe(true);
    expect(new SurvivalSession(saved('scubaSet'), { seed: 1, random: sequenceRandom([0, 0, 0]) })
      .perform('dive').accepted).toBe(true);
  });

  it('applies diving risk and blocks diving in a squall', () => {
    const injured = new SurvivalSession(saved('scubaSet'), { seed: 1, random: sequenceRandom([0.9, 0.1]) });
    expect(injured.perform('dive')).toMatchObject({ accepted: true, deltas: { energy: -3, health: -10 } });
    const storm = new SurvivalSession(saved('scubaSet'), { seed: 1, random: sequenceRandom([0]), weather: 'squall' });
    expect(storm.perform('dive')).toMatchObject({ accepted: false, code: 'weather-blocked' });
  });

  it('eats, repairs, treats, and rests using the documented resources', () => {
    const session = new SurvivalSession(saved('cannedFood', 'ductTape', 'medicalKit', 'waterJug'), {
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
    const session = new SurvivalSession(saved(), {
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
    const session = new SurvivalSession(saved('waterJug', 'fishingRod'), { seed: 2, random: sequenceRandom([0]) });
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
    const session = new SurvivalSession(saved('waterJug'), {
      seed: 2,
      random: sequenceRandom([0]),
      initialEventId: 'day-sudden-squall',
    });
    const before = session.snapshot().inventory.waterJug.charges;
    expect(session.resolveEvent('waterJug')).toMatchObject({ accepted: true, deltas: { hull: -15 } });
    expect(session.snapshot().inventory.waterJug.charges).toBe(before);
  });

  it('draws a night event, advances dawn, and applies increasing rescue chance', () => {
    const session = new SurvivalSession(saved(), { seed: 2, random: sequenceRandom([0, 0.99, 0.99, 0.99, 0]) });
    session.perform('endDay');
    expect(session.snapshot().state).toBe('nightEvent');
    session.resolveEvent(null);
    session.beginDawn();
    expect(session.snapshot().state).toBe('day');
    expect(session.snapshot().day).toBe(2);
  });

  it('guarantees rescue when the flare counters a sighting and stays terminal', () => {
    const session = new SurvivalSession(saved('flareGun'), {
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
    expect(() => new SurvivalSession(saved(), { seed: 1, initialEventId: 'missing-event' })).toThrow(/unknown/i);
    const session = new SurvivalSession(saved(), { seed: 1, initialEventId: 'night-calm-water' });
    expect(session.snapshot()).toMatchObject({ state: 'nightEvent', pendingEventId: 'night-calm-water' });
  });

  it('caps rescue probability at 0.85 after progress', () => {
    const rescued = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0, 0.849]),
      initial: { day: 20, rescueProgress: 100 },
      initialEventId: 'night-calm-water',
    });
    rescued.resolveEvent(null);
    rescued.beginDawn();
    expect(rescued.snapshot().state).toBe('rescued');

    const missed = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0, 0.851]),
      initial: { day: 20, rescueProgress: 100 },
      initialEventId: 'night-calm-water',
    });
    missed.resolveEvent(null);
    missed.beginDawn();
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

import { describe, expect, it } from 'vitest';
import { CANONICAL_SURVIVAL_BALANCE } from '../src/canonical/balance';
import type { ItemId, ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import { sequenceRandom } from '../src/survival/random';
import { SurvivalSession } from '../src/survival/SurvivalSession';

const saved = (...types: ItemId[]): ItemInstance[] => types.map((type, index) => ({
  instanceId: `${type}-${index + 1}` as ItemInstanceId,
  type,
}));

const setDay = (session: SurvivalSession, day: number): void => {
  (session as unknown as { day: number }).day = day;
};

describe('canonical survival-event integration', () => {
  it('starts with exact wiki health and hull and zero danger', () => {
    const session = new SurvivalSession(saved(), { seed: 1 });

    expect(session.snapshot()).toMatchObject({ health: 100, hull: 100, danger: 0, route: null });
    expect(CANONICAL_SURVIVAL_BALANCE.start.health).toMatchObject({ value: 100, provenance: 'wiki' });
    expect(CANONICAL_SURVIVAL_BALANCE.start.hull).toMatchObject({ value: 100, provenance: 'wiki' });
    expect(CANONICAL_SURVIVAL_BALANCE.start.hunger.provenance).toBe('preserved');
    expect(CANONICAL_SURVIVAL_BALANCE.start.energy.provenance).toBe('preserved');
  });

  it('does not passively increase danger at dawn', () => {
    const session = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0]),
      initial: { danger: 2 },
    });

    session.beginDawn();

    expect(session.snapshot().danger).toBe(2);
  });

  it('applies exact event danger increments and exposes pending choices and history', () => {
    const session = new SurvivalSession(saved('map'), {
      seed: 1,
      random: sequenceRandom([0.99, 0]),
      initial: { day: 2, danger: 0 },
      initialEventId: 'dangerous-waters',
    });

    expect(session.snapshot().pendingChoices.map(({ id }) => id)).toEqual(['map', 'sleep']);
    session.resolveEventChoice('map');

    expect(session.snapshot()).toMatchObject({
      danger: 1,
      hull: 95,
      eventHistory: {
        'dangerous-waters': { appearances: 1, firstDay: 2, lastDay: 2 },
      },
    });
  });

  it('uses danger gates in the live night draw', () => {
    const safe = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0.99]),
      initial: { day: 6, danger: 0 },
    });
    const dangerous = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0.99]),
      initial: { day: 6, danger: 1 },
    });

    safe.endDay();
    dangerous.endDay();

    expect(safe.snapshot().pendingEventId).toBe('leak');
    expect(dangerous.snapshot().pendingEventId).toBe('mystery-chest');
  });

  it('applies the chosen route to live event weights', () => {
    const drawAfterDirection = (choice: 'left' | 'right') => {
      const session = new SurvivalSession(saved(), {
        seed: 1,
        random: sequenceRandom([0, 0, 0.82]),
        initial: { day: 2 },
        initialEventId: 'needs-direction',
      });
      session.resolveEventChoice(choice);
      session.beginDawn();
      session.endDay();
      return session.snapshot();
    };

    expect(drawAfterDirection('left')).toMatchObject({ route: 'left', pendingEventId: 'check-the-back' });
    expect(drawAfterDirection('right')).toMatchObject({ route: 'right', pendingEventId: 'dangerous-waters' });
  });

  it('enforces max day only for first occurrence in the live draw', () => {
    const atBoundary = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([230 / 280]),
      initial: { day: 30 },
    });
    const afterBoundary = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([230 / 280]),
      initial: { day: 31 },
    });

    atBoundary.endDay();
    afterBoundary.endDay();

    expect(atBoundary.snapshot().pendingEventId).toBe('dangerous-waters');
    expect(afterBoundary.snapshot().pendingEventId).not.toBe('dangerous-waters');
  });

  it('allows a cooldown event to recur exactly on its boundary', () => {
    const afterInitialShower = (day: number) => {
      const session = new SurvivalSession(saved(), {
        seed: 1,
        random: sequenceRandom([0, 0, 0.35]),
        initial: { day: 2 },
        initialEventId: 'shower-night',
      });
      session.resolveEventChoice('sleep');
      session.beginDawn();
      setDay(session, day);
      session.endDay();
      return session.snapshot().pendingEventId;
    };

    expect(afterInitialShower(36)).not.toBe('shower-night');
    expect(afterInitialShower(37)).toBe('shower-night');
  });

  it('materializes fixed loss and break mutations on recovered instances', () => {
    const broken = new SurvivalSession(saved('map'), {
      seed: 1,
      random: sequenceRandom([0]),
      initialEventId: 'shower-night',
    });
    broken.resolveEventChoice('map');

    const lost = new SurvivalSession(saved('swimRing'), {
      seed: 1,
      random: sequenceRandom([0]),
      initial: { day: 8, danger: 1 },
      initialEventId: 'snatcher',
    });
    lost.resolveEventChoice('swimRing');

    expect(broken.snapshot().inventory.map.instances[0]?.condition).toBe('broken');
    expect(lost.snapshot().inventory.swimRing.instances[0]?.condition).toBe('lost');
  });

  it('loses only usable recovered instances and never a built-in item', () => {
    const session = new SurvivalSession(saved('repairKit', 'map'), {
      seed: 1,
      random: sequenceRandom([0, 0, 0]),
      initialEventId: 'thunderstorm',
    });

    session.resolveEventChoice('sleep');

    expect(session.snapshot().inventory.repairKit.instances[0]?.condition).toBe('usable');
    expect(session.snapshot().inventory.map.instances[0]?.condition).toBe('lost');
  });

  it('breaks only usable breakable recovered instances', () => {
    const session = new SurvivalSession(saved('fishingRod', 'map', 'umbrella', 'repairKit'), {
      seed: 1,
      random: sequenceRandom([0, 0, 0, 0]),
      initialEventId: 'windy-night',
    });

    session.resolveEventChoice('sleep');

    expect(session.snapshot().inventory.map.instances[0]?.condition).toBe('broken');
    expect(session.snapshot().inventory.umbrella.instances[0]?.condition).toBe('broken');
    expect(session.snapshot().inventory.fishingRod.instances[0]?.condition).toBe('usable');
    expect(session.snapshot().inventory.repairKit.instances[0]?.condition).toBe('usable');
  });

  it('keeps a private event-scoped Snatcher target that may be aggregate Food', () => {
    const itemTarget = new SurvivalSession(saved('anchor'), {
      seed: 1,
      random: sequenceRandom([0, 0]),
      initial: { day: 8, danger: 1 },
      initialEventId: 'snatcher',
    });
    itemTarget.resolveEventChoice('sleep');

    const foodTarget = new SurvivalSession(saved('cannedFood'), {
      seed: 1,
      random: sequenceRandom([0, 0]),
      initial: { day: 8, danger: 1 },
      initialEventId: 'snatcher',
    });
    foodTarget.resolveEventChoice('sleep');

    expect(itemTarget.snapshot().inventory.anchor.instances[0]?.condition).toBe('lost');
    expect(foodTarget.snapshot()).toMatchObject({ food: 0, recoveredFood: 0 });
  });

  it('uses the deprecated item adapter to identify a Handyman fallback offer', () => {
    const session = new SurvivalSession(saved('waterJug'), {
      seed: 1,
      random: sequenceRandom([0]),
      initial: { day: 20, danger: 2 },
      initialEventId: 'the-handyman',
    });

    session.resolveEvent('waterJug');

    expect(session.snapshot()).toMatchObject({ food: 1 });
    expect(session.snapshot().inventory.waterJug.instances[0]?.condition).toBe('lost');
  });

  it('rejects a direct Handyman any-item choice without an offered target', () => {
    const session = new SurvivalSession(saved('waterJug'), {
      seed: 1,
      initial: { day: 20, danger: 2 },
      initialEventId: 'the-handyman',
    });
    const before = session.snapshot();

    expect(session.resolveEventChoice('invalid-trade')).toMatchObject({
      accepted: false,
      code: 'item-target-required',
    });
    expect(session.snapshot()).toEqual(before);
  });

  it('applies next-day energy set effects exactly', () => {
    const session = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0.99]),
      initial: { energy: 0 },
      initialEventId: 'shower-night',
    });

    session.resolveEventChoice('sleep');

    expect(session.snapshot().energy).toBe(2);
  });

  it('doubles only negative night health and hull damage from day 50', () => {
    const resolveDamage = (day: number) => {
      const session = new SurvivalSession(saved(), {
        seed: 1,
        random: sequenceRandom([0, 0]),
        initial: { day, hull: 100 },
        initialEventId: 'dangerous-waters',
      });
      return session.resolveEventChoice('sleep').deltas.hull;
    };

    expect(resolveDamage(49)).toBe(-25);
    expect(resolveDamage(50)).toBe(-50);
  });

  it('doubles night health damage at day 50', () => {
    const resolveDamage = (day: number) => {
      const session = new SurvivalSession(saved('flashlight'), {
        seed: 1,
        random: sequenceRandom([0]),
        initial: { day, danger: 1, health: 100 },
        initialEventId: 'man-in-the-fog',
      });
      return session.resolveEventChoice('flashlight').deltas.health;
    };

    expect(resolveDamage(49)).toBe(-20);
    expect(resolveDamage(50)).toBe(-40);
  });

  it.each([
    [10, 0.90],
    [5, 0.95],
    [0, 1],
  ])('uses the Broken Boat formula at hull %i', (hull, expectedChance) => {
    expect(SurvivalSession.brokenBoatChance(hull)).toBe(expectedChance);
  });

  it('resolves Broken Boat automatically before an ordinary night draw', () => {
    const broken = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0.899]),
      initial: { hull: 10 },
    });
    const survived = new SurvivalSession(saved(), {
      seed: 1,
      random: sequenceRandom([0.901, 0]),
      initial: { hull: 10 },
    });

    expect(broken.endDay()).toMatchObject({ accepted: true, code: 'event-resolved', cue: 'sinking' });
    expect(broken.snapshot()).toMatchObject({
      state: 'sunk',
      pendingEventId: null,
      eventHistory: { 'broken-boat': { appearances: 1, firstDay: 1, lastDay: 1 } },
    });
    expect(survived.endDay()).toMatchObject({ accepted: true, code: 'event-opened' });
    expect(survived.snapshot()).toMatchObject({ state: 'nightEvent', pendingEventId: 'peaceful-night' });
  });

  it('never selects dormant records during ordinary night drawing', () => {
    const session = new SurvivalSession(saved('chest'), {
      seed: 1,
      random: sequenceRandom([0.999999]),
      initial: { day: 20, danger: 3 },
    });

    session.endDay();

    expect(['seagull', 'chest-attack', 'broken-boat']).not.toContain(session.snapshot().pendingEventId);
  });
});

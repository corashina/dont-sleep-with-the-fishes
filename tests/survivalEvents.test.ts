import { describe, expect, it } from 'vitest';
import { SURVIVAL_EVENTS, drawWeightedEvent, eligibleEvents } from '../src/survival/events';
import { sequenceRandom } from '../src/survival/random';

describe('survival events', () => {
  it('ships at least eight original events for each phase', () => {
    expect(SURVIVAL_EVENTS.filter((event) => event.phase === 'day').length).toBeGreaterThanOrEqual(8);
    expect(SURVIVAL_EVENTS.filter((event) => event.phase === 'night').length).toBeGreaterThanOrEqual(8);
    expect(new Set(SURVIVAL_EVENTS.map((event) => event.id)).size).toBe(SURVIVAL_EVENTS.length);
  });

  it('encodes the complete initial counter and endure effects', () => {
    const expected = {
      'day-heat-haze': ['waterJug', { energy: 1 }, { health: -8 }],
      'day-tangled-debris': ['flashlight', { repairMaterial: 1 }, { health: -6, repairMaterial: 1 }],
      'day-sudden-squall': ['ductTape', { hull: -3 }, { hull: -15 }],
      'day-circling-gulls': ['fishingRod', { food: 1 }, { food: -1 }],
      'day-dark-shape': ['flareGun', {}, { hull: -12 }],
      'day-floating-wreckage': ['flashlight', { food: 1, bait: 1 }, { health: -5, bait: 1 }],
      'day-hull-leak': ['ductTape', { hull: 5 }, { hull: -18 }],
      'day-distant-aircraft': ['flareGun', {}, { rescueProgress: 10 }],
      'night-hull-impact': ['flashlight', { hull: -2 }, { hull: -12 }],
      'night-violent-weather': ['ductTape', { hull: -5 }, { hull: -20 }],
      'night-strange-lights': ['flashlight', { rescueProgress: 10 }, { health: -5 }],
      'night-fish-activity': ['fishingRod', { food: 1 }, {}],
      'night-distant-calls': ['flareGun', { rescueProgress: 15 }, { health: -8 }],
      'night-drifting-wreckage': ['flashlight', { repairMaterial: 1 }, { hull: -8, repairMaterial: 1 }],
      'night-oppressive-darkness': ['flashlight', {}, { health: -6 }],
      'night-calm-water': ['waterJug', { hunger: -5 }, {}],
    } as const;

    expect(Object.keys(expected)).toHaveLength(16);
    for (const event of SURVIVAL_EVENTS) {
      const authored = expected[event.id as keyof typeof expected];
      expect(authored, event.id).toBeDefined();
      expect(event.responses).toHaveLength(1);
      expect(event.responses[0]).toMatchObject({ itemId: authored[0], deltas: authored[1] });
      expect(event.endure.deltas).toEqual(authored[2]);
      expect(event.unsuitable.deltas).toEqual(authored[2]);
    }
  });

  it('filters by phase, day, weather, immediate repeat, and cooldown', () => {
    const events = eligibleEvents(SURVIVAL_EVENTS, {
      phase: 'day', day: 2, weather: 'calm', lastEventId: 'day-heat-haze',
      lastSeenDay: new Map([['day-hull-leak', 1]]),
    });
    expect(events.every((event) => event.phase === 'day' && event.earliestDay <= 2)).toBe(true);
    expect(events.map((event) => event.id)).not.toContain('day-heat-haze');
    expect(events.map((event) => event.id)).not.toContain('day-hull-leak');
    expect(eligibleEvents(SURVIVAL_EVENTS, {
      phase: 'day', day: 2, weather: 'squall', lastEventId: null, lastSeenDay: new Map(),
    }).map((event) => event.id)).not.toContain('day-heat-haze');
  });

  it('draws by stable weighted boundaries and returns calm fallback for an empty pool', () => {
    const pool = SURVIVAL_EVENTS.filter((event) => event.phase === 'day').slice(0, 2);
    expect(drawWeightedEvent(pool, sequenceRandom([0])).id).toBe(pool[0]!.id);
    expect(drawWeightedEvent(pool, sequenceRandom([0.5])).id).toBe(pool[1]!.id);
    expect(drawWeightedEvent([], sequenceRandom([0]), 'day').id).toBe('day-calm-fallback');
    expect(drawWeightedEvent([], sequenceRandom([0]), 'night').id).toBe('night-calm-fallback');
  });
});

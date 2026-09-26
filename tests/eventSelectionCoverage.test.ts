// Importance: 95/100. Protects run variety without removing random repeats or event conditions.
import { describe, expect, it } from 'vitest';
import type { ItemId } from '../src/game/ItemState';
import { SURVIVAL_EVENTS } from '../src/survival/eventCatalog';
import { drawWeightedEvent, eligibleEvents, type EventEligibility } from '../src/survival/eventSelection';
import { mulberry32 } from '../src/survival/random';
import { pressureForDay } from '../src/survival/RunPressure';
import { SURVIVAL_BALANCE } from '../src/survival/survivalBalance';
import type { RandomSource } from '../src/survival/survivalTypes';
import { sequenceRandom } from './helpers/random';

function criteria(): EventEligibility {
  return {
    phase: 'night', day: 20, weather: 'calm', lastEventId: null,
    lastSeenDay: new Map(), appearanceCounts: new Map(),
    targetableItemIds: new Set<ItemId>(['cannedFood', 'anchor']),
    inventoryItemIds: new Set<ItemId>(['cannedFood', 'anchor']),
    rescueLead: 0, food: 3, chestState: 'none',
  };
}

function hasEventSlot(random: RandomSource, phase: 'day' | 'night', day: number): boolean {
  return phase === 'night'
    || (day >= SURVIVAL_BALANCE.dayEvents.firstDay
      && random.next() < SURVIVAL_BALANCE.dayEvents.chance);
}

// Isolate selection from death and endings. All runs reach day 35 with fixed inventory.
// Conditional events remain gated; special-trigger events never enter the random pool.
function simulateCoverage(seed: number, companionAndSignals: boolean) {
  const random = mulberry32(seed);
  const appearanceCounts = new Map<string, number>();
  const lastSeenDay = new Map<string, number>();
  const available = new Set<string>();
  let lastEventId: string | null = null;
  let coverageDay30 = 0;
  let nightRepeats = 0;
  for (let day = 1; day <= 35; day += 1) {
    for (const phase of ['day', 'night'] as const) {
      const eligibility: EventEligibility = {
        ...criteria(), day, phase, appearanceCounts, lastSeenDay, lastEventId,
        pressure: pressureForDay(day), hasCompanion: companionAndSignals,
        rescueLead: companionAndSignals && day >= 15 ? 2 : 0,
      };
      const pool = eligibleEvents(SURVIVAL_EVENTS, eligibility);
      for (const event of pool) available.add(event.id);
      if (!hasEventSlot(random, phase, day)) continue;
      const event = drawWeightedEvent(random, SURVIVAL_EVENTS, eligibility);
      if (event.id === 'day-calm-fallback') continue;
      const count = appearanceCounts.get(event.id) ?? 0;
      if (phase === 'night' && count > 0) nightRepeats += 1;
      appearanceCounts.set(event.id, count + 1);
      lastSeenDay.set(event.id, day);
      lastEventId = event.id;
    }
    if (day === 30) coverageDay30 = appearanceCounts.size / available.size;
  }
  return {
    coverageDay30,
    coverageDay35: appearanceCounts.size / available.size,
    nightRepeats,
  };
}

describe('event selection variety', () => {
  it('favors unseen events and reduces each repeat while keeping repeats possible', () => {
    const template = SURVIVAL_EVENTS.find(({ id }) => id === 'bad-sleep')!;
    const pool = ['unseen', 'once', 'twice'].map((id) => ({ ...template, id }));
    const eligibility = {
      ...criteria(), day: 10, appearanceCounts: new Map([['once', 1], ['twice', 2]]),
    };
    const counts = new Map<string, number>();
    for (let roll = 0; roll < 1000; roll += 1) {
      const event = drawWeightedEvent(sequenceRandom([(roll + 0.5) / 1000]), pool, eligibility);
      counts.set(event.id, (counts.get(event.id) ?? 0) + 1);
    }
    expect(counts.get('unseen')).toBeGreaterThan(800);
    expect(counts.get('once')).toBeGreaterThan(counts.get('twice')!);
    expect(counts.get('twice')).toBeGreaterThan(0);
  });

  it.each([false, true])('covers most eligible events by day 35 (companion and signals: %s)', (unlocks) => {
    const runs = Array.from({ length: 1000 }, (_, seed) => simulateCoverage(seed, unlocks));
    const average = (key: keyof typeof runs[number]) =>
      runs.reduce((total, run) => total + run[key], 0) / runs.length;
    const day35 = runs.map(({ coverageDay35 }) => coverageDay35).sort((a, b) => a - b);
    console.info({ unlocks, day30: average('coverageDay30'), day35: average('coverageDay35'),
      day35LowerDecile: day35[100], nightRepeats: average('nightRepeats') });
    expect(average('coverageDay30')).toBeGreaterThanOrEqual(0.75);
    expect(average('coverageDay35')).toBeGreaterThanOrEqual(0.85);
    expect(day35[100]).toBeGreaterThanOrEqual(0.8);
    expect(average('nightRepeats') / 35).toBeLessThan(0.25);
  });
});

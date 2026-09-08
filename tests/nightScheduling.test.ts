import { describe, expect, it } from 'vitest';
import type { ItemId } from '../src/game/ItemState';
import { SURVIVAL_EVENTS, survivalEventById } from '../src/survival/eventCatalog';
import { drawWeightedEvent, eligibleEvents, type EventEligibility } from '../src/survival/eventSelection';
import { mulberry32 } from '../src/survival/random';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createSurvivalSaveDocument, parseSurvivalSaveDocument } from '../src/survival/SurvivalSaveData';

const eligibility = (day: number): EventEligibility => ({
  phase: 'night', day, weather: 'calm', lastEventId: null,
  lastSeenDay: new Map(), appearanceCounts: new Map(),
  targetableItemIds: new Set<ItemId>(), inventoryItemIds: new Set<ItemId>(),
  rescueLead: 0, pressure: 0, chestState: 'closed', hasLivingCompanion: false,
});

describe('night scheduling', () => {
  it('never repeats Guarded Sleep, even after a long delay', () => {
    const pool = eligibleEvents(SURVIVAL_EVENTS, {
      ...eligibility(50), hasLivingCompanion: true,
      appearanceCounts: new Map([['guarded-sleep', 1]]),
      lastSeenDay: new Map([['guarded-sleep', 7]]),
    });
    expect(pool.map(({ id }) => id)).not.toContain('guarded-sleep');
  });

  it('makes Quiet Night eligible again exactly 15 days after its last occurrence', () => {
    const quiet = survivalEventById('quiet-night');
    expect(quiet).toBeDefined();
    const criteria = { ...eligibility(15), lastSeenDay: new Map([['quiet-night', 1]]) };
    expect(eligibleEvents([quiet!], criteria)).toEqual([]);
    expect(eligibleEvents([quiet!], { ...criteria, day: 16 })).toEqual([quiet]);
  });

  it('preserves automatic Quiet Night history through save and load', () => {
    const session = new SurvivalSession([], { seed: 3 });
    expect(session.endDay().code).toBe('quiet-night');
    expect(session.beginDawn().accepted).toBe(true);
    const document = createSurvivalSaveDocument({
      scavengeElapsedSeconds: 0, session: session.exportCheckpoint(),
    });
    const parsed = parseSurvivalSaveDocument(JSON.parse(JSON.stringify(document)));
    expect(parsed).not.toBeNull();
    const restored = SurvivalSession.restore(parsed!.checkpoint.session);
    const checkpoint = restored.exportCheckpoint();
    expect(checkpoint.lastSeenDays['quiet-night']).toBe(1);
    expect(checkpoint.appearanceCounts['quiet-night']).toBe(1);
    expect(restored.endDay().code).toBe('event-opened');
    expect(restored.snapshot().pendingEventId).not.toBe('quiet-night');
  });

  it('keeps a night event available through day 50 without companion, equipment, or rescue leads', () => {
    for (const pressure of [0, 1, 2, 3, 4]) {
      for (let seed = 1; seed <= 100; seed += 1) {
        const random = mulberry32(seed);
        const lastSeenDay = new Map<string, number>();
        const appearanceCounts = new Map<string, number>();
        let lastEventId: string | null = null;
        for (let day = 1; day <= 50; day += 1) {
          const criteria = { ...eligibility(day), pressure, lastEventId, lastSeenDay, appearanceCounts };
          expect(eligibleEvents(SURVIVAL_EVENTS, criteria).length, `seed ${seed}, pressure ${pressure}, day ${day}`)
            .toBeGreaterThan(0);
          const event = drawWeightedEvent(random, SURVIVAL_EVENTS, criteria);
          if (event.id === 'quiet-night') {
            expect(day - (lastSeenDay.get(event.id) ?? -15)).toBeGreaterThanOrEqual(15);
          }
          lastSeenDay.set(event.id, day);
          appearanceCounts.set(event.id, (appearanceCounts.get(event.id) ?? 0) + 1);
          lastEventId = event.id;
        }
      }
    }
  });
});

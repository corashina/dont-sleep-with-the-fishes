import { describe, expect, it } from 'vitest';
import {
  formatJournalEntry,
  type JournalEntry,
  type JournalEventRecord,
} from '../src/survival/journal';

const event = (overrides: Partial<JournalEventRecord> = {}): JournalEventRecord => ({
  phase: 'night',
  eventId: 'night-hull-impact',
  title: 'Hull Impact',
  prompt: 'Something heavy knocked against the hull in the darkness.',
  attemptedItemId: 'flashlight',
  resolution: 'suitableItem',
  outcomeCode: 'event-resolved',
  outcomeMessage: 'The beam let me fend the debris away.',
  ...overrides,
});

const entry = (overrides: Partial<JournalEntry> = {}): JournalEntry => ({
  day: 4,
  weather: 'overcast',
  daytime: null,
  nighttime: event(),
  ...overrides,
});

describe('formatJournalEntry', () => {
  it('writes a quiet day and a suitable item attempt as story prose', () => {
    const page = formatJournalEntry(entry());
    expect(page).toEqual({
      heading: 'DAY 4',
      weather: 'OVERCAST',
      daytime: 'The daylight hours passed quietly.',
      nighttime: 'That night, I encountered hull impact. I used the flashlight to handle it, and it helped.',
    });
  });

  it('describes an unsuitable item without repeating the system fallback', () => {
    const page = formatJournalEntry(entry({
      daytime: event({
        phase: 'day',
        eventId: 'day-sudden-squall',
        title: 'Sudden Squall',
        prompt: 'A black squall line bore down before I could prepare.',
        attemptedItemId: 'waterJug',
        resolution: 'unsuitableItem',
        outcomeMessage: 'That item cannot help. The squall tore open weak seams in the hull.',
      }),
    }));
    expect(page.daytime).toBe('During the day, I encountered sudden squall. I tried the water bottle, but it did not help.');
    expect(page.daytime).not.toContain('That item cannot help');
  });

  it('describes endurance without naming inventory or resource deltas', () => {
    const page = formatJournalEntry(entry({
      nighttime: event({
        attemptedItemId: null,
        resolution: 'endure',
        outcomeMessage: 'Repeated impacts cracked the hull.',
      }),
    }));
    expect(page.nighttime).toBe('That night, I encountered hull impact. I faced it without using any supplies.');
    expect(JSON.stringify(page)).not.toMatch(/charges|repairMaterial|hull:\s*-/i);
  });

  it.each(['suitableItem', 'unsuitableItem'] as const)(
    'throws a clear error when %s has no attempted item',
    (resolution) => {
      expect(() => formatJournalEntry(entry({
        nighttime: event({ attemptedItemId: null, resolution }),
      }))).toThrowError(
        `Journal event night-hull-impact with ${resolution} resolution requires an attempted item.`,
      );
    },
  );
});

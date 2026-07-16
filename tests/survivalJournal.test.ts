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
  attemptedChoiceId: 'flashlight',
  attemptedItemId: 'flashlight',
  resolution: 'suitableItem',
  outcomeCode: 'event-resolved',
  outcomeMessage: 'The beam let me fend the debris away.',
  inventoryMutations: [],
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
        attemptedChoiceId: 'bucket',
        attemptedItemId: 'bucket',
        resolution: 'unsuitableItem',
        outcomeMessage: 'That item cannot help. The squall tore open weak seams in the hull.',
      }),
    }));
    expect(page.daytime).toBe('During the day, I encountered sudden squall. I tried the bucket, but it did not help.');
    expect(page.daytime).not.toContain('That item cannot help');
  });

  it('describes endurance without naming inventory or resource deltas', () => {
    const page = formatJournalEntry(entry({
      nighttime: event({
        attemptedChoiceId: null,
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

  it('mentions concrete broken, consumed, lost, and repaired catalog items without instance IDs', () => {
    const page = formatJournalEntry(entry({
      nighttime: event({
        inventoryMutations: [
          { kind: 'break', instanceIds: ['bucket-1'] },
          { kind: 'consume', instanceIds: ['flareGun-1'] },
          { kind: 'lose', instanceIds: ['map-1'] },
          { kind: 'repair', instanceIds: ['anchor-1'] },
        ],
      }),
    }));

    expect(page.nighttime).toMatch(/bucket/i);
    expect(page.nighttime).toMatch(/flare gun/i);
    expect(page.nighttime).toMatch(/map/i);
    expect(page.nighttime).toMatch(/anchor/i);
    expect(page.nighttime).not.toMatch(/bucket-1|flareGun-1|map-1|anchor-1/);
  });

  it('keeps attempted choice and item facts distinct from the concrete outcome', () => {
    const record = event({
      attemptedChoiceId: 'bucket',
      attemptedItemId: 'bucket',
      outcomeMessage: 'The bucket breaks.',
      inventoryMutations: [{ kind: 'break', instanceIds: ['bucket-1'] }],
    });
    expect(record).toMatchObject({
      attemptedChoiceId: 'bucket', attemptedItemId: 'bucket', outcomeMessage: 'The bucket breaks.',
    });
    expect(record.inventoryMutations).toEqual([{ kind: 'break', instanceIds: ['bucket-1'] }]);
  });

  it('uses plural verbs for multi-item mutation summaries', () => {
    const page = formatJournalEntry(entry({
      nighttime: event({
        inventoryMutations: [{ kind: 'lose', instanceIds: ['anchor-1', 'map-1'] }],
      }),
    }));

    expect(page.nighttime).toContain('The anchor and map were lost.');
    expect(page.nighttime).not.toContain('anchor and map was lost');
  });
});

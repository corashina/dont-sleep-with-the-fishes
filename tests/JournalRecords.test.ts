import { describe, expect, it } from 'vitest';
import type { JournalEntry } from '../src/survival/journal';
import { cloneJournalEntry, journalSnapshot } from '../src/survival/journalRecords';

const entryFixture: JournalEntry = {
  day: 2,
  weather: 'overcast',
  actions: [],
  daytime: null,
  nighttime: {
    kind: 'event',
    event: {
      phase: 'night',
      eventId: 'night-trader',
      title: 'Night Trader',
      prompt: 'A boat appears nearby.',
      attemptedChoiceId: 'trade',
      choiceLabel: 'Trade',
      attemptedItemId: null,
      outcomeCode: 'event-resolved',
      outcomeMessage: 'The trade succeeds.',
      inventoryMutations: [],
    },
  },
};

describe('journal records', () => {
  it('clones nested journal mutations', () => {
    const clone = cloneJournalEntry(entryFixture);

    expect(clone).toEqual(entryFixture);
    expect(clone).not.toBe(entryFixture);
    expect(clone.nighttime).not.toBe(entryFixture.nighttime);
  });

  it('freezes the returned journal snapshot', () => {
    const snapshot = journalSnapshot([entryFixture]);

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot[0])).toBe(true);
  });
});

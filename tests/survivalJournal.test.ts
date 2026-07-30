// Importance: 4/5. Protects authored event result text.
import { describe, expect, it } from 'vitest';
import { formatJournalEntry, type JournalEntry } from '../src/survival/journal';

describe('survival event journal', () => {
  it('records the rare stern face in its authored voice', () => {
    const entry: JournalEntry = {
      day: 8,
      weather: 'calm',
      actions: [],
      daytime: null,
      nighttime: {
        kind: 'event',
        event: {
          phase: 'night',
          eventId: 'check-the-back',
          title: 'Check the Back',
          prompt: 'Choose a response.',
          attemptedChoiceId: 'check',
          attemptedItemId: null,
          resolution: 'endure',
          outcomeCode: 'event-resolved',
          outcomeMessage: 'You see yourself looking back.',
          eventPresentationKey: 'check-the-back.face',
          inventoryMutations: [],
        },
      },
    };

    expect(formatJournalEntry(entry).nighttime).toBe(
      'I looked at me. And I looked back.',
    );
  });
});

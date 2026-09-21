import { describe,expect,it } from 'vitest';
import { journalItemChanges } from '../src/survival/journalItemChanges';
import { createJournalEntry,type JournalEntry } from '../src/survival/journalRecords';

function changes(entry: JournalEntry, phase: 'day' | 'night' = 'day') {
  return journalItemChanges(entry)[phase].map(({ itemId, kind }) => `${kind}:${itemId}`);
}

describe('journal resource changes', () => {
  it('counts recovered supplies once and preserves separate gains and losses', () => {
    const entry = createJournalEntry(2, 'calm', [{
      kind: 'dayAction', action: 'dive', deltas: { food: 1, bait: 1 },
      inventoryMutations: [{ kind: 'gain', instanceIds: ['cannedFood-1', 'baitTin-1'] }],
    }, { kind: 'carlitosCare', action: 'feed' }], null, { kind: 'quiet' });
    expect(changes(entry)).toEqual(['gain:cannedFood', 'gain:baitTin', 'consume:cannedFood']);
  });

  it('keeps night resource losses on the night page and counts inventory losses once', () => {
    const entry = createJournalEntry(2, 'calm', [], null, { kind: 'event', event: {
      phase: 'night', eventId: 'snatcher', attemptedChoiceId: 'sleep', attemptedItemId: null,
      outcomeCode: 'event-resolved', text: { kind: 'domain', id: 'fallbackFood' }, deltas: { food: -2, bait: -1 },
      inventoryMutations: [{ kind: 'lose', instanceIds: ['cannedFood-1'] }],
    } });
    expect(changes(entry)).toEqual([]);
    expect(changes(entry, 'night')).toEqual(['lose:cannedFood', 'lose:cannedFood', 'lose:baitTin']);
  });
});

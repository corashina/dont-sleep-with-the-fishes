// Importance: 95/100. Journal totals must match net gains without altering saved records.
import { expect, it } from 'vitest';
import { journalItemChanges } from '../src/survival/journalItemChanges';
import type { JournalEntry, JournalEventRecord } from '../src/survival/journalRecords';

function entry(foodChanges: number[]): JournalEntry {
  return {
    day: 1, weather: 'calm', nightWeather: 'calm', daytime: null, nighttime: { kind: 'quiet' },
    actions: foodChanges.map(food => ({ kind: 'dayAction', action: 'dive', deltas: { food }, inventoryMutations: [] })),
  };
}

it.each([
  [[2, -1], 1, 'gain'], [[1, -2], 1, 'consume'], [[2, -2], 0, 'gain'], [[2, -1, 2], 3, 'gain'],
] as const)('aggregates food changes %j', (changes, count, kind) => {
  const record = entry([...changes]);
  const before = structuredClone(record);
  const result = journalItemChanges(record).day;
  expect(result).toHaveLength(count);
  expect(result.every(change => change.itemId === 'cannedFood' && change.kind === kind)).toBe(true);
  expect(record).toEqual(before);
});

it('combines food from fishing and feeding Carlitos while keeping bait separate', () => {
  const record: JournalEntry = { ...entry([]), actions: [
    { kind: 'fishing', attemptId: '1', result: 'fish', catchId: null, food: 2, baitConsumed: true,
      deltas: { food: 2, bait: -1 }, inventoryMutations: [] },
    { kind: 'carlitosCare', action: 'feed' },
  ] };
  expect(journalItemChanges(record).day).toEqual([
    expect.objectContaining({ itemId: 'cannedFood', kind: 'gain' }),
    expect.objectContaining({ itemId: 'baitTin', kind: 'consume' }),
  ]);
});

it('keeps day and night totals separate and preserves repair and break records', () => {
  const night: JournalEventRecord = {
    phase: 'night', eventId: 'quiet-night', attemptedChoiceId: 'sleep', attemptedItemId: null,
    outcomeCode: 'event-resolved', text: { kind: 'eventPrompt', eventId: 'quiet-night' },
    deltas: { food: -1 }, inventoryMutations: [],
  };
  const record: JournalEntry = { ...entry([2]), nighttime: { kind: 'event', event: night },
    actions: [...entry([2]).actions, { kind: 'dayAction', action: 'repairItem', deltas: {}, inventoryMutations: [
      { kind: 'break', instanceIds: ['compass-1'] }, { kind: 'repair', instanceIds: ['compass-1'] },
    ] }],
  };
  const result = journalItemChanges(record);
  expect(result.day.map(change => change.kind)).toEqual(['gain', 'gain', 'break', 'repair']);
  expect(result.night).toEqual([expect.objectContaining({ itemId: 'cannedFood', kind: 'lose' })]);
});

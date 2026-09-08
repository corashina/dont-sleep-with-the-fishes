import type { ItemInstanceId } from '../game/ItemState';
import { survivalEventById, type SurvivalEventId } from './eventCatalog';
import {
  createJournalEntry,
  createJournalEventRecord,
  createJournalNightEventRecord,
  type JournalEntry,
} from './journalRecords';

function sampleEvent(eventId: SurvivalEventId, choiceId: string, outcomeIndex = 0) {
  const event = survivalEventById(eventId);
  const choice = event?.choices.find(({ id }) => id === choiceId);
  const outcome = choice?.outcomes[outcomeIndex];
  if (!event || !choice || !outcome?.resultId) {
    throw new Error(`Missing lab journal outcome: ${eventId}/${choiceId}/${outcomeIndex}`);
  }
  const inventoryMutations = (outcome.effects.items ?? []).map((mutation) => {
    if (!('itemId' in mutation)) throw new Error('Lab journal examples require fixed item outcomes.');
    return {
      kind: mutation.kind,
      instanceIds: Array.from({ length: mutation.quantity }, (_, index) =>
        `${mutation.itemId}-${index + 1}` as ItemInstanceId),
    };
  });
  return createJournalEventRecord(event, choiceId, choice.itemId ?? null, {
    code: 'lab-journal-example',
    text: { kind: 'eventResult', reference: { eventId, choiceId, resultId: outcome.resultId } },
  }, inventoryMutations);
}

export function createItemAnimationLabJournal(): readonly JournalEntry[] {
  return Object.freeze([
    createJournalEntry(1, 'calm', [], null, { kind: 'quiet' }),
    // Find medicine by day and lose the map at night.
    createJournalEntry(2, 'overcast', [], sampleEvent('wreckage', 'dive'),
      createJournalNightEventRecord(sampleEvent('windy-night', 'map'))),
    // Use the medicine, then break the knife defending the boat.
    createJournalEntry(3, 'squall', [
      { kind: 'dayAction', action: 'treat', deltas: { health: 10 },
        inventoryMutations: [{ kind: 'consume', instanceIds: ['medicalKit-1'] }] },
      { kind: 'fishing', attemptId: 'lab-journal-fishing', result: 'fish', catchId: 'cod', food: 1, baitConsumed: true },
    ], null, createJournalNightEventRecord(sampleEvent('swarm-of-sharks', 'knife', 1))),
    // Repair the knife and trade the swim ring for a radio.
    createJournalEntry(4, 'calm', [
      { kind: 'dayAction', action: 'repairItem', deltas: {}, inventoryMutations: [
        { kind: 'repair', instanceIds: ['knife-1'] },
        { kind: 'consume', instanceIds: ['ductTape-1'] },
      ] },
    ], null, createJournalNightEventRecord(sampleEvent('night-trader', 'swimRing'))),
    // Find and use the same item across both sections of a longer page.
    createJournalEntry(5, 'overcast', [
      { kind: 'carlitosCare', action: 'feed' },
      { kind: 'carlitosCare', action: 'pet' },
    ], sampleEvent('wreckage', 'dive', 1),
    createJournalNightEventRecord(sampleEvent('other-people', 'flareGun'))),
  ]);
}

import { describe,expect,it,vi } from 'vitest';
import { journalItemChanges } from '../src/survival/journalItemChanges';
import { createJournalEntry,type JournalEntry } from '../src/survival/journalRecords';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createSurvivalSaveDocument,parseSurvivalSaveDocument } from '../src/survival/SurvivalSaveData';
import { fishingRoll } from './helpers/fishing';
import { sequenceRandom } from './helpers/random';
import { Mulberry32Random } from '../src/survival/random';

function savedRandom(values: readonly number[]): Mulberry32Random {
  const random = new Mulberry32Random(1);
  vi.spyOn(random, 'next').mockImplementation(sequenceRandom(values).next);
  return random;
}

function pendingEntry(session: SurvivalSession): JournalEntry {
  const document = createSurvivalSaveDocument({ scavengeElapsedSeconds: 0, session: session.exportCheckpoint() });
  const parsed = parseSurvivalSaveDocument(JSON.parse(JSON.stringify(document)));
  expect(parsed).toEqual(document);
  const checkpoint = SurvivalSession.restore(parsed!.checkpoint.session).exportCheckpoint();
  return createJournalEntry(checkpoint.day, 'calm', checkpoint.pendingJournalActions,
    checkpoint.pendingJournalDaytime, checkpoint.pendingJournalNighttime ?? { kind: 'quiet' });
}

function changes(entry: JournalEntry, phase: 'day' | 'night' = 'day') {
  return journalItemChanges(entry)[phase].map(({ itemId, kind }) => `${kind}:${itemId}`);
}

describe('journal resource changes', () => {
  it.each([
    ['tuna', false, ['gain:cannedFood', 'gain:cannedFood']],
    ['cod', true, ['gain:cannedFood', 'consume:baitTin']],
    ['bait', false, ['gain:baitTin']],
    ['wetDuctTape', false, ['gain:ductTape']],
    ['brokenCompass', false, ['gain:compass']],
  ] as const)('records and saves %s rewards with bait=%s', (catchId, bait, expected) => {
    const present = bait ? new Set(['baitTin'] as const) : new Set<never>();
    const session = new SurvivalSession(bait ? [{ type: 'baitTin', instanceId: 'baitTin-1' }] : [], {
      seed: 1, initial: { day: 3 },
      random: savedRandom([0, fishingRoll(catchId, 3, bait, present)]),
    });
    const started = session.beginFishing();
    if (!started.accepted) throw new Error('Fishing unavailable');
    const attempt = started.attempt;
    attempt.cast({ x: 4, z: -2 });
    attempt.completeCast();
    attempt.advance(attempt.snapshot().biteDelaySeconds);
    const result = attempt.reel().result!;
    attempt.completeReel();
    expect(session.finishFishing(attempt.snapshot().id, result).accepted).toBe(true);
    expect(changes(pendingEntry(session))).toEqual(expected);
  });

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

import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../src/i18n/language';
import { resourceQuantity } from '../src/i18n/resourceMessages';
import { ITEM_DEFINITIONS, ITEM_IDS, ITEM_LABELS } from '../src/game/ItemState';
import { endingCauseLine, endingSummary, endingTitle } from '../src/game/ending';
import { FISHING_CATCHES } from '../src/survival/fishingCatalog';
import { SURVIVAL_ITEM_DESCRIPTIONS } from '../src/survival/itemDescriptions';
import { formatJournalEntry } from '../src/survival/journal';
import { createJournalEntry, createJournalFishingRecord, createQuietJournalNightRecord } from '../src/survival/journalRecords';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createSurvivalSaveDocument, parseSurvivalSaveDocument } from '../src/survival/SurvivalSaveData';
import { fishingSettlement } from '../src/survival/fishingSettlementRules';
import { cloneActionOutcome } from '../src/survival/outcomeText';

afterEach(() => setLanguage('en'));

describe('domain language', () => {
  it('updates retained item and fishing definitions without replacing their identities', () => {
    const items = ITEM_IDS.map((id) => ITEM_DEFINITIONS[id]);
    const englishDescriptions = ITEM_IDS.map((id) => SURVIVAL_ITEM_DESCRIPTIONS[id]);
    const englishCatches = FISHING_CATCHES.map(({ label }) => label);
    setLanguage('pl');
    expect(ITEM_LABELS.medicalKit).toBe('APTECZKA');
    expect(items[0]?.label).toBe('JEDZENIE');
    for (const [index, id] of ITEM_IDS.entries()) {
      expect(ITEM_DEFINITIONS[id]).toBe(items[index]);
      expect(SURVIVAL_ITEM_DESCRIPTIONS[id]).not.toBe(englishDescriptions[index]);
    }
    for (const [index, entry] of FISHING_CATCHES.entries()) expect(entry.label).not.toBe(englishCatches[index]);
  });

  it.each([[1, '1 porcja jedzenia'], [2, '2 porcje jedzenia'], [5, '5 porcji jedzenia'], [12, '12 porcji jedzenia'], [22, '22 porcje jedzenia']] as const)(
    'uses the Polish resource form for %i', (quantity, expected) => {
      setLanguage('pl');
      expect(resourceQuantity('food', quantity)).toBe(expected);
    },
  );

  it('updates an accepted outcome and cached snapshot without changing simulation state', () => {
    const session = new SurvivalSession([], { seed: 41, initial: { food: 2, hunger: 60 } });
    const outcome = session.perform('eat');
    const snapshot = session.snapshot();
    const savedState = JSON.stringify(session.exportCheckpoint());
    expect(outcome.message).toBe('The food takes the edge off your hunger.');
    setLanguage('pl');
    expect(outcome.message).toBe('Jedzenie nieco zaspokaja twój głód.');
    expect(snapshot.lastOutcome?.message).toBe(outcome.message);
    expect(cloneActionOutcome(outcome).message).toBe(outcome.message);
    expect(session.snapshot()).toBe(snapshot);
    expect(JSON.stringify(session.exportCheckpoint())).toBe(savedState);
  });

  it('keeps action codes stable when Polish rules reject an action', () => {
    const session = new SurvivalSession([], { seed: 1, initial: { food: 0 } });
    setLanguage('pl');
    const outcome = session.perform('eat');
    expect(outcome.code).toBe('no-food');
    expect(outcome.message).toBe('Nie ma już jedzenia.');
    setLanguage('en');
    expect(outcome.message).toBe('No food remains.');
  });

  it('updates fishing results and history from catch IDs', () => {
    const definition = FISHING_CATCHES.find(({ id }) => id === 'salmon')!;
    const result = { kind: 'catch', catch: definition } as const;
    const settlement = fishingSettlement(result, true);
    const record = createJournalFishingRecord('test-catch', result, 1, true);
    const entry = createJournalEntry(1, 'calm', [record], null, createQuietJournalNightRecord());
    expect(JSON.stringify(record)).not.toContain('catchLabel');
    expect(formatJournalEntry(entry).daytime).toContain('salmon');
    setLanguage('pl');
    expect(settlement.message).toContain('łosoś');
    expect(formatJournalEntry(entry).daytime).toContain('łosoś');
    expect(formatJournalEntry(entry).nighttime).toContain('Śpię bez przeszkód');
  });

  it('reloads event outcomes in Polish with no saved display text', () => {
    const session = new SurvivalSession([], { seed: 41, initial: { day: 3 }, initialEventId: 'wreckage' });
    const outcome = session.resolveEvent({ kind: 'choice', choiceId: 'search' });
    const englishMessage = outcome.message;
    const document = createSurvivalSaveDocument({ scavengeElapsedSeconds: 8, session: session.exportCheckpoint() });
    const serialized = JSON.stringify(document);
    expect(serialized).not.toMatch(/"(?:message|title|prompt|choiceLabel|outcomeMessage|catchLabel)":/);
    setLanguage('pl');
    const parsed = parseSurvivalSaveDocument(JSON.parse(serialized));
    expect(parsed).not.toBeNull();
    const restored = SurvivalSession.restore(parsed!.checkpoint.session);
    expect(restored.snapshot().lastOutcome?.message).toBe(outcome.message);
    expect(outcome.message).not.toBe(englishMessage);
    expect(JSON.parse(JSON.stringify(restored.exportCheckpoint()))).toEqual(JSON.parse(JSON.stringify(session.exportCheckpoint())));
  });

  it('reloads completed event history and preserves its recorded outcome', () => {
    const session = new SurvivalSession([], { seed: 41, initialEventId: 'bad-sleep' });
    session.resolveEvent({ kind: 'choice', choiceId: 'sleep' });
    session.beginDawn();
    const english = formatJournalEntry(session.snapshot().journalEntries[0]!);
    const serialized = JSON.stringify(createSurvivalSaveDocument({ scavengeElapsedSeconds: 8, session: session.exportCheckpoint() }));
    setLanguage('pl');
    const parsed = parseSurvivalSaveDocument(JSON.parse(serialized));
    expect(parsed).not.toBeNull();
    const restored = SurvivalSession.restore(parsed!.checkpoint.session);
    const entry = restored.snapshot().journalEntries[0]!;
    expect(formatJournalEntry(entry).heading).toBe('DZIEŃ 1');
    expect(formatJournalEntry(entry).nighttime).not.toBe(english.nighttime);
    expect(entry).toEqual(session.snapshot().journalEntries[0]);
    if (entry.nighttime.kind !== 'event') throw new Error('Expected an event journal entry.');
    const text = entry.nighttime.event.text;
    expect(Object.isFrozen(text)).toBe(true);
    if (text.kind === 'eventResult') expect(Object.isFrozen(text.reference)).toBe(true);
  });

  it('rejects a complete obsolete version 2 save', () => {
    const session = new SurvivalSession([], { seed: 41 });
    const document = createSurvivalSaveDocument({ scavengeElapsedSeconds: 8, session: session.exportCheckpoint() });
    expect(parseSurvivalSaveDocument({ ...document, version: 2 })).toBeNull();
  });

  it('translates ending titles and event causes', () => {
    setLanguage('pl');
    const ending = { id: 'sinking', day: 5, savedPickupCount: 3, cause: { eventId: 'wreckage' } } as const;
    expect(endingTitle(ending)).toBe('ŁÓDŹ ZNIKNĘŁA');
    expect(endingSummary(ending)).toBe('DZIEŃ 5');
    expect(endingCauseLine(ending)).toContain('OSTATNIE ZDARZENIE:');
    expect(endingCauseLine(ending)).not.toContain('WRECKAGE');
  });
});

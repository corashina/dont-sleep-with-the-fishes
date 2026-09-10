import { afterEach,describe,expect,it } from 'vitest';
import { setLanguage } from '../src/i18n/language';
import { SURVIVAL_EVENTS,survivalEventById } from '../src/survival/eventCatalog';
import { formatJournalEntry } from '../src/survival/journal';
import { formatJournalEvent } from '../src/survival/journalEvents';
import { formatJournalMutations } from '../src/survival/journalInventory';
import { createCarlitosState } from '../src/survival/CarlitosState';
import {
  createJournalCarlitosDawnRecord,createJournalCarlitosDawnState,createJournalEntry,
  type JournalEventRecord,type JournalInventoryMutation,
} from '../src/survival/journalRecords';
import type { ItemInstanceId } from '../src/game/ItemState';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from './helpers/random';

const noStats = /\d|[+−]\s*\d|\b(?:health|hull|energy|food|bait)\s*[+-]|\b(?:one|two|three) (?:food|bait|energy)|\b(?:punkty|punktów|punktami)\b/i;

afterEach(() => setLanguage('en'));

function eventRecord(eventId: string, choiceId: string, index = 0): JournalEventRecord {
  const event = survivalEventById(eventId)!;
  const choice = event.choices.find(({ id }) => id === choiceId)!;
  const outcome = choice.outcomes[index]!;
  const mutations: JournalInventoryMutation[] = [];
  for (const mutation of outcome.effects.items ?? []) {
    if ('itemId' in mutation) {
      mutations.push({ kind: mutation.kind, instanceIds: [`${mutation.itemId}-1` as ItemInstanceId] });
    }
  }
  return {
    phase: event.phase, eventId, attemptedChoiceId: choiceId, attemptedItemId: choice.itemId ?? null,
    outcomeCode: 'test',
    deltas: {},
    text: { kind: 'eventResult', reference: { eventId, choiceId, resultId: outcome.resultId! } },
    inventoryMutations: mutations,
  };
}

describe('journal narrative', () => {
  it.each(['en', 'pl', 'es-AR'] as const)('covers every event result in %s without statistics or menu labels', (language) => {
    setLanguage(language);
    const catalog = [...SURVIVAL_EVENTS, survivalEventById('day-calm-fallback')!];
    for (const event of catalog) {
      for (const choice of event.choices) {
        choice.outcomes.forEach((_, index) => {
          const copy = formatJournalEvent(eventRecord(event.id, choice.id, index));
          expect(copy, `${event.id}/${choice.id}/${index}`).not.toMatch(noStats);
          expect(copy).not.toMatch(/I chose|Mój wybór|Zdarzenie nocą|Zdarzenie za dnia|undefined/);
          expect(copy.trim().length).toBeGreaterThan(15);
        });
      }
    }
  });

  it.each(['en', 'pl', 'es-AR'] as const)('describes both directions of Carlitos needs correctly in %s', (language) => {
    setLanguage(language);
    const before = { ...createCarlitosState(), hunger: 3, unhappiness: 6, rest: 'tired' as const };
    const worse = { ...before, hunger: 1, unhappiness: 7, rest: 'exhausted' as const };
    const better = { ...before, hunger: 4, unhappiness: 2, rest: 'rested' as const };
    const copy = (after: ReturnType<typeof createCarlitosState>) => formatJournalEntry(createJournalEntry(
      2, 'calm', [createJournalCarlitosDawnRecord(before, after)], null, { kind: 'quiet' },
    )).nighttime;
    const bad = copy(worse);
    const good = copy(better);
    for (const text of [bad, good]) expect(text).not.toMatch(noStats);
    for (const word of language === 'en' ? ['starving', 'depressed', 'too tired'] : language === 'pl' ? ['jest bardzo głodny', 'przygnębionego', 'zbyt zmęczony'] : ['muy hambriento', 'deprimido', 'demasiado cansado']) {
      expect(bad).toContain(word);
      expect(good).not.toContain(word);
    }
    for (const word of language === 'en' ? ['less hungry', 'happier'] : language === 'pl' ? ['tak głodnego', 'poweselał'] : ['tanta hambre', 'contento']) {
      expect(good).toContain(word);
    }
  });

  it('does not invent changes when Carlitos stays the same', () => {
    const before = createJournalCarlitosDawnState(createCarlitosState());
    const unchanged = formatJournalEntry(createJournalEntry(2, 'calm', [createJournalCarlitosDawnRecord(before, before)], null, { kind: 'quiet' }));
    expect(unchanged.nighttime).not.toContain('Carlitos');
  });

  it.each(['en', 'pl', 'es-AR'] as const)('mentions each narrated item consequence once in %s', (language) => {
    setLanguage(language);
    const cases = [
      ['leak', 'map', 1],
      ['swarm-of-sharks', 'fishingNet', 1], ['swarm-of-sharks', 'knife', 1],
      ['windy-night', 'fishingNet', 1], ['windy-night', 'map', 0], ['windy-night', 'umbrella', 1],
      ['bad-sleep', 'umbrella', 1], ['check-the-back', 'knife', 1],
    ] as const;
    for (const [event, choice, index] of cases) {
      const record = eventRecord(event, choice, index);
      const copy = formatJournalEvent(record);
      expect(copy).not.toContain(formatJournalMutations(record.inventoryMutations));
      expect(record.inventoryMutations).toHaveLength(1);
      expect(copy).not.toMatch(noStats);
    }
  });

  it('retains consequences for other items and other kinds of change', () => {
    const record = eventRecord('swarm-of-sharks', 'knife', 1);
    const extra: JournalInventoryMutation[] = [
      { kind: 'break', instanceIds: ['bucket-1'] },
      { kind: 'lose', instanceIds: ['knife-1'] },
    ];
    const copy = formatJournalEvent({ ...record, inventoryMutations: [...record.inventoryMutations, ...extra] });
    expect(copy).toContain(formatJournalMutations(extra));
    expect(copy).not.toContain(formatJournalMutations(record.inventoryMutations));
    expect(copy).toContain('blade snapped');
  });

  it('describes traded equipment as payment instead of consumed ammunition or medicine', () => {
    for (const id of ['flareGun', 'shotgun', 'medicalKit', 'ductTape']) {
      const copy = formatJournalEvent(eventRecord('handyman', id));
      expect(copy).toContain('for the trade');
      expect(copy).toContain('completed the exchange');
      expect(copy).not.toMatch(/last shell|last flare|medkit was empty|last of the duct tape|lost .*trouble/);
    }
  });

  it('names the actual missing same-weight Handyman reward', () => {
    const session = new SurvivalSession([
      { type: 'anchor', instanceId: 'anchor-1' },
    ], { seed: 1, initialEventId: 'handyman', random: sequenceRandom([0]) });
    const outcome = session.resolveEvent({ kind: 'item', choiceId: 'anchor', instanceId: 'anchor-1' });
    expect(outcome.rewardSummary).toEqual({ kind: 'item', id: 'scubaSet', quantity: 1 });
    expect(session.beginDawn().accepted).toBe(true);
    const entry = session.snapshot().journalEntries[0]!;
    const copy = formatJournalEntry(entry).nighttime;
    expect(copy).toContain('completed the exchange');
    expect(copy).toContain('scuba gear');
  });

  it.each(['en', 'pl', 'es-AR'] as const)('keeps treatment, repair and dive prose free of numbers in %s', (language) => {
    setLanguage(language);
    const entry = createJournalEntry(7, 'calm', [
      { kind: 'dayAction', action: 'treat', deltas: { health: 10 }, inventoryMutations: [{ kind: 'consume', instanceIds: ['medicalKit-1'] }] },
      { kind: 'dayAction', action: 'repair', deltas: { hull: 25, energy: -2 }, inventoryMutations: [] },
      { kind: 'dayAction', action: 'dive', deltas: { bait: 1, health: -50, energy: -3 }, inventoryMutations: [] },
    ], null, { kind: 'quiet' });
    const page = formatJournalEntry(entry);
    expect(page.daytime).not.toMatch(noStats);
    expect(page.nighttime).not.toMatch(noStats);
    expect(page.daytime).toContain(language === 'pl' ? 'Opatrzyłem rany' : language === 'en' ? 'dressed my wounds' : 'Me curé las heridas');
    expect(page.daytime).toContain(language === 'pl' ? 'przynętę' : language === 'en' ? 'bait' : 'carnada');
    expect(page.daytime).toContain(language === 'pl' ? 'poraniony' : language === 'en' ? 'hurt' : 'herido');
  });
});

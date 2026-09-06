import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../src/i18n/language';
import { SURVIVAL_EVENTS, survivalEventById } from '../src/survival/eventCatalog';
import { formatJournalEntry } from '../src/survival/journal';
import { formatJournalEvent } from '../src/survival/journalEvents';
import { formatJournalMutations } from '../src/survival/journalInventory';
import { createCarlitosState } from '../src/survival/CarlitosState';
import {
  createJournalCarlitosDawnRecord, createJournalCarlitosDawnState, createJournalEntry,
  type JournalEventRecord, type JournalInventoryMutation,
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
    text: { kind: 'eventResult', reference: { eventId, choiceId, resultId: outcome.resultId! } },
    inventoryMutations: mutations,
  };
}

describe('journal narrative', () => {
  it.each(['en', 'pl', 'es-AR'] as const)('covers every event result in %s without statistics or menu labels', (language) => {
    setLanguage(language);
    const catalog = [...SURVIVAL_EVENTS, survivalEventById('day-calm-fallback')!, survivalEventById('night-calm-fallback')!];
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
    const before = createJournalCarlitosDawnState(createCarlitosState({ hunger: 3, sickness: 2, unhappiness: 3, energy: 2 }));
    const worse = { ...before, hunger: 2, sickness: 3, unhappiness: 4, energy: 1 };
    const better = { ...before, hunger: 4, sickness: 1, unhappiness: 2, energy: 3 };
    const copy = (after: typeof before) => formatJournalEntry(createJournalEntry(
      2, 'calm', [createJournalCarlitosDawnRecord(before, after)], null, { kind: 'quiet' },
    )).daytime;
    const bad = copy(worse);
    const good = copy(better);
    for (const text of [bad, good]) expect(text).not.toMatch(noStats);
    for (const word of language === 'en' ? ['hungrier', 'worse', 'sadder', 'less strength'] : language === 'pl' ? ['głodny', 'gorzej', 'posmutniał', 'mniej sił'] : ['más hambre', 'peor', 'más triste', 'menos fuerzas']) {
      expect(bad).toContain(word);
      expect(good).not.toContain(word);
    }
    for (const word of language === 'en' ? ['less hungry', 'healthier', 'happier', 'strength back'] : language === 'pl' ? ['tak głodnego', 'zdrowiej', 'poweselał', 'odzyskał'] : ['tanta hambre', 'más sano', 'contento', 'recuperó']) {
      expect(good).toContain(word);
    }
  });

  it('does not invent changes when Carlitos stays the same or has died', () => {
    const before = createJournalCarlitosDawnState(createCarlitosState());
    const unchanged = formatJournalEntry(createJournalEntry(2, 'calm', [createJournalCarlitosDawnRecord(before, before)], null, { kind: 'quiet' }));
    expect(unchanged.daytime).not.toContain('Carlitos');
    const dead = { ...before, alive: false, hunger: 0, energy: 0, deathCause: 'starvation' as const };
    const died = formatJournalEntry(createJournalEntry(2, 'calm', [createJournalCarlitosDawnRecord(before, dead)], null, { kind: 'quiet' }));
    expect(died.daytime).toContain('Carlitos died');
    expect(died.daytime).not.toMatch(/hungrier|strength back|rest/);
  });

  it('explains a map patch and the damage it suffers in Polish', () => {
    setLanguage('pl');
    const copy = formatJournalEvent(eventRecord('leak', 'map', 1));
    expect(copy).toContain('Zatkałem szczelinę mapą');
    expect(copy).toContain('Przyhamowała przeciek');
    expect(copy).toContain('naporu wody');
    expect(copy).not.toContain('Uszkodziłem mapę');
    expect(copy).not.toMatch(noStats);
  });

  it('distinguishes a failed knife defence from a successful net that tears', () => {
    const knife = formatJournalEvent(eventRecord('swarm-of-sharks', 'knife', 1));
    const net = formatJournalEvent(eventRecord('swarm-of-sharks', 'fishingNet', 1));
    expect(knife).toContain('Its bite caught me');
    expect(knife).toContain('blade snapped');
    expect(net).toContain('held the sharks back');
    expect(net).toContain('tore through the mesh');
    expect(net).not.toContain('bite caught me');
  });

  it.each(['en', 'pl', 'es-AR'] as const)('mentions each narrated item consequence once in %s', (language) => {
    setLanguage(language);
    const cases = [
      ['leak', 'map', 1], ['death-stare', 'flashlight', 1],
      ['swarm-of-sharks', 'fishingNet', 1], ['swarm-of-sharks', 'knife', 1],
      ['windy-night', 'fishingNet', 1], ['windy-night', 'map', 0], ['windy-night', 'umbrella', 1],
      ['bad-sleep', 'umbrella', 1], ['wreckage', 'dive', 5], ['check-the-back', 'knife', 1],
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

  it('describes the knife defence and compass through concrete observations', () => {
    setLanguage('pl');
    const attack = formatJournalEvent(eventRecord('chest-attack', 'knife'));
    const compass = formatJournalEvent(eventRecord('night-trader', 'map'));
    expect(attack).toContain('Wcisnąłem nóż między zęby skrzyni');
    expect(attack).not.toContain('osłabił ugryzienie');
    expect(compass).toContain('igła przestaje drżeć');
    expect(compass).not.toContain('Trochę kierunku');
  });

  it('explains spent ammunition without saying the gun broke', () => {
    const copy = formatJournalEvent(eventRecord('snatcher', 'shotgun'));
    expect(copy).toContain('fired the shotgun at the tentacle');
    expect(copy).toContain('without my supplies');
    expect(copy).toContain('last shell');
    expect(copy).not.toMatch(/damaged|repairs/);
  });

  it('describes traded equipment as payment instead of consumed ammunition or medicine', () => {
    for (const id of ['flareGun', 'shotgun', 'medicalKit', 'ductTape']) {
      const copy = formatJournalEvent(eventRecord('handyman', id));
      expect(copy).toContain('for the trade');
      expect(copy).toContain('in exchange');
      expect(copy).not.toMatch(/last shell|last flare|medkit was empty|last of the duct tape|lost .*trouble/);
    }
  });

  it('uses the actual food reward when traded equipment was already owned', () => {
    const session = new SurvivalSession([
      { type: 'spyglass', instanceId: 'spyglass-1' }, { type: 'flashlight', instanceId: 'flashlight-1' },
    ], { seed: 1, initialEventId: 'handyman', random: sequenceRandom([0]) });
    session.resolveEvent({ kind: 'item', choiceId: 'spyglass', instanceId: 'spyglass-1' });
    const entry = session.snapshot().journalEntries[0]!;
    const copy = formatJournalEntry(entry).nighttime;
    expect(copy).toContain('took food instead');
    expect(copy).not.toContain('handed me a flashlight');
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

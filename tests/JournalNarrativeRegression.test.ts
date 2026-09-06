// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { setLanguage } from '../src/i18n/language';
import { createCarlitosState } from '../src/survival/CarlitosState';
import { createJournalCarlitosDawnState, createJournalCarlitosDawnRecord, createJournalEntry } from '../src/survival/journalRecords';
import { SurvivalJournalView } from '../src/ui/SurvivalJournalView';

afterEach(() => setLanguage('en'));

it.each([
  ['en', 'hungrier', 'sadder'],
  ['pl', 'głodny', 'posmutniał'],
  ['es-AR', 'hambre', 'triste'],
] as const)('renders saved Carlitos changes as prose in %s', (language, hunger, sadness) => {
  setLanguage(language);
  const before = createJournalCarlitosDawnState(createCarlitosState({ hunger: 5, unhappiness: 0 }));
  const after = { ...before, hunger: 4, unhappiness: 1 };
  const entry = createJournalEntry(2, 'calm', [createJournalCarlitosDawnRecord(before, after)], null, { kind: 'quiet' });
  const view = new SurvivalJournalView();
  try {
    view.show(JSON.parse(JSON.stringify([entry])));
    const text = view.root.querySelector('[data-journal-day]')!.textContent!;
    expect(text).toContain(hunger);
    expect(text).toContain(sadness);
    expect(text).not.toMatch(/\d|→|Carlitos:/);
  } finally {
    view.dispose();
  }
});

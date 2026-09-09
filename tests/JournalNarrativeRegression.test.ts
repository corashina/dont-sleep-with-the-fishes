// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { setLanguage } from '../src/i18n/language';
import { createCarlitosState } from '../src/survival/CarlitosState';
import { createJournalCarlitosDawnState, createJournalCarlitosDawnRecord, createJournalEntry } from '../src/survival/journalRecords';
import { SurvivalJournalView } from '../src/ui/SurvivalJournalView';

afterEach(() => setLanguage('en'));

it.each([
  ['en', 'hungry', 'lonely'],
  ['pl', 'głodny', 'samotnego'],
  ['es-AR', 'hambre', 'solo'],
] as const)('renders saved Carlitos changes as prose in %s', (language, hunger, sadness) => {
  setLanguage(language);
  const before = createJournalCarlitosDawnState(createCarlitosState({ hunger: 4, unhappiness: 4 }));
  const after = { ...before, hunger: 3, unhappiness: 5 };
  const entry = createJournalEntry(2, 'calm', [createJournalCarlitosDawnRecord(before, after)], null, { kind: 'quiet' });
  const view = new SurvivalJournalView();
  try {
    view.show(JSON.parse(JSON.stringify([entry])));
    const text = view.root.querySelector('[data-journal-night]')!.textContent!;
    expect(text).toContain(hunger);
    expect(text).toContain(sadness);
    expect(text).not.toMatch(/\d|→|Carlitos:/);
  } finally {
    view.dispose();
  }
});

it.each(['en', 'pl', 'es-AR'] as const)('omits routine saved changes in %s', (language) => {
  setLanguage(language);
  const before = createJournalCarlitosDawnState(createCarlitosState({ energy: 1 }));
  const after = { ...before, hunger: 4, unhappiness: 1, energy: 2 };
  const entry = createJournalEntry(2, 'calm', [createJournalCarlitosDawnRecord(before, after)], null, { kind: 'quiet' });
  const view = new SurvivalJournalView();
  try {
    view.show(JSON.parse(JSON.stringify([entry])));
    expect(view.root.querySelector('[data-journal-night]')!.textContent).not.toContain('Carlitos');
  } finally {
    view.dispose();
  }
});

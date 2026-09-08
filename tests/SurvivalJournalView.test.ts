// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../src/i18n/language';
import { survivalEventById } from '../src/survival/eventCatalog';
import type { JournalEntry, JournalEventRecord, JournalInventoryMutation } from '../src/survival/journalRecords';
import { SurvivalJournalView } from '../src/ui/SurvivalJournalView';
import { itemThumbnailUrl } from '../src/ui/itemThumbnailManifest';

const views: SurvivalJournalView[] = [];

afterEach(() => {
  views.splice(0).forEach((view) => view.dispose());
  setLanguage('en');
});

function fixture(): SurvivalJournalView {
  const view = new SurvivalJournalView();
  views.push(view);
  return view;
}

function eventRecord(eventId: string, choiceId: string, inventoryMutations: JournalInventoryMutation[]): JournalEventRecord {
  const event = survivalEventById(eventId)!;
  const resultId = event.choices.find(({ id }) => id === choiceId)!.outcomes[0]!.resultId!;
  return {
    phase: event.phase, eventId, attemptedChoiceId: choiceId, attemptedItemId: null,
    outcomeCode: 'test', text: { kind: 'eventResult', reference: { eventId, choiceId, resultId } },
    inventoryMutations,
  };
}

const quiet: JournalEntry = {
  day: 1, weather: 'calm', nightWeather: 'calm', actions: [], daytime: null, nighttime: { kind: 'quiet' },
};

const changes: JournalEntry = {
  ...quiet,
  day: 2,
  actions: [{
    kind: 'dayAction', action: 'repairItem', deltas: {},
    inventoryMutations: [
      { kind: 'repair', instanceIds: ['compass-1'] },
      { kind: 'consume', instanceIds: ['ductTape-1'] },
      { kind: 'break', instanceIds: ['radio-1'] },
    ],
  }],
  daytime: eventRecord('wreckage', 'search', [{ kind: 'gain', instanceIds: ['medicalKit-1', 'medicalKit-2'] }]),
  nighttime: {
    kind: 'event',
    event: eventRecord('bad-sleep', 'sleep', [{ kind: 'lose', instanceIds: ['medicalKit-1'] }]),
  },
};

describe('journal item changes', () => {
  it('shows two pages with separate headings, weather, and a pending night', () => {
    const view = fixture();
    view.show([{ ...changes, weather: 'rain', nightWeather: 'wind' }]);
    const pages = view.root.querySelectorAll('.journal-page');
    expect(pages).toHaveLength(2);
    expect(pages[0]!.querySelector('[data-journal-title]')?.textContent).toBe('DAY 2');
    expect(pages[1]!.querySelector('[data-journal-night-title]')?.textContent).toBe('NIGHT 2');
    expect(pages[0]!.querySelector('[data-journal-weather]')?.textContent).toMatch(/rain/i);
    expect(pages[1]!.querySelector('[data-journal-night-weather]')?.textContent).toMatch(/wind/i);
    view.show([{ ...changes, nighttime: { kind: 'pending' }, nightWeather: null }]);
    expect(pages[1]!.querySelector('[data-journal-night]')?.textContent).toBe('Night in progress.');
    expect(pages[1]!.querySelector('[data-journal-night-weather]')?.textContent).toBe('');
    expect(pages[1]!.querySelectorAll('.journal-item')).toHaveLength(0);
  });

  it('places recorded day and night changes below their text, including repeated items', () => {
    const view = fixture();
    view.show([changes]);
    const day = view.root.querySelector<HTMLElement>('[data-journal-day-items]')!;
    const night = view.root.querySelector<HTMLElement>('[data-journal-night-items]')!;
    expect(day.previousElementSibling?.hasAttribute('data-journal-day')).toBe(true);
    expect(night.previousElementSibling?.hasAttribute('data-journal-night')).toBe(true);
    expect(day.hidden).toBe(false);
    expect(night.hidden).toBe(false);
    expect([...day.children].map((item) => (item as HTMLElement).dataset.itemChange))
      .toEqual(['repair', 'consume', 'break', 'gain', 'gain']);
    expect([...day.querySelectorAll('.journal-item__status')].map((badge) => badge.textContent))
      .toEqual(['✓', '−', '−', '+', '+']);
    expect(night.children).toHaveLength(1);
    expect(night.querySelector('.journal-item__status')?.textContent).toBe('−');
    expect(night.querySelector('img')?.getAttribute('src')).toBe(itemThumbnailUrl('medicalKit'));
    expect(day.querySelector('img')?.getAttribute('src')).toBe(itemThumbnailUrl('compass'));
    expect(day.querySelector('[data-item-change="break"] [role="img"]')?.getAttribute('aria-label'))
      .toContain('Broken');
    expect(day.querySelector('[data-item-change="consume"]')?.getAttribute('title')).toContain('Used up');
    expect(night.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('Lost');
  });

  it.each([
    ['pl', 'Naprawiono', 'Zepsuto'],
    ['es-AR', 'Reparado', 'Roto'],
  ] as const)('refreshes descriptions in %s without losing statuses', (language, repair, broken) => {
    const view = fixture();
    view.show([changes]);
    setLanguage(language);
    const repaired = view.root.querySelector('[data-item-change="repair"]')!;
    expect(repaired.getAttribute('title')).toContain(repair);
    expect(repaired.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(repaired.getAttribute('title'));
    expect(repaired.querySelector('.journal-item__status')?.textContent).toBe('✓');
    expect(view.root.querySelector('[data-item-change="break"]')?.getAttribute('title')).toContain(broken);
  });

  it('clears changes on quiet and empty pages and restores them when returning', () => {
    const view = fixture();
    view.show([quiet, changes]);
    expect(view.root.querySelectorAll('.journal-item')).toHaveLength(6);
    view.previous();
    expect(view.root.querySelectorAll('.journal-item')).toHaveLength(0);
    expect(view.root.querySelector<HTMLElement>('[data-journal-day-items]')!.hidden).toBe(true);
    expect(view.root.querySelector<HTMLElement>('[data-journal-night-items]')!.hidden).toBe(true);
    view.next();
    expect(view.root.querySelectorAll('.journal-item')).toHaveLength(6);
    view.show([]);
    expect(view.root.querySelectorAll('.journal-item')).toHaveLength(0);
  });
});

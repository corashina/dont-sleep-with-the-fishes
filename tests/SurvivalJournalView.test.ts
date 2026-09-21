// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../src/i18n/language';
import { survivalEventById } from '../src/survival/eventCatalog';
import type { JournalEntry, JournalEventRecord, JournalInventoryMutation } from '../src/survival/journalRecords';
import { SurvivalJournalView } from '../src/ui/SurvivalJournalView';

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
    deltas: {},
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
  daytime: eventRecord('drifting-supplies', 'retrieve', [{ kind: 'gain', instanceIds: ['medicalKit-1', 'medicalKit-2'] }]),
  nighttime: {
    kind: 'event',
    event: eventRecord('bad-sleep', 'sleep', [{ kind: 'lose', instanceIds: ['medicalKit-1'] }]),
  },
};

describe('journal item changes', () => {
  it('clears changes on quiet and empty pages and restores them when returning', () => {
    const view = fixture();
    view.show([quiet, changes]);
    expect(view.root.querySelectorAll('.journal-item')).toHaveLength(5);
    view.previous();
    expect(view.root.querySelectorAll('.journal-item')).toHaveLength(0);
    expect(view.root.querySelector<HTMLElement>('[data-journal-day-items]')!.hidden).toBe(true);
    expect(view.root.querySelector<HTMLElement>('[data-journal-night-items]')!.hidden).toBe(true);
    view.next();
    expect(view.root.querySelectorAll('.journal-item')).toHaveLength(5);
    view.show([]);
    expect(view.root.querySelectorAll('.journal-item')).toHaveLength(0);
  });
});

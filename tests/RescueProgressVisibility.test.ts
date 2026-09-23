// @vitest-environment jsdom
// Importance: 95/100. Hidden rescue progress must not appear in player feedback.
import { afterEach, expect, it } from 'vitest';
import { setLanguage } from '../src/i18n/language';
import { formatJournalEntry } from '../src/survival/journal';
import type { JournalEntry } from '../src/survival/journalRecords';
import type { JournalSurvivalActionRecord } from '../src/survival/journalRecords';
import { formatDiveResult } from '../src/survival/SurvivalDayActionFlow';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { BoatAnchorView } from '../src/ui/BoatAnchorView';
import { sequenceRandom } from './helpers/random';

afterEach(() => setLanguage('en'));

it.each(['en', 'pl', 'es-AR'] as const)('does not disclose rescue progress in %s', (language) => {
  setLanguage(language);
  const game = new SurvivalSession([{ type: 'radio', instanceId: 'radio-1' }], {
    seed: 1, initial: { day: 4 }, random: sequenceRandom([0]), initialEventId: 'shower-night',
  });
  game.resolveEvent({ kind: 'endure' });
  game.beginDawn();
  const outcome = game.perform('answerRadio');
  expect(outcome.accepted).toBe(true);
  expect(outcome.deltas.rescueLead).toBe(2);
  const visibleOutcome = { ...outcome, deltas: { energy: -1 } };
  expect(formatDiveResult(outcome)).toEqual(formatDiveResult(visibleOutcome));

  const action: JournalSurvivalActionRecord = {
    kind: 'dayAction', action: 'dive', deltas: outcome.deltas, inventoryMutations: [],
  };
  const entry: JournalEntry = {
    day: 5, weather: 'calm', nightWeather: 'calm', daytime: null, nighttime: { kind: 'quiet' },
    actions: [action],
  };
  expect(formatJournalEntry(entry)).toEqual(formatJournalEntry({
    ...entry, actions: [{ ...action, deltas: visibleOutcome.deltas }],
  }));

  const view = new BoatAnchorView(document.createElement('main'));
  try {
    view.setAnchors([{
      id: 'radio', itemType: 'radio', toolId: null, action: 'answerRadio',
      remainingUses: null, backingInstanceId: 'radio-1', x: 100, y: 100, visible: true, depleted: false,
    }]);
    view.render(game.snapshot(), new Map());
    const button = view.anchorButton('radio')!;
    expect(button.textContent).not.toMatch(/rescue|ratunk|rescat/i);
    expect(button.getAttribute('aria-description')).not.toMatch(/rescue|ratunk|rescat/i);
  } finally {
    view.dispose();
  }
});

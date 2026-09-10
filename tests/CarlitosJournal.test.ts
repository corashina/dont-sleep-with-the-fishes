import { afterEach,describe,expect,it } from 'vitest';
import { setLanguage } from '../src/i18n/language';
import { createCarlitosState,type CarlitosSnapshot } from '../src/survival/CarlitosState';
import { formatJournalEntry } from '../src/survival/journal';
import { createJournalCarlitosDawnRecord,createJournalEntry } from '../src/survival/journalRecords';

afterEach(() => setLanguage('en'));

function night(before: Partial<CarlitosSnapshot>, after: Partial<CarlitosSnapshot>): string {
  const initial = createCarlitosState(before);
  return formatJournalEntry(createJournalEntry(2, 'calm', [
    createJournalCarlitosDawnRecord(initial, { ...initial, ...after }),
  ], null, { kind: 'quiet' })).nighttime;
}

describe('Carlitos journal milestones', () => {
  it.each(['en', 'pl', 'es-AR'] as const)('silences routine changes in %s', (language) => {
    setLanguage(language);
    for (const [before, after] of [
      [{ hunger: 5, unhappiness: 0, energy: 1 }, { hunger: 4, unhappiness: 1, energy: 2 }],
      [{ hunger: 3 }, { hunger: 2 }],
      [{ hunger: 4 }, { hunger: 5 }],
      [{ unhappiness: 2 }, { unhappiness: 3 }],
      [{ unhappiness: 3 }, { unhappiness: 4 }],
      [{ unhappiness: 3 }, { unhappiness: 2 }],
      [{ unhappiness: 5 }, { unhappiness: 6 }],
      [{ unhappiness: 8 }, { unhappiness: 9 }],
      [{ energy: 2 }, { energy: 3 }],
    ] as const) expect(night(before, after)).not.toContain('Carlitos');
  });

  it.each([
    [{ hunger: 4 }, { hunger: 3 }, 'Carlitos is hungry.'],
    [{ hunger: 2 }, { hunger: 1 }, 'Carlitos is starving.'],
    [{ hunger: 5 }, { hunger: 1 }, 'Carlitos is starving.'],
    [{ unhappiness: 4 }, { unhappiness: 5 }, 'Carlitos seems lonely.'],
    [{ unhappiness: 6 }, { unhappiness: 7 }, 'Carlitos seems depressed.'],
    [{ unhappiness: 7 }, { unhappiness: 8 }, 'Carlitos seems miserable.'],
  ] as const)('reports a new warning from %j to %j', (before, after, warning) => {
    expect(night(before, after)).toContain(warning);
    expect(night(after, after)).not.toContain('Carlitos');
  });

  it('reports exhaustion once and recovery when energy returns', () => {
    const exhausted = { hunger: 0, unhappiness: 10, energy: 0 };
    expect(night({ hunger: 2 }, exhausted)).toContain('Carlitos is too tired to help.');
    expect(night(exhausted, exhausted)).not.toContain('Carlitos');
    expect(night({ energy: 0 }, { energy: 1 })).toContain('enough strength to help again');
  });
});

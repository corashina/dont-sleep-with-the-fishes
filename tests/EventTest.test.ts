import { beforeEach, describe, expect, it } from 'vitest';
import { EVENT_TEST_OPTIONS } from '../src/app/EventTest';
import { initializeLanguage, setLanguage } from '../src/i18n/language';

beforeEach(() => initializeLanguage(null));

describe('event test option translations', () => {
  it('updates existing option titles without changing their IDs', () => {
    const options = [
      EVENT_TEST_OPTIONS.find(({ id }) => id === 'dangerous-waters')!,
      EVENT_TEST_OPTIONS.find(({ id }) => id === 'check-the-back-bad')!,
      EVENT_TEST_OPTIONS.find(({ id }) => id === 'midnight-tour-monster')!,
      EVENT_TEST_OPTIONS.find(({ id }) => id === 'item-animation-lab')!,
      EVENT_TEST_OPTIONS.find(({ id }) => id === 'ending-sinking')!,
    ];
    const ids = options.map(({ id }) => id);

    expect(options.map(({ title }) => title)).toEqual([
      'Dangerous Waters',
      'Check the Back: Anglerfish',
      'Midnight Tour: Monster',
      'Item Animation Lab',
      'Sinking',
    ]);

    setLanguage('pl');

    expect(options.map(({ id }) => id)).toEqual(ids);
    expect(options.map(({ title }) => title)).toEqual([
      'Niebezpieczne wody',
      'Sprawdź tył łodzi: żabnica',
      'Nocna wyprawa: potwór',
      'Laboratorium animacji przedmiotów',
      'Zatonięcie',
    ]);
  });

  it('keeps Dorothy unchanged', () => {
    const dorothy = EVENT_TEST_OPTIONS.find(({ id }) => id === 'ending-dorothy')!;
    expect(dorothy.title).toBe('Dorothy');
    setLanguage('pl');
    expect(dorothy.title).toBe('Dorothy');
  });
});

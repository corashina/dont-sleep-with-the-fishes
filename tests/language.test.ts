import { afterEach, describe, expect, it } from 'vitest';
import { getLanguage, initializeLanguage, LANGUAGE_STORAGE_KEY, onLanguageChange, pluralCategory, setLanguage } from '../src/i18n/language';
import { defineMessages } from '../src/i18n/messages';

afterEach(() => initializeLanguage(null));

describe('language preference', () => {
  it('loads and persists a valid choice and removes subscriptions', () => {
    const values = new Map([[LANGUAGE_STORAGE_KEY, 'pl']]);
    initializeLanguage({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } });
    expect(getLanguage()).toBe('pl');
    let changes = 0;
    const unsubscribe = onLanguageChange(() => { changes += 1; });
    setLanguage('en');
    setLanguage('en');
    expect(changes).toBe(1);
    expect(values.get(LANGUAGE_STORAGE_KEY)).toBe('en');
    unsubscribe();
    setLanguage('pl');
    expect(changes).toBe(1);
  });

  it('uses English for invalid preferences and works when storage throws', () => {
    initializeLanguage({ getItem: () => 'de', setItem: () => undefined });
    expect(getLanguage()).toBe('en');
    initializeLanguage({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    setLanguage('pl');
    expect(getLanguage()).toBe('pl');
  });

  it('formats typed messages and Polish count categories', () => {
    const t = defineMessages({ day: { en: (day: number) => `DAY ${day}`, pl: (day: number) => `DZIEŃ ${day}` } });
    expect(t('day', 2)).toBe('DAY 2');
    setLanguage('pl');
    expect(t('day', 2)).toBe('DZIEŃ 2');
    expect([1, 2, 5, 12, 22].map(pluralCategory)).toEqual(['one', 'few', 'many', 'many', 'few']);
  });
});

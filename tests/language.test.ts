import { afterEach, describe, expect, it } from 'vitest';
import { formatNumber, getLanguage, initializeLanguage, LANGUAGE_STORAGE_KEY, onLanguageChange, pluralCategory, setLanguage } from '../src/i18n/language';
import { resourceQuantity } from '../src/i18n/resourceMessages';
import { defineMessages } from '../src/i18n/messages';

afterEach(() => initializeLanguage(null));

describe('language preference', () => {
  it('loads Argentine Spanish and persists it after switching languages', () => {
    const values = new Map([[LANGUAGE_STORAGE_KEY, 'es-AR']]);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    initializeLanguage(storage);
    expect(getLanguage()).toBe('es-AR');
    setLanguage('en');
    setLanguage('es-AR');
    expect(values.get(LANGUAGE_STORAGE_KEY)).toBe('es-AR');
    initializeLanguage(storage);
    expect(getLanguage()).toBe('es-AR');
    expect(formatNumber(1234.5)).toBe('1.234,5');
    expect([0, 1, 2].map(pluralCategory)).toEqual(['other', 'one', 'other']);
    expect(resourceQuantity('food', 1)).toBe('1 porción de comida');
    expect(resourceQuantity('food', 2)).toBe('2 porciones de comida');
    expect(resourceQuantity('bait', 0)).toBe('0 porciones de carnada');
  });

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
    const t = defineMessages({ day: { en: (day: number) => `DAY ${day}`, pl: (day: number) => `DZIEŃ ${day}`, 'es-AR': (day: number) => `DÍA ${day}` } });
    expect(t('day', 2)).toBe('DAY 2');
    setLanguage('pl');
    expect(t('day', 2)).toBe('DZIEŃ 2');
    expect([1, 2, 5, 12, 22].map(pluralCategory)).toEqual(['one', 'few', 'many', 'many', 'few']);
  });
});

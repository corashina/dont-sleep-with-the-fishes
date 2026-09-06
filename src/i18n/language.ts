import { browserStorage, type PreferenceStorage } from '../browser/storage';

export type Language = 'en' | 'pl' | 'es-AR';
export const LANGUAGE_STORAGE_KEY = 'dont-sleep-with-the-fishes.language';
let current: Language = 'en';
let preferenceStorage: PreferenceStorage | null = null;
const listeners = new Set<() => void>();

export function getLanguage(): Language {
  return current;
}

export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'pl' || value === 'es-AR';
}

export function setLanguage(language: Language): void {
  if (!isLanguage(language)) throw new Error('Unsupported language');
  if (typeof document !== 'undefined') document.documentElement.lang = language;
  if (current === language) return;
  current = language;
  try { preferenceStorage?.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* Storage is optional. */ }
  for (const listener of listeners) listener();
}

export function initializeLanguage(storage: PreferenceStorage | null = browserStorage()): void {
  preferenceStorage = storage;
  let language: Language = 'en';
  try {
    const saved = storage?.getItem(LANGUAGE_STORAGE_KEY);
    if (isLanguage(saved)) language = saved;
  } catch { /* Use English. */ }
  setLanguage(language);
}

export function onLanguageChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const plurals = { en: new Intl.PluralRules('en'), pl: new Intl.PluralRules('pl'), 'es-AR': new Intl.PluralRules('es-AR') };
const numbers = { en: new Intl.NumberFormat('en'), pl: new Intl.NumberFormat('pl'), 'es-AR': new Intl.NumberFormat('es-AR') };

export function pluralCategory(count: number): Intl.LDMLPluralRule {
  return plurals[current].select(count);
}

export function formatNumber(value: number): string {
  return numbers[current].format(value);
}

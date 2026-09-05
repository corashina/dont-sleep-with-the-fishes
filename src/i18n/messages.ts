import { getLanguage } from './language';

type Text = string | ((...args: never[]) => string);
type Entry = { readonly en: Text; readonly pl: Text };
type Arguments<T> = T extends (...args: infer A) => string ? A : [];
type Matching<T extends Record<string, Entry>> = {
  readonly [K in keyof T]: {
    readonly en: T[K]['en'];
    readonly pl: T[K]['en'] extends string ? string : (...args: Arguments<T[K]['en']>) => string;
  };
};

/** Catalog keys and arguments are checked at their call sites. */
export function defineMessages<T extends Record<string, Entry>>(catalog: T & Matching<T>) {
  return <K extends keyof T>(key: K, ...args: Arguments<T[K]['en']>): string => {
    const entry = catalog[key];
    if (!entry) throw new Error(`Unknown translation key: ${String(key)}`);
    const value = entry[getLanguage()];
    return typeof value === 'string'
      ? value
      : (value as (...parameters: Arguments<T[K]['en']>) => string)(...args);
  };
}

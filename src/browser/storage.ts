export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface StoredPreference<T> {
  get(): T;
  set(value: T): void;
}

export function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function createStoredPreference<T>(
  initial: T,
  key: string,
  parse: (value: unknown) => T,
  apply: (value: T) => void,
  storage: PreferenceStorage | null,
): StoredPreference<T> {
  let current = initial;
  try {
    current = parse(storage?.getItem(key));
  } catch {
    current = initial;
  }
  return Object.freeze({
    get: () => current,
    set: (value: T) => {
      if (value === current) return;
      current = value;
      apply(value);
      try {
        storage?.setItem(key, String(value));
      } catch {
        // Storage is optional; the in-memory choice still applies.
      }
    },
  });
}

import { describe, expect, it } from 'vitest';
import {
  SURVIVAL_SAVE_VERSION,
  createSurvivalSaveDocument,
  parseSurvivalSaveDocument,
} from '../src/survival/SurvivalSaveData';
import type { SurvivalRunCheckpoint } from '../src/survival/SurvivalCheckpoint';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import {
  SURVIVAL_SAVE_DATA_KEY,
  SURVIVAL_SAVE_ENABLED_KEY,
  SurvivalSaveStore,
  type SurvivalSaveStorage,
} from '../src/browser/SurvivalSaveStore';

function memoryStorage(initial: Record<string, string> = {}): SurvivalSaveStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

function throwingStorage(): SurvivalSaveStorage {
  const fail = (): never => { throw new Error('storage blocked'); };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

function validRunCheckpoint(day = 3): SurvivalRunCheckpoint {
  const session = new SurvivalSession([], { seed: 41, initial: { day } });
  return { scavengeElapsedSeconds: 8, session: session.exportCheckpoint() };
}

describe('SurvivalSaveStore', () => {
  it('defaults to disabled with no checkpoint', () => {
    const store = new SurvivalSaveStore(memoryStorage());
    expect(store.getState()).toEqual({ enabled: false, checkpoint: null });
  });

  it('persists enable and deletes the checkpoint when disabled', () => {
    const storage = memoryStorage();
    const store = new SurvivalSaveStore(storage);
    store.setEnabled(true);
    store.writeCheckpoint(validRunCheckpoint());
    store.setEnabled(false);

    expect(storage.getItem(SURVIVAL_SAVE_ENABLED_KEY)).toBe('false');
    expect(storage.getItem(SURVIVAL_SAVE_DATA_KEY)).toBeNull();
    expect(store.getState()).toEqual({ enabled: false, checkpoint: null });
  });

  it('deletes malformed and unsupported save data', () => {
    const storage = memoryStorage({
      [SURVIVAL_SAVE_ENABLED_KEY]: 'true',
      [SURVIVAL_SAVE_DATA_KEY]: JSON.stringify({ version: 2 }),
    });
    const store = new SurvivalSaveStore(storage);

    expect(store.getState()).toEqual({ enabled: true, checkpoint: null });
    expect(storage.getItem(SURVIVAL_SAVE_DATA_KEY)).toBeNull();
  });

  it('keeps running when each storage method throws', () => {
    const store = new SurvivalSaveStore(throwingStorage());
    expect(() => store.setEnabled(true)).not.toThrow();
    expect(() => store.writeCheckpoint(validRunCheckpoint())).not.toThrow();
    expect(() => store.clearCheckpoint()).not.toThrow();
  });

  it.each([
    ['terminal state', (value: any) => { value.checkpoint.session.state = 'dead'; }],
    ['meter', (value: any) => { value.checkpoint.session.health = Number.NaN; }],
    ['item', (value: any) => { value.checkpoint.session.savedItems = [{ instanceId: 'bad-1', type: 'bad' }]; }],
    ['event', (value: any) => { value.checkpoint.session.pendingEventId = 'unknown-event'; }],
    ['journal', (value: any) => { value.checkpoint.session.journalEntries = [{ kind: 'bad' }]; }],
    ['random state', (value: any) => { value.checkpoint.session.randomState = -1; }],
  ] as const)('rejects an invalid %s', (_name, corrupt) => {
    const value: any = JSON.parse(JSON.stringify(
      createSurvivalSaveDocument(validRunCheckpoint()),
    ));
    corrupt(value);
    expect(parseSurvivalSaveDocument(value)).toBeNull();
  });
});

it('exports the current save version', () => {
  expect(SURVIVAL_SAVE_VERSION).toBe(1);
});

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

function eventResultRunCheckpoint(): SurvivalRunCheckpoint {
  const session = new SurvivalSession([], {
    seed: 41,
    initial: { day: 3 },
    initialEventId: 'wreckage',
  });
  session.resolveEvent({ kind: 'choice', choiceId: 'search' });
  return { scavengeElapsedSeconds: 8, session: session.exportCheckpoint() };
}

function journalRunCheckpoint(): SurvivalRunCheckpoint {
  const session = new SurvivalSession([], { seed: 41, initialEventId: 'bad-sleep' });
  session.resolveEvent({ kind: 'choice', choiceId: 'sleep' });
  session.beginDawn();
  return { scavengeElapsedSeconds: 8, session: session.exportCheckpoint() };
}

function actionJournalRunCheckpoint(): SurvivalRunCheckpoint {
  const session = new SurvivalSession([{ type: 'medicalKit', instanceId: 'medicalKit-1' }], {
    seed: 41, initial: { day: 3, health: 90 },
  });
  session.perform('treat');
  return { scavengeElapsedSeconds: 8, session: session.exportCheckpoint() };
}

function mutableSave(checkpoint: SurvivalRunCheckpoint): any {
  return JSON.parse(JSON.stringify(createSurvivalSaveDocument(checkpoint)));
}

function expectRejectedAndDeleted(value: any): void {
  expect(parseSurvivalSaveDocument(value)).toBeNull();
  const storage = memoryStorage({
    [SURVIVAL_SAVE_ENABLED_KEY]: 'true',
    [SURVIVAL_SAVE_DATA_KEY]: JSON.stringify(value),
  });
  const store = new SurvivalSaveStore(storage);
  expect(store.getState()).toEqual({ enabled: true, checkpoint: null });
  expect(storage.getItem(SURVIVAL_SAVE_DATA_KEY)).toBeNull();
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

  it('parses valid event result and journal checkpoints', () => {
    const eventResult = mutableSave(eventResultRunCheckpoint());
    const journal = mutableSave(journalRunCheckpoint());
    expect(parseSurvivalSaveDocument(eventResult)).not.toBeNull();
    expect(parseSurvivalSaveDocument(journal)).not.toBeNull();
  });

  it.each([
    ['action', (record: any) => { record.action = 'unknown'; }],
    ['missing deltas', (record: any) => { delete record.deltas; }],
    ['resource', (record: any) => { record.deltas.unknown = 1; }],
    ['fractional delta', (record: any) => { record.deltas.health = 0.5; }],
    ['non-finite delta', (record: any) => { record.deltas.health = Number.POSITIVE_INFINITY; }],
    ['mutations', (record: any) => { record.inventoryMutations = null; }],
    ['mutation kind', (record: any) => { record.inventoryMutations[0].kind = 'unknown'; }],
    ['item instance', (record: any) => { record.inventoryMutations[0].instanceIds = ['unknown-1']; }],
  ])('rejects a day action journal with invalid %s', (_name, corrupt) => {
    const value = mutableSave(actionJournalRunCheckpoint());
    corrupt(value.checkpoint.session.pendingJournalActions[0]);
    expectRejectedAndDeleted(value);
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

  it('deletes a night event without a pending event', () => {
    const source = new SurvivalSession([], {
      seed: 41,
      initialEventId: 'bad-sleep',
    });
    const value = mutableSave({
      scavengeElapsedSeconds: 8,
      session: source.exportCheckpoint(),
    });
    value.checkpoint.session.pendingEventId = null;

    expectRejectedAndDeleted(value);
  });

  it.each([
    ['inventory Carlitos', (value: any) => {
      value.checkpoint.session.inventory['carlitos-1'] = {
        instanceId: 'carlitos-1',
        type: 'carlitos',
        condition: 'usable',
      };
    }],
    ['savedItems Carlitos', (value: any) => {
      value.checkpoint.session.savedItems.push({
        instanceId: 'carlitos-1',
        type: 'carlitos',
      });
      value.checkpoint.session.savedPickupCount = 1;
    }],
    ['saved pickup count mismatch', (value: any) => {
      value.checkpoint.session.savedPickupCount = 1;
    }],
  ] as const)('deletes a save with %s', (_name, corrupt) => {
    const value = mutableSave(validRunCheckpoint());
    corrupt(value);
    expectRejectedAndDeleted(value);
  });

  it.each([
    ['choice', (value: any) => { value.checkpoint.session.lastOutcome.eventResult.choiceId = 'dive'; }],
    ['result', (value: any) => { value.checkpoint.session.lastOutcome.eventResult.resultId = 'not-a-result'; }],
  ] as const)('rejects an event result with an invalid %s', (_name, corrupt) => {
    const value = mutableSave(eventResultRunCheckpoint());
    corrupt(value);
    expect(parseSurvivalSaveDocument(value)).toBeNull();
  });

  it.each([
    ['phase', (event: any) => { event.phase = 'day'; }],
    ['title', (event: any) => { event.title = 'Wrong title'; }],
    ['prompt', (event: any) => { event.prompt = 'Wrong prompt'; }],
    ['choice', (event: any) => { event.attemptedChoiceId = 'check'; }],
    ['choice label', (event: any) => { event.choiceLabel = 'Check'; }],
    ['item', (event: any) => { event.attemptedItemId = 'compass'; }],
    ['presentation key', (event: any) => { event.eventPresentationKey = 'drifting-barrel.food'; }],
    ['outcome code', (event: any) => { event.outcomeCode = 'wrong-code'; }],
    ['outcome', (event: any) => { event.outcomeMessage = 'Wrong outcome'; }],
  ] as const)('rejects a journal event with a mismatched %s', (_name, corrupt) => {
    const value = mutableSave(journalRunCheckpoint());
    corrupt(value.checkpoint.session.journalEntries[0].nighttime.event);
    expect(parseSurvivalSaveDocument(value)).toBeNull();
  });
});

it('exports the current save version', () => {
  expect(SURVIVAL_SAVE_VERSION).toBe(1);
});

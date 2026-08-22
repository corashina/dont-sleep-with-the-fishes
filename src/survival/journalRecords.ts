import type {
  JournalDayActionRecord,
  JournalDaytimeRecord,
  JournalEntry,
  JournalEventRecord,
  JournalInventoryMutation,
  JournalNightRecord,
} from './journal';

function cloneJournalRecord(record: JournalEventRecord): JournalEventRecord {
  return Object.freeze({
    ...record,
    inventoryMutations: cloneJournalInventoryMutations(record.inventoryMutations),
  });
}

function cloneJournalDaytime(record: JournalDaytimeRecord): JournalDaytimeRecord {
  return 'kind' in record
    ? Object.freeze({ kind: 'sinkingShip' })
    : cloneJournalRecord(record);
}

export function cloneJournalEntry(entry: JournalEntry): JournalEntry {
  return Object.freeze({
    ...entry,
    actions: cloneJournalActions(entry.actions),
    daytime: entry.daytime === null ? null : cloneJournalDaytime(entry.daytime),
    nighttime: Object.freeze(cloneJournalNight(entry.nighttime)),
  });
}

export function cloneJournalNight(record: JournalNightRecord): JournalNightRecord {
  return record.kind === 'quiet'
    ? { kind: 'quiet' }
    : { kind: 'event', event: cloneJournalRecord(record.event) };
}

export function cloneJournalActions(
  actions: readonly JournalDayActionRecord[],
): readonly JournalDayActionRecord[] {
  return Object.freeze(actions.map((action) => Object.freeze({ ...action })));
}

export function cloneJournalInventoryMutations(
  mutations: readonly JournalInventoryMutation[],
): readonly JournalInventoryMutation[] {
  return Object.freeze(mutations.map((mutation) => Object.freeze({
    kind: mutation.kind,
    instanceIds: Object.freeze([...mutation.instanceIds]),
  })));
}

export function journalSnapshot(entries: readonly JournalEntry[]): readonly JournalEntry[] {
  return Object.freeze(entries.map(cloneJournalEntry));
}

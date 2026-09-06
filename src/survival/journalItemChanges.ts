import { ITEM_IDS, ITEM_LABELS, type ItemId } from '../game/ItemState';
import { journalItemChangeMessage } from '../i18n/journalItemChangeMessages';
import type { JournalEntry, JournalInventoryMutation } from './journalRecords';

export interface JournalItemChange {
  readonly itemId: ItemId;
  readonly kind: JournalInventoryMutation['kind'];
  readonly label: string;
}

function formatChanges(mutations: readonly JournalInventoryMutation[]): JournalItemChange[] {
  return mutations.flatMap(({ kind, instanceIds }) => instanceIds.map((instanceId) => {
    const itemId = ITEM_IDS.find((candidate) => instanceId.startsWith(`${candidate}-`));
    if (itemId === undefined) throw new Error(`Journal mutation contains unknown instance ${instanceId}.`);
    return { itemId, kind, label: `${ITEM_LABELS[itemId]}: ${journalItemChangeMessage(kind)}` };
  }));
}

export function journalItemChanges(entry: JournalEntry): {
  readonly day: readonly JournalItemChange[];
  readonly night: readonly JournalItemChange[];
} {
  return {
    day: formatChanges([
      ...entry.actions.flatMap((action) => action.kind === 'dayAction' ? action.inventoryMutations : []),
      ...(entry.daytime !== null && !('kind' in entry.daytime) ? entry.daytime.inventoryMutations : []),
    ]),
    night: formatChanges(entry.nighttime.kind === 'event' ? entry.nighttime.event.inventoryMutations : []),
  };
}

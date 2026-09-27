import { ITEM_IDS, ITEM_LABELS, type ItemId } from '../game/ItemState';
import { journalItemChangeMessage } from '../i18n/journalItemChangeMessages';
import type { JournalEntry, JournalInventoryMutation } from './journalRecords';
import type { ResourceDelta } from './survivalTypes';

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

function recordChanges(
  deltas: Readonly<ResourceDelta>,
  mutations: readonly JournalInventoryMutation[],
  lossKind: 'consume' | 'lose',
): JournalItemChange[] {
  const changes = formatChanges(mutations);
  for (const [resource, itemId] of [['food', 'cannedFood'], ['bait', 'baitTin']] as const) {
    const delta = deltas[resource] ?? 0;
    const kind = delta > 0 ? 'gain' : lossKind;
    const recorded = changes.filter((change) => change.itemId === itemId
      && (delta > 0 ? change.kind === 'gain' : change.kind === 'consume' || change.kind === 'lose')).length;
    for (let count = recorded; count < Math.abs(delta); count += 1) {
      changes.push({ itemId, kind, label: `${ITEM_LABELS[itemId]}: ${journalItemChangeMessage(kind)}` });
    }
  }
  return changes;
}

function aggregateChanges(changes: readonly JournalItemChange[]): JournalItemChange[] {
  const totals = new Map<ItemId, { total: number; gain?: JournalItemChange; loss?: JournalItemChange }>();
  const states: JournalItemChange[] = [];
  for (const change of changes) {
    if (change.kind === 'break' || change.kind === 'repair') {
      states.push(change);
      continue;
    }
    let group = totals.get(change.itemId);
    if (group === undefined) {
      group = { total: 0 };
      totals.set(change.itemId, group);
    }
    if (change.kind === 'gain') { group.total += 1; group.gain = change; }
    else { group.total -= 1; group.loss = change; }
  }
  const result: JournalItemChange[] = [];
  for (const { total, gain, loss } of totals.values()) {
    const change = total > 0 ? gain : loss;
    if (change === undefined) continue;
    for (let count = 0; count < Math.abs(total); count += 1) result.push(change);
  }
  return [...result, ...states];
}

export function journalItemChanges(entry: JournalEntry): {
  readonly day: readonly JournalItemChange[];
  readonly night: readonly JournalItemChange[];
} {
  return {
    day: aggregateChanges([
      ...entry.actions.flatMap((action) => {
        if (action.kind === 'dayAction' || action.kind === 'fishing') {
          return recordChanges(action.deltas, action.inventoryMutations, 'consume');
        }
        return action.kind === 'carlitosCare' && action.action === 'feed'
          ? recordChanges({ food: -1 }, [], 'consume') : [];
      }),
      ...(entry.daytime !== null && !('kind' in entry.daytime)
        ? recordChanges(entry.daytime.deltas, entry.daytime.inventoryMutations, 'lose') : []),
    ]),
    night: entry.nighttime.kind === 'event'
      ? aggregateChanges(recordChanges(entry.nighttime.event.deltas, entry.nighttime.event.inventoryMutations, 'lose')) : [],
  };
}

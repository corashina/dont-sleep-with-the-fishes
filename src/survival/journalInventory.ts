import { ITEM_IDS, type ItemId, type ItemInstanceId } from '../game/ItemState';
import { journalInventoryMessage as t, journalItemName } from '../i18n/journalInventoryMessages';
import type { JournalInventoryMutation } from './journalRecords';

export interface JournalNarratedItemChange {
  kind: JournalInventoryMutation['kind'];
  itemId: ItemId;
}

function instanceItemId(instanceId: ItemInstanceId): ItemId {
  const id = ITEM_IDS.find((candidate) => instanceId.startsWith(`${candidate}-`));
  if (id === undefined) throw new Error(`Unknown journal item: ${instanceId}`);
  return id;
}

function consumption(itemId: ItemId): string {
  switch (itemId) {
    case 'medicalKit': return t('emptyMedkit');
    case 'ductTape': return t('emptyTape');
    case 'flareGun': return t('emptyFlare');
    case 'shotgun': return t('emptyShotgun');
    default: return t('consume', journalItemName(itemId));
  }
}

export function formatJournalMutations(
  mutations: readonly JournalInventoryMutation[],
  narrated?: JournalNarratedItemChange,
): string {
  return mutations.flatMap(({ kind, instanceIds }) => [...new Set(instanceIds.map(instanceItemId))]
    .filter((id) => narrated?.kind !== kind || narrated.itemId !== id)
    .map((id) => (
    kind === 'consume' ? consumption(id) : t(kind, journalItemName(id))
  ))).join(' ');
}

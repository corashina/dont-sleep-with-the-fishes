export {
  ITEM_DEFINITIONS, ITEM_IDS, ITEM_LABELS, createItemInstances,
  itemDefinition, validateItemCatalog,
} from './itemCatalog';
export type { ItemDefinition, ItemId, ItemInstanceId } from './itemCatalog';

import type { ItemId, ItemInstanceId } from './itemCatalog';

export interface ItemInstance {
  readonly instanceId: ItemInstanceId;
  readonly type: ItemId;
}

export type ItemStatus = 'available' | 'carried' | 'saved' | 'lost';

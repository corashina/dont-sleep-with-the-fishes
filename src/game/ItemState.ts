import { RUNTIME_ITEM_IDS, runtimeItemDefinition } from '../canonical/items';

export const ITEM_IDS = RUNTIME_ITEM_IDS;

export type ItemId = (typeof ITEM_IDS)[number];
export type ItemInstanceId = `${ItemId}-${number}`;

export interface ItemDefinition {
  label: string;
  weight: 1 | 2 | 3;
  spawnCount: number;
  charges: number | null;
  durable: boolean;
}

export interface ItemInstance {
  instanceId: ItemInstanceId;
  type: ItemId;
}

export type ItemStatus = 'available' | 'carried' | 'saved' | 'lost';

export const ITEM_DEFINITIONS = Object.fromEntries(ITEM_IDS.map((id) => {
  const definition = runtimeItemDefinition(id);
  return [id, {
    label: definition.label,
    weight: definition.weight,
    spawnCount: definition.spawnCount,
    charges: definition.charges,
    durable: definition.durable,
  } satisfies ItemDefinition];
})) as Readonly<Record<ItemId, ItemDefinition>>;

export const ITEM_LABELS = Object.fromEntries(
  ITEM_IDS.map((id) => [id, ITEM_DEFINITIONS[id].label]),
) as Readonly<Record<ItemId, string>>;

export const itemDefinition = (id: ItemId): ItemDefinition => ITEM_DEFINITIONS[id];

export function createItemInstances(): ItemInstance[] {
  return ITEM_IDS.flatMap((type) => Array.from(
    { length: ITEM_DEFINITIONS[type].spawnCount },
    (_, index) => ({ instanceId: `${type}-${index + 1}` as ItemInstanceId, type }),
  ));
}

export function createInitialItemState(): Record<ItemId, ItemStatus> {
  return Object.fromEntries(ITEM_IDS.map((id) => [id, 'available'])) as Record<ItemId, ItemStatus>;
}

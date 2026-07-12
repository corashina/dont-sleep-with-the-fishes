import {
  ITEM_DEFINITIONS,
  ITEM_IDS,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import type {
  InventoryMutation,
  ItemInventoryState,
  SurvivalInventory,
  SurvivalItemInstance,
} from './survivalTypes';

function survivalInstance(item: ItemInstance): SurvivalItemInstance {
  return {
    ...item,
    condition: 'usable',
    charges: ITEM_DEFINITIONS[item.type].charges,
  };
}

function recompute(entry: ItemInventoryState): void {
  const usable = entry.instances.filter(({ condition }) => condition === 'usable');
  entry.owned = usable.length > 0;
  entry.charges = entry.durable
    ? null
    : usable.reduce((total, instance) => total + (instance.charges ?? 0), 0);
}

function selectInstance(
  entry: ItemInventoryState,
  condition: SurvivalItemInstance['condition'],
  preferredId?: ItemInstanceId,
): SurvivalItemInstance | undefined {
  const preferred = preferredId === undefined
    ? undefined
    : entry.instances.find((instance) => (
      instance.instanceId === preferredId && instance.condition === condition
    ));
  return preferred ?? entry.instances.find((instance) => instance.condition === condition);
}

function nextInstanceId(entry: ItemInventoryState, itemId: InventoryMutation['itemId']): ItemInstanceId {
  const nextSuffix = entry.instances.reduce((largest, { instanceId }) => {
    const suffix = Number(instanceId.slice(instanceId.lastIndexOf('-') + 1));
    return Number.isInteger(suffix) ? Math.max(largest, suffix) : largest;
  }, 0) + 1;
  return `${itemId}-${nextSuffix}` as ItemInstanceId;
}

export function createSurvivalInventory(savedItems: readonly ItemInstance[]): SurvivalInventory {
  return Object.fromEntries(ITEM_IDS.map((id) => {
    const definition = ITEM_DEFINITIONS[id];
    const instances = savedItems.filter(({ type }) => type === id).map(survivalInstance);
    return [id, {
      owned: instances.length > 0,
      charges: definition.durable
        ? null
        : instances.reduce((total, instance) => total + (instance.charges ?? 0), 0),
      durable: definition.durable,
      instances,
    }];
  })) as SurvivalInventory;
}

export function usableInstances(
  inventory: SurvivalInventory,
  itemId: InventoryMutation['itemId'],
): SurvivalItemInstance[] {
  return inventory[itemId].instances.filter(({ condition }) => condition === 'usable');
}

export function applyInventoryMutation(
  inventory: SurvivalInventory,
  mutation: InventoryMutation,
): void {
  const entry = inventory[mutation.itemId];
  const quantity = Number.isFinite(mutation.quantity)
    ? Math.max(0, Math.floor(mutation.quantity))
    : 0;

  if (mutation.kind === 'gain') {
    for (let index = 0; index < quantity; index += 1) {
      entry.instances.push(survivalInstance({
        type: mutation.itemId,
        instanceId: nextInstanceId(entry, mutation.itemId),
      }));
    }
    recompute(entry);
    return;
  }

  const desiredCondition = mutation.kind === 'repair' ? 'broken' : 'usable';
  for (let index = 0; index < quantity; index += 1) {
    const instance = selectInstance(
      entry,
      desiredCondition,
      index === 0 ? mutation.instanceId : undefined,
    );
    if (instance === undefined) break;

    switch (mutation.kind) {
      case 'consume':
        if (instance.charges === null) {
          instance.condition = 'consumed';
        } else {
          instance.charges = Math.max(0, instance.charges - 1);
          if (instance.charges === 0) instance.condition = 'consumed';
        }
        break;
      case 'break':
        instance.condition = 'broken';
        break;
      case 'repair':
        instance.condition = 'usable';
        break;
      case 'lose':
        instance.condition = 'lost';
        break;
    }
  }
  recompute(entry);
}

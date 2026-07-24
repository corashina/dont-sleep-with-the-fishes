import {
  createItemInstances,
  ITEM_IDS,
  type ItemId,
  type ItemInstance,
} from './ItemState';

export const SCAVENGE_ITEM_IDS = Object.freeze(
  ITEM_IDS.filter((id): id is Exclude<ItemId, 'energyBar'> => id !== 'energyBar'),
);

export function createScavengeItemInstances(): ItemInstance[] {
  return createItemInstances().filter(({ type }) => type !== 'energyBar');
}

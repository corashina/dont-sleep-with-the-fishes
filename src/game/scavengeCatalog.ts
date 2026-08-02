import {
  createItemInstances,
  ITEM_IDS,
  type ItemId,
  type ItemInstance,
  type ItemInstanceId,
} from './ItemState';

export type ScavengeItemInstanceId = Exclude<
  ItemInstanceId,
  `energyBar-${number}`
>;

export const SCAVENGE_ITEM_IDS = Object.freeze(
  ITEM_IDS.filter((id): id is Exclude<ItemId, 'energyBar'> => id !== 'energyBar'),
);

export function createScavengeItemInstances(): Array<
  ItemInstance & { readonly instanceId: ScavengeItemInstanceId }
> {
  return createItemInstances().filter(
    (instance): instance is ItemInstance & { readonly instanceId: ScavengeItemInstanceId } =>
      instance.type !== 'energyBar',
  );
}

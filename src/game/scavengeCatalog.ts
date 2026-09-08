import {
  createItemInstances,
  type ItemInstance,
  type ItemInstanceId,
} from './ItemState';

export type ScavengeItemInstanceId = Exclude<
  ItemInstanceId,
  `energyBar-${number}`
>;

export function createScavengeItemInstances(): Array<
  ItemInstance & { readonly instanceId: ScavengeItemInstanceId }
> {
  return createItemInstances().filter(
    (instance): instance is ItemInstance & { readonly instanceId: ScavengeItemInstanceId } =>
      instance.type !== 'energyBar',
  );
}

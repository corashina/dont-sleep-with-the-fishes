import type { ItemId, ItemInstanceId } from '../game/ItemState';

export const FOOD_SUPPLY_ACTOR_ID = 'boat-food-supply' as ItemInstanceId;
export const BAIT_SUPPLY_ACTOR_ID = 'boat-bait-supply' as ItemInstanceId;

export function resourceSupplyActorId(itemId: ItemId | undefined): ItemInstanceId | null {
  if (itemId === 'cannedFood') return FOOD_SUPPLY_ACTOR_ID;
  if (itemId === 'baitTin') return BAIT_SUPPLY_ACTOR_ID;
  return null;
}

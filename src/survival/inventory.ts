import { ITEM_DEFINITIONS, ITEM_IDS, type ItemInstance } from '../game/ItemState';
import type { SurvivalInventory } from './survivalTypes';

export function createSurvivalInventory(savedItems: readonly ItemInstance[]): SurvivalInventory {
  return Object.fromEntries(ITEM_IDS.map((id) => {
    const definition = ITEM_DEFINITIONS[id];
    const count = savedItems.filter(({ type }) => type === id).length;
    return [id, {
      owned: count > 0,
      charges: definition.durable ? null : count * (definition.charges ?? 0),
      durable: definition.durable,
    }];
  })) as SurvivalInventory;
}

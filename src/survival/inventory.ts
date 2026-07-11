import { ITEM_DEFINITIONS, ITEM_IDS, type ItemId } from '../game/ItemState';
import type { SurvivalInventory } from './survivalTypes';

export function createSurvivalInventory(savedItems: readonly ItemId[]): SurvivalInventory {
  const saved = new Set(savedItems);
  return Object.fromEntries(ITEM_IDS.map((id) => {
    const definition = ITEM_DEFINITIONS[id];
    return [id, {
      owned: saved.has(id),
      charges: saved.has(id) ? definition.charges : 0,
      durable: definition.durable,
    }];
  })) as SurvivalInventory;
}

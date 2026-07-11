import { ITEM_IDS, type ItemId } from '../game/ItemState';
import type { SurvivalInventory } from './survivalTypes';

const DEFINITIONS: Readonly<Record<ItemId, { charges: number | null; durable: boolean }>> = {
  flareGun: { charges: 1, durable: false },
  ductTape: { charges: 2, durable: false },
  fishingRod: { charges: null, durable: true },
  baitTin: { charges: 3, durable: false },
  medicalKit: { charges: 2, durable: false },
  waterJug: { charges: 3, durable: false },
  cannedFood: { charges: 2, durable: false },
  flashlight: { charges: null, durable: true },
  scubaSet: { charges: null, durable: true },
};

export function createSurvivalInventory(savedItems: readonly ItemId[]): SurvivalInventory {
  const saved = new Set(savedItems);
  return Object.fromEntries(ITEM_IDS.map((id) => {
    const definition = DEFINITIONS[id];
    return [id, {
      owned: saved.has(id),
      charges: saved.has(id) ? definition.charges : 0,
      durable: definition.durable,
    }];
  })) as SurvivalInventory;
}

export const ITEM_IDS = [
  'flareGun', 'ductTape', 'fishingRod', 'baitTin', 'medicalKit',
  'waterJug', 'cannedFood', 'flashlight', 'scubaSet',
] as const;

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

export const ITEM_DEFINITIONS: Readonly<Record<ItemId, ItemDefinition>> = {
  flareGun: { label: 'FLARE GUN', weight: 1, spawnCount: 1, charges: 1, durable: false },
  ductTape: { label: 'DUCT TAPE', weight: 1, spawnCount: 2, charges: 2, durable: false },
  fishingRod: { label: 'FISHING ROD', weight: 2, spawnCount: 1, charges: null, durable: true },
  baitTin: { label: 'BAIT TIN', weight: 1, spawnCount: 2, charges: 3, durable: false },
  medicalKit: { label: 'MEDICAL KIT', weight: 2, spawnCount: 1, charges: 2, durable: false },
  waterJug: { label: 'WATER BOTTLE', weight: 2, spawnCount: 2, charges: 3, durable: false },
  cannedFood: { label: 'CANNED FOOD', weight: 1, spawnCount: 3, charges: 1, durable: false },
  flashlight: { label: 'FLASHLIGHT', weight: 1, spawnCount: 1, charges: null, durable: true },
  scubaSet: { label: 'SCUBA SET', weight: 3, spawnCount: 1, charges: null, durable: true },
};

export const ITEM_LABELS = Object.fromEntries(
  ITEM_IDS.map((id) => [id, ITEM_DEFINITIONS[id].label]),
) as Readonly<Record<ItemId, string>>;

export function createItemInstances(): ItemInstance[] {
  return ITEM_IDS.flatMap((type) => Array.from(
    { length: ITEM_DEFINITIONS[type].spawnCount },
    (_, index) => ({ instanceId: `${type}-${index + 1}` as ItemInstanceId, type }),
  ));
}

export const ITEM_IDS = [
  'flareGun',
  'ductTape',
  'fishingRod',
  'baitTin',
  'medicalKit',
  'waterJug',
  'cannedFood',
  'flashlight',
] as const;

export type ItemId = (typeof ITEM_IDS)[number];
export type ItemStatus = 'available' | 'carried' | 'saved' | 'lost';

export const ITEM_LABELS: Readonly<Record<ItemId, string>> = {
  flareGun: 'FLARE GUN',
  ductTape: 'DUCT TAPE',
  fishingRod: 'FISHING ROD',
  baitTin: 'BAIT TIN',
  medicalKit: 'MEDICAL KIT',
  waterJug: 'WATER JUG',
  cannedFood: 'CANNED FOOD',
  flashlight: 'FLASHLIGHT',
};

export function createInitialItemState(): Record<ItemId, ItemStatus> {
  return Object.fromEntries(ITEM_IDS.map((id) => [id, 'available'])) as Record<ItemId, ItemStatus>;
}

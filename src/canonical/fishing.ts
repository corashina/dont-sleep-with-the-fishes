import type { RuntimeItemId } from './items';

export type FishingCatchId =
  | 'cod' | 'flounder' | 'salmon' | 'tuna' | 'crab' | 'squid' | 'sardine'
  | 'bass' | 'herring' | 'redSnapper' | 'mackerel' | 'clownfish' | 'swordfish'
  | 'seaweed' | 'boot' | 'plasticBottle' | 'fishlet' | 'worms' | 'wetDuctTape'
  | 'brokenCompass' | 'tornFishingNet' | 'energyBar';

export interface FishingCatchDefinition {
  id: FishingCatchId;
  label: string;
  weight: number;
  minDay: number;
  food: number;
  itemGain?: RuntimeItemId;
  itemCondition?: 'usable' | 'broken';
  consumesBait: boolean;
}

const fishingCatches: FishingCatchDefinition[] = [
  { id: 'cod', label: 'Cod', weight: 20, minDay: 0, food: 1, consumesBait: true },
  { id: 'flounder', label: 'Flounder', weight: 15, minDay: 0, food: 1, consumesBait: true },
  { id: 'salmon', label: 'Salmon', weight: 24, minDay: 0, food: 1, consumesBait: true },
  { id: 'tuna', label: 'Tuna', weight: 5, minDay: 3, food: 2, consumesBait: true },
  { id: 'crab', label: 'Crab', weight: 14, minDay: 2, food: 1, consumesBait: true },
  { id: 'squid', label: 'Squid', weight: 7, minDay: 3, food: 2, consumesBait: true },
  { id: 'sardine', label: 'Sardine', weight: 45, minDay: 0, food: 1, consumesBait: true },
  { id: 'bass', label: 'Bass', weight: 30, minDay: 0, food: 1, consumesBait: true },
  { id: 'herring', label: 'Herring', weight: 20, minDay: 0, food: 1, consumesBait: true },
  { id: 'redSnapper', label: 'Red Snapper', weight: 20, minDay: 0, food: 1, consumesBait: true },
  { id: 'mackerel', label: 'Mackerel', weight: 15, minDay: 0, food: 1, consumesBait: true },
  { id: 'clownfish', label: 'Clownfish', weight: 1, minDay: 0, food: 1, consumesBait: true },
  { id: 'swordfish', label: 'Swordfish', weight: 1, minDay: 0, food: 3, consumesBait: true },
  { id: 'seaweed', label: 'Seaweed', weight: 82, minDay: 0, food: 0, consumesBait: false },
  { id: 'boot', label: 'Boot', weight: 72, minDay: 0, food: 0, consumesBait: false },
  { id: 'plasticBottle', label: 'Plastic Bottle', weight: 60, minDay: 0, food: 0, consumesBait: false },
  { id: 'fishlet', label: 'Fishlet', weight: 12, minDay: 2, food: 0, consumesBait: true },
  {
    id: 'worms', label: 'Worms', weight: 5, minDay: 0, food: 0,
    itemGain: 'baitTin', itemCondition: 'usable', consumesBait: false,
  },
  {
    id: 'wetDuctTape', label: 'Wet Duct Tape', weight: 5, minDay: 3, food: 0,
    itemGain: 'ductTape', itemCondition: 'usable', consumesBait: false,
  },
  {
    id: 'brokenCompass', label: 'Broken Compass', weight: 5, minDay: 0, food: 0,
    itemGain: 'compass', itemCondition: 'broken', consumesBait: false,
  },
  {
    id: 'tornFishingNet', label: 'Torn Fishing Net', weight: 3, minDay: 0, food: 0,
    itemGain: 'fishingNet', itemCondition: 'broken', consumesBait: false,
  },
  {
    id: 'energyBar', label: 'Energy Bar', weight: 8, minDay: 0, food: 0,
    itemGain: 'energyBar', itemCondition: 'usable', consumesBait: false,
  },
];

export const FISHING_CATCHES: readonly FishingCatchDefinition[] = Object.freeze(
  fishingCatches.map((entry) => Object.freeze(entry)),
);

export function eligibleCatches(day: number): readonly FishingCatchDefinition[] {
  return FISHING_CATCHES.filter(({ minDay }) => minDay <= day);
}

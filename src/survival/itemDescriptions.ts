import type { ItemId } from '../game/ItemState';

export const SURVIVAL_ITEM_DESCRIPTIONS: Readonly<Record<ItemId, string>> = {
  flareGun: 'Signals distant sightings and may frighten a threat.',
  ductTape: 'Patches leaks and reinforces emergency repairs.',
  fishingRod: 'Improves attempts to catch fish for food.',
  baitTin: 'Improves the odds of catching fish.',
  medicalKit: 'Treats injuries and restores health.',
  waterJug: 'Helps in heat and supplies water for rest.',
  cannedFood: 'Relieves hunger when eaten.',
  flashlight: 'Illuminates dark inspections and safer diving.',
  scubaSet: 'Enables safe dives beneath the lifeboat.',
};

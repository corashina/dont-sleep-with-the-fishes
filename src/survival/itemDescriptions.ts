import type { ItemId } from '../game/ItemState';
import { SURVIVAL_BALANCE } from './survivalBalance';

export const SURVIVAL_ITEM_DESCRIPTIONS: Readonly<Record<ItemId, string>> = {
  cannedFood: 'One meal that relieves hunger.',
  baitTin: 'One bait portion that improves a fishing attempt.',
  ductTape: 'A single emergency repair for a broken item or hull patch.',
  compass: 'Keeps direction when landmarks disappear.',
  map: 'Charts safer water through dangerous routes.',
  medicalKit: 'Treats injuries once.',
  spyglass: 'Reveals distant movement and threats.',
  fishingNet: 'Collects fish and floating supplies.',
  bucket: 'Bails water and catches loose supplies.',
  flareGun: 'Fires one signal flare.',
  scubaSet: 'Enables dives beneath the lifeboat.',
  anchor: 'Holds the lifeboat against dangerous water.',
  bottledPaper: 'Sends one rescue message for one energy.',
  umbrella: 'Provides cover from rain, sun, and strange sights.',
  swimRing: 'Provides emergency flotation.',
  flashlight: 'Improves visibility in darkness and while diving.',
  harpoonGun: 'Provides one defensive harpoon shot.',
  energyBar: `Restores energy to ${SURVIVAL_BALANCE.actions.maximumEnergy} once.`,
};

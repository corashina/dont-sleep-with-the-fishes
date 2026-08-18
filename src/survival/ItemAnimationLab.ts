import type { ItemId } from '../game/ItemState';

export const ITEM_ANIMATION_LAB_ID = 'item-animation-lab';
export const ITEM_ANIMATION_LAB_TITLE = 'Item Animation Lab';

export interface ItemAnimationLabUse {
  readonly eventId: string;
  readonly choiceId: string;
}

export const ITEM_ANIMATION_LAB_USES: Readonly<Partial<Record<ItemId, ItemAnimationLabUse>>> =
  Object.freeze({
    cannedFood: Object.freeze({ eventId: 'death-stare', choiceId: 'food' }),
    baitTin: Object.freeze({ eventId: 'swarm-of-anglerfish', choiceId: 'bait' }),
    ductTape: Object.freeze({ eventId: 'leak', choiceId: 'ductTape' }),
    compass: Object.freeze({ eventId: 'man-in-the-fog', choiceId: 'compass' }),
    map: Object.freeze({ eventId: 'dangerous-waters', choiceId: 'map' }),
    medicalKit: Object.freeze({ eventId: 'flowers', choiceId: 'medicalKit' }),
    spyglass: Object.freeze({ eventId: 'school-of-fish', choiceId: 'spyglass' }),
    fishingNet: Object.freeze({ eventId: 'school-of-fish', choiceId: 'fishingNet' }),
    bucket: Object.freeze({ eventId: 'school-of-fish', choiceId: 'bucket' }),
    flareGun: Object.freeze({ eventId: 'ghosts', choiceId: 'flareGun' }),
    anchor: Object.freeze({ eventId: 'tornado', choiceId: 'anchor' }),
    umbrella: Object.freeze({ eventId: 'shower-night', choiceId: 'umbrella' }),
    swimRing: Object.freeze({ eventId: 'tornado', choiceId: 'swimRing' }),
    flashlight: Object.freeze({ eventId: 'death-stare', choiceId: 'flashlight' }),
    shotgun: Object.freeze({ eventId: 'snatcher', choiceId: 'shotgun' }),
    energyBar: Object.freeze({ eventId: 'flowers', choiceId: 'energyBar' }),
    carlitos: Object.freeze({ eventId: 'flowers', choiceId: 'carlitos' }),
  });

export function isItemAnimationLabId(id: string | undefined): boolean {
  return id === ITEM_ANIMATION_LAB_ID;
}

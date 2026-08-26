import type { ItemId, ItemInstanceId } from '../game/ItemState';
import type { ChestSnapshot, EventResponseId } from './survivalTypes';

export const ITEM_ANIMATION_LAB_ID = 'item-animation-lab';
export const ITEM_ANIMATION_LAB_TITLE = 'Item Animation Lab';
export const ITEM_ANIMATION_LAB_INITIAL_RESOURCES = Object.freeze({
  food: 3,
  bait: 3,
});
export const ITEM_ANIMATION_LAB_INITIAL_CHEST: ChestSnapshot = Object.freeze({
  state: 'closed',
  acquiredDay: 1,
});
export const CARLITOS_LAB_INSTANCE_ID = 'carlitos-1' as ItemInstanceId;
export const CARLITOS_LAB_CHOICE_ID = 'carlitos' as EventResponseId;
export const REPAIR_TOOLBOX_LAB_INSTANCE_ID = 'repair-tools' as ItemInstanceId;
export const REPAIR_TOOLBOX_LAB_CHOICE_ID = 'toolboxRepair' as EventResponseId;

export interface ItemAnimationLabUse {
  readonly id: EventResponseId;
  readonly label: string;
  readonly eventId: string;
  readonly choiceId: string;
}

const use = (
  id: string,
  label: string,
  eventId: string,
  choiceId: string,
): ItemAnimationLabUse => Object.freeze({ id, label, eventId, choiceId });

const uses = (...entries: ItemAnimationLabUse[]): readonly ItemAnimationLabUse[] =>
  Object.freeze(entries);

export const ITEM_ANIMATION_LAB_USES:
Readonly<Partial<Record<ItemId, readonly ItemAnimationLabUse[]>>> = Object.freeze({
  cannedFood: uses(
    use('throw-target', 'Throw at target', 'death-stare', 'food'),
    use('trade-handover', 'Trade handover', 'night-trader', 'food'),
  ),
  baitTin: uses(
    use('throw-target', 'Throw at target', 'swarm-of-anglerfish', 'bait'),
    use('trade-handover', 'Trade handover', 'night-trader', 'bait'),
  ),
  ductTape: uses(
    use('tape-stretch', 'Stretch tape', 'leak', 'ductTape'),
    use('trade-handover', 'Trade handover', 'handyman', 'ductTape'),
  ),
  compass: uses(
    use('compass-search', 'Search with compass', 'man-in-the-fog', 'compass'),
  ),
  map: uses(
    use('map-read', 'Read map', 'dangerous-waters', 'map'),
    use('map-leak-patch', 'Patch leak', 'leak', 'map'),
    use('cover-supplies', 'Cover supplies', 'shower-night', 'map'),
    use('trade-handover', 'Trade handover', 'night-trader', 'map'),
  ),
  medicalKit: uses(
    use('throw-target', 'Throw at target', 'flowers', 'medicalKit'),
    use('trade-handover', 'Trade handover', 'handyman', 'medicalKit'),
  ),
  spyglass: uses(
    use('binocular-look', 'Look through', 'school-of-fish', 'spyglass'),
    use('trade-handover', 'Trade handover', 'handyman', 'spyglass'),
  ),
  fishingNet: uses(
    use('net-scoop', 'Scoop from water', 'school-of-fish', 'fishingNet'),
    use('net-spread', 'Spread net', 'swarm-of-anglerfish', 'fishingNet'),
    use('trade-handover', 'Trade handover', 'handyman', 'fishingNet'),
  ),
  rope: uses(
    use('base', 'Lift rope', 'windy-night', 'rope'),
  ),
  bucket: uses(
    use('bucket-scoop', 'Scoop from water', 'school-of-fish', 'bucket'),
    use('bucket-helmet', 'Wear as helmet', 'shower-night', 'bucket'),
    use('base', 'Lift bucket', 'flowers', 'bucket'),
    use('trade-handover', 'Trade handover', 'handyman', 'bucket'),
  ),
  flareGun: uses(
    use('flare-target', 'Fire at target', 'ghosts', 'flareGun'),
    use('flare-sky', 'Signal sky', 'other-people', 'flareGun'),
    use('base', 'Raise flare gun', 'shadow-figure', 'flareGun'),
    use('trade-handover', 'Trade handover', 'handyman', 'flareGun'),
  ),
  anchor: uses(
    use('anchor-drop', 'Drop anchor', 'tornado', 'anchor'),
    use('trade-handover', 'Trade handover', 'handyman', 'anchor'),
  ),
  umbrella: uses(
    use('umbrella-overhead', 'Hold overhead', 'shower-night', 'umbrella'),
    use('umbrella-shield', 'Use as shield', 'death-stare', 'umbrella'),
    use('cover-supplies', 'Cover supplies', 'windy-night', 'umbrella'),
    use('trade-handover', 'Trade handover', 'night-trader', 'umbrella'),
  ),
  swimRing: uses(
    use('throw-target', 'Throw at target', 'tornado', 'swimRing'),
  ),
  flashlight: uses(
    use('flashlight-threat-beam', 'Aim threat beam', 'death-stare', 'flashlight'),
    use('flashlight-signal', 'Send signal', 'plane', 'flashlight'),
    use('trade-handover', 'Trade handover', 'handyman', 'flashlight'),
  ),
  shotgun: uses(
    use('shotgun-fire', 'Fire shotgun', 'snatcher', 'shotgun'),
    use('trade-handover', 'Trade handover', 'handyman', 'shotgun'),
  ),
  energyBar: uses(
    use('throw-target', 'Throw at target', 'flowers', 'energyBar'),
    use('trade-handover', 'Trade handover', 'handyman', 'energyBar'),
  ),
});

export function isItemAnimationLabId(id: string | undefined): boolean {
  return id === ITEM_ANIMATION_LAB_ID;
}

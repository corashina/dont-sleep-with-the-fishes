import { presentationUiText, type PresentationUiKey } from '../i18n/presentationUiMessages';
import type { ItemId, ItemInstanceId } from '../game/ItemState';
import type { ChestSnapshot, EventResponseId } from './survivalTypes';

export const ITEM_ANIMATION_LAB_ID = 'item-animation-lab';
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
export const FISHING_ROD_LAB_INSTANCE_ID = 'fishing-tools' as ItemInstanceId;
export const FISHING_ROD_LAB_CHOICE_ID = 'fish' as EventResponseId;
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
  label: PresentationUiKey,
  eventId: string,
  choiceId: string,
): ItemAnimationLabUse => Object.freeze({ id, get label() { return presentationUiText(label); }, eventId, choiceId });

const uses = (...entries: ItemAnimationLabUse[]): readonly ItemAnimationLabUse[] =>
  Object.freeze(entries);

export const ITEM_ANIMATION_LAB_USES:
Readonly<Partial<Record<ItemId, readonly ItemAnimationLabUse[]>>> = Object.freeze({
  cannedFood: uses(
    use('throw-target', 'throwTarget', 'death-stare', 'food'),
    use('trade-handover', 'tradeHandover', 'night-trader', 'food'),
  ),
  baitTin: uses(
    use('throw-target', 'throwTarget', 'swarm-of-sharks', 'bait'),
    use('trade-handover', 'tradeHandover', 'night-trader', 'bait'),
  ),
  ductTape: uses(
    use('tape-stretch', 'stretchTape', 'leak', 'ductTape'),
    use('trade-handover', 'tradeHandover', 'handyman', 'ductTape'),
  ),
  compass: uses(
    use('compass-search', 'searchCompass', 'man-in-the-fog', 'compass'),
  ),
  map: uses(
    use('map-read', 'readMap', 'dangerous-waters', 'map'),
    use('map-leak-patch', 'patchLeak', 'leak', 'map'),
    use('trade-handover', 'tradeHandover', 'night-trader', 'map'),
  ),
  medicalKit: uses(
    use('throw-target', 'throwTarget', 'flowers', 'medicalKit'),
    use('trade-handover', 'tradeHandover', 'handyman', 'medicalKit'),
  ),
  spyglass: uses(
    use('binocular-look', 'lookThrough', 'school-of-fish', 'spyglass'),
    use('trade-handover', 'tradeHandover', 'handyman', 'spyglass'),
  ),
  fishingNet: uses(
    use('net-scoop', 'scoopWater', 'school-of-fish', 'fishingNet'),
    use('net-attack', 'attack', 'snatcher', 'attack'),
    use('trade-handover', 'tradeHandover', 'handyman', 'fishingNet'),
  ),
  knife: uses(
    use('knife-stab', 'stabKnife', 'snatcher', 'knife'),
    use('trade-handover', 'tradeHandover', 'handyman', 'knife'),
  ),
  bucket: uses(
    use('bucket-scoop', 'scoopWater', 'school-of-fish', 'bucket'),
    use('bucket-helmet', 'wearHelmet', 'shower-night', 'bucket'),
    use('trade-handover', 'tradeHandover', 'handyman', 'bucket'),
  ),
  flareGun: uses(
    use('flare-target', 'fireTarget', 'ghosts', 'flareGun'),
    use('flare-sky', 'signalSky', 'other-people', 'flareGun'),
    use('trade-handover', 'tradeHandover', 'handyman', 'flareGun'),
  ),
  anchor: uses(
    use('anchor-drop', 'dropAnchor', 'tornado', 'anchor'),
    use('trade-handover', 'tradeHandover', 'handyman', 'anchor'),
  ),
  radio: uses(
    use('radio-signal-receive', 'receiveSignal', ITEM_ANIMATION_LAB_ID, 'radioSignal'),
    use('trade-handover', 'tradeHandover', 'handyman', 'radio'),
  ),
  umbrella: uses(
    use('umbrella-overhead', 'holdOverhead', 'shower-night', 'umbrella'),
    use('umbrella-shield', 'useShield', 'death-stare', 'umbrella'),
    use('trade-handover', 'tradeHandover', 'night-trader', 'umbrella'),
  ),
  swimRing: uses(
    use('throw-target', 'throwTarget', 'tornado', 'swimRing'),
    use('trade-handover', 'tradeNight', 'night-trader', 'swimRing'),
    use('handyman-handover', 'tradeHandyman', 'handyman', 'swimRing'),
  ),
  flashlight: uses(
    use('flashlight-threat-beam', 'aimBeam', 'death-stare', 'flashlight'),
    use('flashlight-signal', 'sendSignal', 'plane', 'flashlight'),
    use('trade-handover', 'tradeHandover', 'handyman', 'flashlight'),
  ),
  shotgun: uses(
    use('shotgun-fire', 'fireShotgun', 'snatcher', 'shotgun'),
    use('trade-handover', 'tradeHandover', 'handyman', 'shotgun'),
  ),
  energyBar: uses(
    use('throw-target', 'throwTarget', 'flowers', 'energyBar'),
    use('trade-handover', 'tradeHandover', 'handyman', 'energyBar'),
  ),
});

export function isItemAnimationLabId(id: string | undefined): boolean {
  return id === ITEM_ANIMATION_LAB_ID;
}

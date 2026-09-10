export const EVENT_MODEL_IDS = [
  'ghostShip',
  'lighthouse',
  'chestClosed',
  'midnightIsland',
  'deadTree',
  'traderRowboat',
  'traderOctopus',
  'riggedHand',
  'containerShip',
  'airplane',
  'flyingSaucer',
  'midnightPalmTrees',
  'midnightGravestone',
  'midnightCoffin',
  'midnightShovel',
  'midnightBush',
  'midnightCampfire',
  'midnightWoodLog',
  'midnightMonster',
] as const;

export type EventModelId = typeof EVENT_MODEL_IDS[number];

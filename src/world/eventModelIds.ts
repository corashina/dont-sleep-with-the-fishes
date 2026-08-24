export const EVENT_MODEL_IDS = [
  'chestClosed',
  'midnightIsland',
  'deadTree',
  'traderRowboat',
  'traderOctopus',
  'riggedHand',
  'containerShip',
  'midnightPalmTrees',
  'midnightShovel',
  'midnightMonster',
] as const;

export type EventModelId = typeof EVENT_MODEL_IDS[number];

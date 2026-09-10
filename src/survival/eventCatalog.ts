import type { ItemId } from '../game/ItemState';
import { nightTraderChoices, nightTraderEventForSeed } from './nightTraderTrades';
import { HANDYMAN_ITEM_IDS } from './tradeRules';
import {
  DRIFTING_SUPPLY_KINDS,
  DRIFTING_SUPPLY_PLAYER_ENERGY_COST,
} from './driftingSupplies';
import { survivalEventFallbackById } from './eventSelection';
import {
  localizeEventDefinitionText,
  registerEventDefinitionText,
} from '../i18n/eventMessages';
export { getEventResultMessage } from '../i18n/eventMessages';
import type {
  EventChoiceDefinition,
  DawnEnergy,
  EventInventoryMutation,
  EventResource,
  IntegerValue,
  PresentationCue,
  ResourceEffect,
  RiskLabel,
  EventPresentationKey,
  SurvivalEventDefinition,
  WeightedEventOutcome,
} from './survivalTypes';

export const SURVIVAL_EVENT_IDS = Object.freeze([
  'quiet-night',
  'starry-night',
  'ocean-of-blood',
  'dangerous-waters', 'leak', 'school-of-fish', 'snatcher',
  'death-stare', 'swarm-of-sharks', 'tornado', 'shower-night',
  'something-under-us',
  'windy-night', 'bad-sleep', 'thunderstorm', 'restless-waves',
  'monster-in-the-fog', 'ghosts', 'eerie-melody', 'face-on-the-moon',
  'shadow-figure', 'guarded-sleep',
  'drifting-supplies', 'drifting-chest', 'seagull-theft',
  'check-the-back',
  'flowers', 'chest-attack', 'midnight-tour', 'night-trader',
  'handyman', 'other-people', 'ghost-ship', 'plane', 'flying-saucer', 'lighthouse',
] as const);

export type SurvivalEventId = typeof SURVIVAL_EVENT_IDS[number];
export type SignalSightingEventId = Extract<
  SurvivalEventId,
  'other-people' | 'ghost-ship' | 'plane' | 'flying-saucer' | 'lighthouse'
>;

export const FLYBY_CHOICE_WINDOW_SECONDS = 10;
export const UFO_CHOICE_WINDOW_SECONDS = 12;

export function isSignalSightingEventId(
  eventId: string,
): eventId is SignalSightingEventId {
  return eventId === 'other-people' || eventId === 'ghost-ship' || eventId === 'plane' || eventId === 'flying-saucer' || eventId === 'lighthouse';
}

export type DriftingItemEventId = Extract<
  SurvivalEventId,
  'drifting-supplies' | 'drifting-chest'
>;

export function isDriftingItemEventId(
  eventId: string,
): eventId is DriftingItemEventId {
  return eventId === 'drifting-supplies' || eventId === 'drifting-chest';
}

export type InspectableEventId = DriftingItemEventId;

export function isInspectableEventId(eventId: string): eventId is InspectableEventId {
  return isDriftingItemEventId(eventId);
}

export function driftingItemRetrieveKey(eventId: DriftingItemEventId): EventPresentationKey {
  return eventId === 'drifting-supplies'
    ? 'drifting-supplies.retrieve'
    : 'drifting-chest.retrieve';
}

const EVENT_REVEAL_TEXT: Readonly<Record<SurvivalEventId, string>> = Object.freeze({
  'starry-night': 'starryNightReveal',
  'ocean-of-blood': 'bloodOceanReveal',
  'quiet-night': 'eventText277',
  'dangerous-waters': 'eventText002',
  leak: 'eventText003',
  'school-of-fish': 'eventText004',
  snatcher: 'eventText005',
  'death-stare': 'eventText006',
  'swarm-of-sharks': 'eventText007',
  'something-under-us': 'underUsReveal',
  tornado: 'eventText008',
  'shower-night': 'eventText009',
  'windy-night': 'eventText010',
  'bad-sleep': 'eventText011',
  thunderstorm: 'eventText012',
  'restless-waves': 'eventText013',
  'monster-in-the-fog': 'eventText014',
  ghosts: 'eventText015',
  'eerie-melody': 'eventText016',
  'face-on-the-moon': 'eventText017',
  'shadow-figure': 'eventText018',
  'guarded-sleep': 'eventText019',
  'drifting-supplies': 'eventText020',
  'drifting-chest': 'eventText021',
  'seagull-theft': 'seagullTheftReveal',
  'check-the-back': 'eventText023',
  flowers: 'eventText024',
  'chest-attack': 'eventText025',
  'midnight-tour': 'eventText026',
  'night-trader': 'eventText027',
  handyman: 'eventText028',
  'other-people': 'eventText029',
  'ghost-ship': 'ghostShipReveal',
  plane: 'eventText030',
  'flying-saucer': 'ufoReveal',
  lighthouse: 'lighthouseReveal',
});

const resource = (
  resourceName: EventResource,
  operation: ResourceEffect['operation'],
  value: IntegerValue,
): ResourceEffect => ({ resource: resourceName, operation, value });
const add = (name: EventResource, value: IntegerValue) => resource(name, 'add', value);
const subtract = (name: EventResource, value: IntegerValue) => resource(name, 'subtract', value);
const mutation = (
  kind: 'consume' | 'break' | 'lose',
  itemId: ItemId,
  quantity = 1,
): EventInventoryMutation => ({ kind, itemId, quantity });
const consume = (itemId: ItemId) => mutation('consume', itemId);
const breakItem = (itemId: ItemId) => mutation('break', itemId);
const lose = (itemId: ItemId) => mutation('lose', itemId);
const loseRandom = (quantity: number): EventInventoryMutation => ({ kind: 'loseRandom', quantity });
const breakRandom = (quantity: number): EventInventoryMutation => ({ kind: 'breakRandom', quantity });
const loseEventTarget = (): EventInventoryMutation => ({ kind: 'loseEventTarget', quantity: 1 });
const gainChest = (): EventInventoryMutation =>
  ({ kind: 'gainChest', quantity: 1, fallbackFood: 1 });

function effects(
  resources?: readonly ResourceEffect[],
  items?: readonly EventInventoryMutation[],
): WeightedEventOutcome['effects'] {
  return {
    ...(resources?.length ? { resources } : {}),
    ...(items?.length ? { items } : {}),
  };
}

function atNextDawn(
  value: DawnEnergy,
  outcomeEffects: WeightedEventOutcome['effects'] = {},
): WeightedEventOutcome['effects'] {
  return { ...outcomeEffects, nextDawnEnergy: value };
}

function dangerousWatersEffects(
  resources: readonly ResourceEffect[] = [],
): WeightedEventOutcome['effects'] {
  return resources.length ? { resources } : {};
}

const outcome = (
  weight: number,
  message: string,
  outcomeEffects: WeightedEventOutcome['effects'] = {},
  resultId?: string,
): WeightedEventOutcome => ({
  ...(resultId === undefined ? {} : { resultId }),
  weight,
  message,
  effects: outcomeEffects,
});

const featuredOutcome = (
  presentationKey: EventPresentationKey,
  weight: number,
  message: string,
  outcomeEffects: WeightedEventOutcome['effects'] = {},
  minimumPriorAppearances?: number,
): WeightedEventOutcome => ({
  weight,
  message,
  presentationKey,
  ...(minimumPriorAppearances === undefined ? {} : { minimumPriorAppearances }),
  effects: outcomeEffects,
});

const featuredResultOutcome = (
  resultId: string,
  presentationKey: EventPresentationKey,
  weight: number,
  message: string,
  outcomeEffects: WeightedEventOutcome['effects'] = {},
): WeightedEventOutcome => ({
  resultId,
  weight,
  message,
  presentationKey,
  effects: outcomeEffects,
});

function driftingOutcomes(delegated: boolean): [WeightedEventOutcome, ...WeightedEventOutcome[]] {
  return DRIFTING_SUPPLY_KINDS.map((kind) => featuredResultOutcome(
    `drifting-supplies-${kind}-loot`,
    'drifting-supplies.retrieve',
    1,
    delegated ? 'driftingLootDelegated' : 'driftingLootRetrieved',
    effects(delegated ? [] : [subtract('energy', DRIFTING_SUPPLY_PLAYER_ENERGY_COST)]),
  )) as [WeightedEventOutcome, ...WeightedEventOutcome[]];
}

function choice(
  id: string,
  label: string,
  itemId: ItemId | undefined,
  ...outcomes: [WeightedEventOutcome, ...WeightedEventOutcome[]]
): EventChoiceDefinition {
  return { id, label, ...(itemId ? { itemId } : {}), outcomes };
}

const contextualChoice = (
  id: string,
  label: string,
  ...outcomes: [WeightedEventOutcome, ...WeightedEventOutcome[]]
): EventChoiceDefinition => ({ id, label, outcomes });

function event(
  id: SurvivalEventId,
  phase: 'day' | 'night',
  title: string,
  danger: RiskLabel,
  cue: PresentationCue,
  weight: number,
  earliestDay: number,
  cooldownDays: number,
  choices: [EventChoiceDefinition, ...EventChoiceDefinition[]],
  latestDay?: number,
  eligibility: Pick<
    SurvivalEventDefinition,
    | 'maximumAppearances' | 'absentItemIds' | 'minimumRescueLead'
    | 'minimumPressure' | 'maximumPressure' | 'allowedChestStates'
    | 'requiresCompanion' | 'minimumFood'
  > = {},
): SurvivalEventDefinition {
  return {
    id,
    phase,
    title,
    revealText: EVENT_REVEAL_TEXT[id],
    prompt: 'eventText001',
    danger,
    cue,
    weight,
    earliestDay,
    ...(latestDay === undefined ? {} : { latestDay }),
    ...eligibility,
    cooldownDays,
    choices,
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

const survivalEvents: SurvivalEventDefinition[] = [
  event('dangerous-waters', 'night', 'eventText031', 'dangerous', 'impact', 1, 2, 0, [
    choice('anchor', 'watersAnchorChoice', 'anchor',
      outcome(80, 'watersAnchorHeld'),
      outcome(20, 'watersAnchorBroke', effects(
        [subtract('hull', { min: 5, max: 10 })], [breakItem('anchor')],
      ))),
    choice('spyglass', 'watersLookoutChoice', 'spyglass',
      outcome(60, 'watersLookoutSafe', { nextDawnEnergyReduction: 1 }),
      outcome(40, 'watersLookoutScrape', {
        ...effects([subtract('hull', { min: 5, max: 10 })]),
        nextDawnEnergyReduction: 1,
      })),
    choice('map', 'eventText060', 'map',
      outcome(80, 'eventText111', dangerousWatersEffects()),
      outcome(20, 'eventText112', dangerousWatersEffects([
        subtract('hull', { min: 5, max: 10 }),
        add('pressure', 1),
      ]))),
    choice('compass', 'eventText062', 'compass',
      outcome(50, 'eventText113', dangerousWatersEffects()),
      outcome(50, 'eventText112', dangerousWatersEffects([
        subtract('hull', { min: 5, max: 8 }),
        add('pressure', 1),
      ]))),
    choice('sleep', 'eventText063', undefined,
      outcome(1, 'eventText112', dangerousWatersEffects([
        subtract('hull', { min: 25, max: 45 }),
        add('pressure', 1),
      ]))),
  ], 30, { maximumAppearances: 1 }),
  event('leak', 'night', 'eventText032', 'dangerous', 'impact', 1, 4, 0, [
    choice('ductTape', 'eventText064', 'ductTape', outcome(1, 'eventText114', effects(undefined, [consume('ductTape')]))),
    choice('bucket', 'eventText065', 'bucket', outcome(80, 'eventText115'), outcome(20, 'eventText116', effects([subtract('hull', { min: 5, max: 10 })], [breakItem('bucket')]))),
    choice('map', 'eventText060', 'map',
      outcome(60, 'eventText117'),
      outcome(40, 'eventText118', effects(undefined, [breakItem('map')]))),
    choice('sleep', 'eventText063', undefined,
      outcome(60, 'eventText119', atNextDawn(2, effects([subtract('hull', { min: 15, max: 20 })]))),
      outcome(40, 'eventText120', effects([subtract('hull', { min: 5, max: 20 })], [loseRandom(1)]))),
  ], undefined, { maximumAppearances: 1 }),
  event('school-of-fish', 'night', 'eventText033', 'uncertain', 'fish', 4, 8, 4, [
    choice('fishingNet', 'eventText066', 'fishingNet',
      outcome(60, 'eventText121', effects([add('food', 3)])),
      outcome(40, 'eventText122', effects([add('food', 2)], [breakItem('fishingNet')]))),
    choice('bucket', 'eventText065', 'bucket',
      outcome(50, 'eventText123', effects([add('food', 1)])),
      outcome(50, 'eventText124', effects(undefined, [breakItem('bucket')]))),
    choice('spyglass', 'eventText067', 'spyglass',
      outcome(50, 'eventText125'), outcome(50, 'eventText123', effects([add('food', 1)]))),
    choice('sleep', 'eventText063', undefined, outcome(1, 'eventText126')),
  ], undefined, { minimumPressure: 1 }),
  {
    ...event('snatcher', 'night', 'eventText034', 'uncertain', 'impact', 3, 8, 5, [
      choice('fishingNet', 'snatcherNetChoice', 'fishingNet',
        outcome(80, 'snatcherNetHeld'),
        outcome(20, 'snatcherNetTorn', effects(undefined, [breakItem('fishingNet')]))),
      choice('knife', 'eventText068', 'knife',
        outcome(1, 'eventText127')),
      choice('shotgun', 'eventText069', 'shotgun',
        outcome(1, 'eventText128',
          effects(undefined, [consume('shotgun')]))),
      choice('flareGun', 'eventText070', 'flareGun',
        outcome(1, 'eventText129',
          effects(undefined, [consume('flareGun')]))),
      choice('sleep', 'eventText063', undefined,
        outcome(1, 'eventText130', effects([
          subtract('health', 30),
        ], [loseEventTarget()]))),
    ]),
    targetItemIds: [
      'anchor', 'bucket', 'medicalKit', 'flareGun', 'flashlight',
      'map', 'scubaSet', 'umbrella', 'cannedFood',
    ],
  },
  event('death-stare', 'night', 'eventText035', 'dangerous', 'impact', 1, 9, 4, [
    { ...choice('flashlight', 'eventText071', 'flashlight',
      outcome(80, 'eventText131'),
      outcome(20, 'deathStareLightFlickers', atNextDawn(1))), breakChance: 0.40 },
    choice('umbrella', 'eventText072', 'umbrella',
      outcome(60, 'eventText133'),
      outcome(40, 'eventText134', effects([
        subtract('hull', { min: 44, max: 60 }), subtract('health', 60),
      ], [breakItem('umbrella')]))),
    choice('cannedFood', 'eventText073', 'cannedFood',
      outcome(66, 'eventText135', effects([subtract('food', 2)])),
      outcome(33, 'eventText134', effects([subtract('food', 1), subtract('hull', { min: 33, max: 55 }), subtract('health', 50)]))),
    choice('shotgun', 'eventText069', 'shotgun', outcome(1, 'eventText136', effects(undefined, [consume('shotgun')]))),
    choice('fishingNet', 'eventText066', 'fishingNet', outcome(1, 'eventText134', effects([subtract('hull', { min: 55, max: 60 }), subtract('health', 60)], [breakItem('fishingNet')]))),
    choice('sleep', 'eventText063', undefined, outcome(5, 'eventText137'), outcome(85, 'eventText134', effects([subtract('hull', { min: 44, max: 60 }), subtract('health', 60)]))),
  ], undefined, { minimumPressure: 1 }),
  event('swarm-of-sharks', 'night', 'eventText036', 'dangerous', 'fish', 1, 10, 4, [
    {
      ...choice('cannedFood', 'sharksFoodChoice', 'cannedFood',
        outcome(1, 'sharksFoodResult', effects([subtract('food', 2)]))),
      requirements: [{ resource: 'food', minimum: 2 }],
    },
    choice('fishingNet', 'eventText066', 'fishingNet',
      outcome(80, 'eventText138'),
      outcome(20, 'eventText139', effects(undefined, [breakItem('fishingNet')]))),
    choice('knife', 'eventText068', 'knife',
      outcome(80, 'eventText140'),
      outcome(20, 'eventText141', effects([
        subtract('health', 20),
      ], [breakItem('knife')]))),
    choice('shotgun', 'eventText069', 'shotgun', outcome(1, 'eventText122', effects([add('food', 2)], [consume('shotgun')]))),
    choice('flashlight', 'eventText071', 'flashlight', outcome(1, 'eventText142', effects([subtract('hull', { min: 20, max: 40 }), subtract('health', 50)]))),
    choice('baitTin', 'eventText074', 'baitTin', outcome(1, 'eventText143', effects([subtract('bait', 2)]))),
    choice('sleep', 'eventText063', undefined,
      outcome(65, 'eventText142', effects([subtract('hull', { min: 20, max: 40 }), subtract('health', 50)])), outcome(25, 'eventText144')),
  ], undefined, { minimumPressure: 1 }),
  event('tornado', 'night', 'eventText037', 'dangerous', 'impact', 1, 12, 3, [
    choice('anchor', 'eventText061', 'anchor', outcome(90, 'eventText145'), outcome(10, 'eventText116', effects([subtract('hull', { min: 5, max: 10 })], [breakItem('anchor')]))),
    choice('swimRing', 'eventText075', 'swimRing',
      outcome(60, 'eventText146'),
      outcome(40, 'eventText116', effects([
        subtract('hull', { min: 20, max: 40 }),
      ], [consume('swimRing')]))),
    choice('sleep', 'eventText063', undefined,
      outcome(80, 'eventText116', atNextDawn(0, effects([subtract('hull', { min: 20, max: 40 })]))),
      outcome(30, 'eventText147', atNextDawn(2, effects([subtract('hull', { min: 50, max: 60 })], [loseRandom(1)])))),
  ], undefined, { minimumPressure: 1 }),
  event('shower-night', 'night', 'eventText038', 'uncertain', 'storm', 3, 2, 4, [
    choice('bucket', 'eventText065', 'bucket', outcome(90, 'eventText148'), outcome(10, 'eventText148', effects(undefined, [breakItem('bucket')]))),
    choice('umbrella', 'eventText072', 'umbrella', outcome(100, 'eventText149'), outcome(50, 'eventText149', effects(undefined, [breakItem('umbrella')]))),
    choice('map', 'eventText060', 'map', outcome(1, 'eventText150', effects(undefined, [breakItem('map')]))),
    choice('sleep', 'eventText063', undefined, outcome(80, 'eventText151'), outcome(20, 'eventText152', atNextDawn(2))),
  ]),
  event('windy-night', 'night', 'eventText039', 'dangerous', 'storm', 1, 2, 4, [
    choice('ductTape', 'windTapeChoice', 'ductTape',
      outcome(1, 'windTapeResult', effects(
        [subtract('hull', { min: 10, max: 20 })], [consume('ductTape')],
      ))),
    choice('fishingNet', 'eventText066', 'fishingNet',
      outcome(80, 'eventText153'),
      outcome(20, 'eventText154', effects(undefined, [breakItem('fishingNet')]))),
    choice('map', 'eventText060', 'map', outcome(1, 'eventText155', effects([add('food', 1)], [lose('map')]))),
    choice('umbrella', 'eventText072', 'umbrella',
      outcome(50, 'eventText156'),
      outcome(50, 'eventText157', effects(undefined, [lose('umbrella')]))),
    choice('sleep', 'eventText063', undefined,
      outcome(80, 'eventText158', effects([subtract('hull', { min: 10, max: 30 })], [breakRandom(2)])),
      outcome(20, 'eventText158', atNextDawn(1, effects([subtract('hull', { min: 10, max: 30 })])))),
  ]),
  event('bad-sleep', 'night', 'eventText040', 'uncertain', 'darkness', 4, 2, 4, [
    choice('bucket', 'eventText065', 'bucket', outcome(1, 'eventText159')),
    choice('flashlight', 'eventText071', 'flashlight', outcome(1, 'eventText160')),
    choice('swimRing', 'eventText075', 'swimRing', outcome(1, 'eventText161')),
    choice('umbrella', 'eventText072', 'umbrella', outcome(100, 'eventText162'), outcome(5, 'eventText163', effects(undefined, [breakItem('umbrella')]))),
    choice('sleep', 'eventText063', undefined, outcome(1, 'eventText152', atNextDawn(2))),
  ], 10),
  event('thunderstorm', 'night', 'eventText041', 'dangerous', 'storm', 1, 2, 4, [
    choice('anchor', 'eventText061', 'anchor', outcome(80, 'eventText164'), outcome(20, 'eventText152', atNextDawn(2))),
    choice('bucket', 'eventText065', 'bucket',
      outcome(40, 'eventText116', effects([subtract('hull', { min: 15, max: 25 })], [breakItem('bucket')])),
      outcome(30, 'eventText116', effects([subtract('hull', { min: 20, max: 30 })])),
      outcome(20, 'eventText165', effects(undefined, [loseRandom(1)])),
      outcome(5, 'eventText165', effects(undefined, [loseRandom(1), breakItem('bucket')]))),
    choice('umbrella', 'eventText072', 'umbrella',
      outcome(60, 'eventText166'),
      outcome(40, 'eventText116', effects([
        subtract('hull', { min: 20, max: 30 }),
      ], [breakItem('umbrella')]))),
    choice('sleep', 'eventText063', undefined,
      outcome(60, 'eventText167', atNextDawn(2, effects([subtract('hull', { min: 30, max: 48 })], [loseRandom(1)]))),
      outcome(30, 'eventText168', atNextDawn(2, effects([subtract('hull', { min: 20, max: 35 })])))),
  ]),
  event('restless-waves', 'night', 'eventText042', 'dangerous', 'impact', 1, 3, 4, [
    choice('anchor', 'eventText061', 'anchor', outcome(1, 'eventText169')),
    choice('swimRing', 'eventText075', 'swimRing',
      outcome(50, 'eventText170'),
      outcome(50, 'eventText171', effects([
        subtract('hull', { min: 10, max: 20 }),
      ], [consume('swimRing')]))),
    choice('sleep', 'eventText063', undefined,
      outcome(50, 'eventText171', atNextDawn(1, effects([subtract('hull', { min: 20, max: 30 })]))),
      outcome(50, 'eventText172', effects([subtract('hull', { min: 15, max: 25 })], [loseRandom(1)]))),
  ]),
  event('ocean-of-blood', 'night', 'bloodOceanTitle', 'uncertain', 'darkness', 1, 12, 8, [
    choice('fishingNet', 'bloodOceanNetChoice', 'fishingNet',
      outcome(1, 'bloodOceanNetResult', effects([add('food', 1), add('pressure', 1)]), 'blood-ocean-searched')),
    contextualChoice('sleep', 'bloodOceanWaitChoice',
      outcome(1, 'bloodOceanWaitResult', { maximumNextDawnEnergy: 2 }, 'blood-ocean-waited')),
  ], undefined, { minimumPressure: 2, maximumAppearances: 1 }),
  event('monster-in-the-fog', 'night', 'eventText043', 'dangerous', 'darkness', 1, 6, 4, [
    choice('compass', 'eventText062', 'compass',
      outcome(1, 'eventText173',
        effects([subtract('pressure', 1)]))),
    choice('spyglass', 'eventText067', 'spyglass', outcome(1, 'eventText174', effects([add('pressure', 1)]))),
    choice('flashlight', 'eventText071', 'flashlight',
      outcome(60, 'eventText175'),
      outcome(40, 'eventText176', atNextDawn(1, effects([
        add('pressure', 2), subtract('health', 20),
      ])))),
    choice('sleep', 'eventText063', undefined,
      outcome(50, 'eventText116', effects([add('pressure', 1), subtract('hull', { min: 10, max: 30 })])),
      outcome(50, 'eventText177', atNextDawn(2, effects([add('pressure', 1), subtract('health', 20)])))),
  ], undefined, { minimumPressure: 1 }),
  event('ghosts', 'night', 'eventText044', 'uncertain', 'darkness', 3, 8, 4, [
    choice('flareGun', 'eventText070', 'flareGun',
      outcome(1, 'eventText178',
        effects([subtract('pressure', 1)], [consume('flareGun')]))),
    choice('flashlight', 'eventText071', 'flashlight', outcome(60, 'eventText179'), outcome(40, 'eventText180', atNextDawn(1))),
    choice('sleep', 'eventText063', undefined, outcome(60, 'eventText152', atNextDawn(2)), outcome(30, 'eventText180', atNextDawn(1))),
  ], undefined, { minimumPressure: 1 }),
  event('eerie-melody', 'night', 'eventText045', 'dangerous', 'darkness', 1, 13, 3, [
    choice('bucket', 'eventText065', 'bucket', outcome(1, 'eventText180', atNextDawn(1, effects(undefined, [breakItem('bucket')])))),
    choice('spyglass', 'eventText067', 'spyglass', outcome(1, 'eventText181', effects([subtract('hull', { min: 30, max: 40 }), subtract('health', 20)]))),
    choice('umbrella', 'eventText072', 'umbrella',
      outcome(60, 'eventText182'),
      outcome(40, 'eventText116', atNextDawn(1, effects([
        subtract('hull', { min: 25, max: 35 }),
      ], [breakItem('umbrella')])))),
    choice('ductTape', 'eventText064', 'ductTape',
      outcome(1, 'eventText183',
        effects([subtract('pressure', 1)], [consume('ductTape')]))),
    choice('sleep', 'eventText063', undefined,
      outcome(60, 'eventText184', atNextDawn(0)),
      outcome(40, 'eventText181', atNextDawn(1, effects([subtract('hull', { min: 30, max: 40 }), subtract('health', 20)])))),
  ], undefined, { minimumPressure: 2 }),
  event('face-on-the-moon', 'night', 'eventText046', 'uncertain', 'darkness', 1, 17, 5, [
    choice('umbrella', 'eventText072', 'umbrella', outcome(1, 'eventText152', atNextDawn(2))),
    choice('spyglass', 'eventText067', 'spyglass',
      outcome(60, 'eventText180', atNextDawn(1, effects(undefined, [breakItem('spyglass')]))),
      outcome(40, 'eventText174', effects([add('pressure', 1)]))),
    choice('sleep', 'eventText063', undefined,
      outcome(100, 'eventText184', atNextDawn(0)),
      outcome(20, 'eventText152', atNextDawn(2))),
  ], undefined, { minimumPressure: 3 }),
  event('shadow-figure', 'night', 'eventText047', 'dangerous', 'darkness', 1, 20, 3, [
    choice('flashlight', 'eventText071', 'flashlight',
      outcome(50, 'eventText185', effects([add('pressure', 1)])),
      outcome(50, 'eventText186', effects([subtract('health', 50)]))),
    choice('flareGun', 'eventText070', 'flareGun', outcome(
      1,
      'eventText187',
      effects(undefined, [consume('flareGun')]),
    )),
    contextualChoice('sleep', 'eventText063', outcome(1, 'eventText188')),
  ], undefined, { minimumPressure: 3, requiresCompanion: true }),
  event('guarded-sleep', 'night', 'eventText048', 'uncertain', 'darkness', 4, 7, 0, [
    {
      ...contextualChoice('watch', 'eventText076',
        outcome(85, 'eventText189'),
        outcome(15, 'eventText190', { followUpNight: true })),
      companionAction: { id: 'watchCarlitos' },
    },
    contextualChoice('sleep', 'eventText077', outcome(
      1,
      'eventText191',
      { followUpNight: true },
    )),
  ], undefined, { requiresCompanion: true, maximumAppearances: 1 }),
  event('drifting-supplies', 'day', 'eventText049', 'safe', 'fish', 1, 3, 1, [
    {
      ...contextualChoice('retrieve', 'eventText078', ...driftingOutcomes(false)),
      requirements: [{ resource: 'energy', minimum: DRIFTING_SUPPLY_PLAYER_ENERGY_COST }],
    },
    {
      ...contextualChoice('delegate-carlitos', 'eventText080', ...driftingOutcomes(true)),
      companionAction: { id: 'delegateCarlitos' },
    },
    contextualChoice('sleep', 'eventText081', outcome(1, 'eventText212')),
  ]),
  event('drifting-chest', 'day', 'eventText050', 'safe', 'fish', 1, 3, 1, [
    {
      ...contextualChoice('retrieve', 'eventText079',
        featuredOutcome(
          'drifting-chest.retrieve',
          1,
          'eventText213',
          effects([subtract('energy', 1)], [gainChest()]),
        ),
      ),
      requirements: [{ resource: 'energy', minimum: 1 }],
    },
    {
      ...contextualChoice('delegate-carlitos', 'eventText080',
        featuredOutcome(
          'drifting-chest.retrieve',
          1,
          'eventText214',
          effects(undefined, [gainChest()]),
        )),
      companionAction: { id: 'delegateCarlitos' },
    },
    contextualChoice('sleep', 'eventText081', outcome(
      1,
      'eventText215',
    )),
  ], undefined, { allowedChestStates: ['none'] }),
  event('seagull-theft', 'day', 'seagullTheftTitle', 'dangerous', 'none', 1, 3, 3, [
    contextualChoice('steal', 'seagullTheftChoice',
      outcome(1, 'seagullTheftResult', effects([subtract('food', 1)]))),
  ], undefined, { minimumFood: 1 }),
  event('check-the-back', 'night', 'eventText052', 'uncertain', 'fish', 3, 2, 4, [
    choice('knife', 'eventText068', 'knife',
      {
        ...featuredOutcome('check-the-back.fish', 80,
          'eventText232', effects([add('food', 1)])),
        resultId: 'check-the-back.fish',
      },
      {
        ...featuredOutcome('check-the-back.bad', 20,
          'eventText233',
          effects(undefined, [breakItem('knife')])),
        resultId: 'check-the-back.bad',
      },
    ),
    contextualChoice('check', 'eventText085',
      {
        ...featuredOutcome('check-the-back.fish', 80, 'eventText234', effects([add('food', 1)])),
        resultId: 'check-the-back.fish',
      },
      {
        ...featuredOutcome('check-the-back.bad', 20, 'eventText235', effects([subtract('health', 25)])),
        resultId: 'check-the-back.bad',
      },
    ),
    contextualChoice('sleep', 'eventText086',
      featuredOutcome('check-the-back.ignore', 1, 'eventText236')),
  ], undefined, { allowedChestStates: ['none'] }),
  event('flowers', 'night', 'eventText053', 'safe', 'sighting', 1, 2, 0, [
    choice('fishingNet', 'eventText066', 'fishingNet',
      featuredOutcome('flowers.collect', 1, 'eventText237')),
    choice('bucket', 'eventText065', 'bucket',
      featuredOutcome('flowers.collect', 1, 'eventText238')),
    contextualChoice('sleep', 'eventText087',
      featuredOutcome('flowers.drift', 1, 'eventText239')),
  ], 13, { maximumAppearances: 1 }),
  event('chest-attack', 'night', 'eventText054', 'dangerous', 'impact', 1, 1, 0, [
    choice('knife', 'eventText068', 'knife',
      outcome(1, 'eventText240', {
        resources: [subtract('health', 10)],
        chest: 'destroy',
      }, 'chest-attack')),
    contextualChoice('attack', 'eventText088',
      outcome(1, 'eventText241', {
        resources: [subtract('health', 25)],
        chest: 'destroy',
      }, 'chest-attack')),
  ], undefined, { allowedChestStates: ['mimic'] }),
  event('midnight-tour', 'night', 'eventText055', 'dangerous', 'sighting', 2, 7, 3, [
    contextualChoice('visit', 'eventText089',
      outcome(40, 'eventText242', {
        ...atNextDawn(2, { resources: [add('pressure', 1)] }),
        items: [gainChest()],
      }, 'tour-chest'),
      outcome(20, 'midnightGraveResult', atNextDawn(2), 'tour-grave'),
      outcome(15, 'midnightCampResult', {
        resources: [add('food', { min: 0, max: 2 }), add('bait', { min: 0, max: 2 })],
      }, 'tour-camp'),
      outcome(5, 'midnightCampBackpackResult', {
        resources: [add('food', { min: 0, max: 2 }), add('bait', { min: 0, max: 2 })],
      }, 'tour-camp-backpack'),
      outcome(20, 'eventText243', {
        resources: [subtract('health', { min: 25, max: 45 })],
      }, 'tour-attack'),
    ),
    contextualChoice('sleep', 'eventText090', outcome(1, 'eventText244', {}, 'tour-pass')),
  ], 40, { minimumPressure: 1, allowedChestStates: ['none'] }),
  event('night-trader', 'night', 'eventText056', 'safe', 'sighting', 2, 5, 4, [
    ...nightTraderChoices(),
    contextualChoice('sleep', 'eventText096', outcome(1, 'eventText250', {}, 'trader-refuse')),
  ]),
  event('handyman', 'night', 'eventText057', 'dangerous', 'repair', 2, 20, 5, [
    contextualChoice('sleep', 'eventText063', outcome(1, 'eventText264', {}, 'handyman-sleep')),
    ...HANDYMAN_ITEM_IDS.map((id) => choice(id, 'tradeOffer', id,
      outcome(1, 'tradeCompleted', {}, 'handyman-reward'))),
    contextualChoice('touch', 'eventText109', outcome(1, 'eventText263',
      effects([subtract('hull', { min: 30, max: 60 }), subtract('health', 60)]), 'handyman-touch')),
  ], undefined, { minimumPressure: 2 }),
  event('other-people', 'night', 'eventText058', 'safe', 'sighting', 2, 15, 2, [
    choice('radio', 'peopleRadioChoice', 'radio', outcome(
      1, 'peopleRadioResult', {
        ...effects([add('rescueLead', 5)]),
        nextDawnEnergyReduction: 1,
      }, 'people-signaled',
    )),
    choice('flareGun', 'eventText070', 'flareGun', outcome(
      1,
      'eventText265',
      effects([add('rescueLead', 6)], [consume('flareGun')]),
      'people-signaled',
    )),
    choice('flashlight', 'eventText071', 'flashlight', outcome(
      1,
      'eventText266',
      effects([add('rescueLead', 4)]),
      'people-signaled',
    )),
    contextualChoice('sleep', 'eventText110', outcome(
      1,
      'eventText267',
      {},
      'people-pass',
    )),
  ], undefined, { minimumRescueLead: 2, maximumAppearances: 2 }),
  event('ghost-ship', 'night', 'ghostShipTitle', 'dangerous', 'sighting', 1, 8, 8, [
    choice('spyglass', 'eventText067', 'spyglass', outcome(1, 'ghostShipPassed', {}, 'ghost-ship-pass')),
    choice('flashlight', 'ghostShipLightChoice', 'flashlight', outcome(
      1, 'ghostShipSignaled', effects([subtract('health', 20), add('pressure', 1)]),
      'ghost-ship-signaled',
    )),
    choice('flareGun', 'ghostShipFlareChoice', 'flareGun', outcome(
      1, 'ghostShipSignaled', effects([subtract('health', 20), add('pressure', 1)], [consume('flareGun')]),
      'ghost-ship-signaled',
    )),
    choice('shotgun', 'ghostShipShotgunChoice', 'shotgun', outcome(
      1, 'ghostShipSignaled', effects([subtract('health', 20), add('pressure', 1)], [consume('shotgun')]),
      'ghost-ship-signaled',
    )),
    contextualChoice('sleep', 'ghostShipSilentChoice', outcome(1, 'ghostShipPassed', {}, 'ghost-ship-pass')),
  ], undefined, { minimumPressure: 1, maximumAppearances: 2 }),
  event('plane', 'night', 'eventText059', 'safe', 'sighting', 2, 15, 2, [
    choice('flareGun', 'eventText070', 'flareGun', outcome(
      1,
      'eventText268',
      effects([add('rescueLead', 4)], [consume('flareGun')]),
      'plane-signaled',
    )),
    { ...choice('flashlight', 'eventText071', 'flashlight', outcome(
      1,
      'eventText269',
      effects([add('rescueLead', 2)]),
      'plane-signaled',
    )), breakChance: 0.05 },
    contextualChoice('sleep', 'eventText110', outcome(
      1,
      'eventText270',
      {},
      'plane-pass',
    )),
  ], undefined, { minimumRescueLead: 2, maximumAppearances: 2 }),
  event('flying-saucer', 'night', 'ufoTitle', 'dangerous', 'sighting', 1, 8, 15, [
    choice('flareGun', 'eventText070', 'flareGun', outcome(
      1, 'ufoTaken', { ending: 'abduction', items: [consume('flareGun')] }, 'ufo-abduction',
    )),
    choice('flashlight', 'eventText071', 'flashlight', outcome(
      1, 'ufoTaken', { ending: 'abduction' }, 'ufo-abduction',
    )),
    contextualChoice('sleep', 'ufoIgnore', outcome(1, 'ufoPassed', {}, 'ufo-pass')),
  ], undefined, { maximumAppearances: 1 }),
  event('lighthouse', 'night', 'lighthouseTitle', 'safe', 'sighting', 2, 15, 2, [
    choice('flareGun', 'eventText070', 'flareGun', outcome(
      1, 'lighthouseFlare', effects([add('rescueLead', 4)], [consume('flareGun')]),
      'lighthouse-flare',
    )),
    choice('flashlight', 'eventText071', 'flashlight', outcome(
      1, 'lighthouseFlashlight', effects([add('rescueLead', 2)]),
      'lighthouse-flashlight',
    )),
    choice('shotgun', 'eventText069', 'shotgun', outcome(
      1, 'lighthouseShotgun', effects([add('rescueLead', 1)], [consume('shotgun')]),
      'lighthouse-shotgun',
    )),
    contextualChoice('sleep', 'eventText110', outcome(
      1, 'lighthouseSleep', {}, 'lighthouse-sleep',
    )),
  ], undefined, { minimumRescueLead: 2, maximumAppearances: 2 }),
  event('something-under-us', 'night', 'underUsTitle', 'uncertain', 'darkness', 2, 8, 7, [
    choice('cannedFood', 'underUsFoodChoice', 'cannedFood',
      outcome(1, 'underUsFoodResult', effects([subtract('food', 1)]), 'under-us-diverted')),
    choice('baitTin', 'underUsBaitChoice', 'baitTin',
      outcome(1, 'underUsBaitResult', effects([subtract('bait', 1)]), 'under-us-diverted')),
    choice('flashlight', 'underUsLightChoice', 'flashlight',
      outcome(1, 'underUsLightResult', effects([subtract('hull', 20)]), 'under-us-impact')),
    contextualChoice('sleep', 'underUsStillChoice',
      outcome(1, 'underUsStillResult', { nextDawnEnergyReduction: 1 }, 'under-us-waited')),
  ], undefined, { minimumPressure: 1, maximumAppearances: 2 }),
  {
    ...event('starry-night', 'night', 'starryNightTitle', 'safe', 'sighting', 1, 3, 14, [
      contextualChoice('wish', 'starryNightWish',
        outcome(1, 'starryNightRestored', { restoreCrew: true }, 'starry-night-miracle')),
      contextualChoice('sleep', 'eventText063',
        outcome(1, 'starryNightSlept', {}, 'starry-night-sleep')),
    ]),
    weather: ['calm'],
  },
  event('quiet-night', 'night', 'eventText276', 'safe', 'none', 3, 1, 15, [
    contextualChoice('sleep', 'eventText063', outcome(1, 'eventText279')),
  ]),
];

for (const eventDefinition of survivalEvents) {
  localizeEventDefinitionText(eventDefinition);
  registerEventDefinitionText(eventDefinition);
}

export const SURVIVAL_EVENTS: readonly SurvivalEventDefinition[] = deepFreeze(survivalEvents);

export function survivalEventById(id: string, variantSeed?: number): SurvivalEventDefinition | undefined {
  const event = SURVIVAL_EVENTS.find((event) => event.id === id)
    ?? survivalEventFallbackById(id);
  return event?.id === 'night-trader' && variantSeed !== undefined
    ? nightTraderEventForSeed(event, variantSeed)
    : event;
}

import type { ItemId } from '../game/ItemState';
import { survivalEventFallbackById } from './eventSelection';
import type {
  EventChoiceDefinition,
  DawnEnergy,
  DriftingCargoKind,
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
  'dangerous-waters', 'leak', 'school-of-fish', 'snatcher',
  'death-stare', 'swarm-of-anglerfish', 'tornado', 'shower-night',
  'windy-night', 'bad-sleep', 'thunderstorm', 'restless-waves',
  'man-in-the-fog', 'ghosts', 'eerie-melody', 'face-on-the-moon',
  'shadow-figure', 'guarded-sleep',
  'drifting-barrel', 'drifting-chest', 'empty-lifeboat', 'check-the-back',
  'flowers', 'chest-attack', 'midnight-tour', 'night-trader',
  'handyman', 'other-people', 'plane',
] as const);

export type SurvivalEventId = typeof SURVIVAL_EVENT_IDS[number];
export type SignalSightingEventId = Extract<
  SurvivalEventId,
  'other-people' | 'plane'
>;

export const PLANE_CHOICE_WINDOW_SECONDS = 10;

export function isSignalSightingEventId(
  eventId: string,
): eventId is SignalSightingEventId {
  return eventId === 'other-people' || eventId === 'plane';
}

export type DriftingCargoEventId = Extract<
  SurvivalEventId,
  'drifting-barrel' | 'drifting-chest'
>;

export function isDriftingCargoEventId(
  eventId: string,
): eventId is DriftingCargoEventId {
  return eventId === 'drifting-barrel' || eventId === 'drifting-chest';
}

export type DriftingItemEventId = DriftingCargoEventId | Extract<
  SurvivalEventId,
  'empty-lifeboat'
>;

export function isDriftingItemEventId(
  eventId: string,
): eventId is DriftingItemEventId {
  return isDriftingCargoEventId(eventId) || eventId === 'empty-lifeboat';
}

export function driftingItemRetrieveKey(eventId: DriftingCargoEventId): EventPresentationKey {
  return eventId === 'drifting-barrel'
    ? 'drifting-barrel.food'
    : 'drifting-chest.retrieve';
}

export function driftingItemLeaveKey(eventId: DriftingItemEventId): EventPresentationKey {
  if (eventId === 'drifting-barrel') return 'drifting-barrel.drift';
  if (eventId === 'drifting-chest') return 'drifting-chest.drift';
  return 'empty-lifeboat.drift';
}

export function driftingCargoKindForEvent(
  eventId: DriftingCargoEventId,
): DriftingCargoKind {
  return eventId === 'drifting-barrel' ? 'barrel' : 'chest';
}

const EVENT_REVEAL_TEXT: Readonly<Record<SurvivalEventId, string>> = Object.freeze({
  'dangerous-waters': 'Jagged rocks break the surface as the current pulls the boat off course.',
  leak: 'Water pushes through a split in the hull.',
  'school-of-fish': 'A dense school churns the water beside the boat.',
  snatcher: 'A tentacle curls over the gunwale and reaches for one of your supplies.',
  'death-stare': 'A huge shape rises and fixes its gaze on the boat.',
  'swarm-of-anglerfish': 'Cold lights gather beneath the surface and close in.',
  tornado: 'A dark wind funnel spins above the sea.',
  'shower-night': 'Rain starts falling over the exposed boat.',
  'windy-night': 'Wind catches every loose object on the boat.',
  'bad-sleep': 'Uneasy darkness settles over the boat.',
  thunderstorm: 'Thunder rolls as the storm breaks overhead.',
  'restless-waves': 'Waves hammer the sides through the night.',
  'man-in-the-fog': 'A lone figure appears in the fog.',
  ghosts: 'Pale shapes gather around the drifting boat.',
  'eerie-melody': 'A distant melody drifts across the water.',
  'face-on-the-moon': 'A face takes shape across the moon.',
  'shadow-figure': 'A second cat-shaped shadow watches from beyond the lantern light.',
  'guarded-sleep': 'Carlitos sits alert while the night presses close.',
  'drifting-barrel': 'A sealed barrel drifts within reach of the boat.',
  'drifting-chest': 'A small chest drifts within reach of the boat.',
  'empty-lifeboat': 'An empty lifeboat drifts close enough to search.',
  'check-the-back': 'Something thumps against the back of the boat.',
  flowers: 'A small patch of flowers drifts beside the boat.',
  'chest-attack': 'The chest shudders and opens a row of wet teeth.',
  'midnight-tour': 'A low island shape rises from the midnight water.',
  'night-trader': 'A trader waits beside the boat with an open case.',
  handyman: 'A handyman offers to swap whatever you have on hand.',
  'other-people': 'A distant boat carries other people through the dark.',
  plane: 'A small plane crosses the dark horizon.',
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
const gain = (itemId: ItemId): EventInventoryMutation =>
  ({ kind: 'gain', itemId, quantity: 1, fallbackFood: 1 });
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
    | 'requiresLivingCompanion'
  > = {},
): SurvivalEventDefinition {
  return {
    id,
    phase,
    title,
    revealText: EVENT_REVEAL_TEXT[id],
    prompt: 'Choose a response.',
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

export const SURVIVAL_EVENTS: readonly SurvivalEventDefinition[] = deepFreeze([
  event('dangerous-waters', 'night', 'Dangerous Waters', 'dangerous', 'impact', 1, 2, 0, [
    choice('map', 'Use Map', 'map',
      outcome(80, 'The map guides the boat through a clear channel.', dangerousWatersEffects()),
      outcome(20, 'The rocks damage the boat.', dangerousWatersEffects([
        subtract('hull', { min: 5, max: 10 }),
        add('pressure', 1),
      ]))),
    choice('compass', 'Use Compass', 'compass',
      outcome(50, 'The compass holds a safe bearing through the rocks.', dangerousWatersEffects()),
      outcome(50, 'The rocks damage the boat.', dangerousWatersEffects([
        subtract('hull', { min: 5, max: 8 }),
        add('pressure', 1),
      ]))),
    choice('sleep', 'Sleep', undefined,
      outcome(1, 'The rocks damage the boat.', dangerousWatersEffects([
        subtract('hull', { min: 25, max: 45 }),
        add('pressure', 1),
      ]))),
  ], 30, { maximumAppearances: 1 }),
  event('leak', 'night', 'Leak', 'dangerous', 'impact', 1, 4, 0, [
    choice('ductTape', 'Use Duct Tape', 'ductTape', outcome(1, 'The tape is used.', effects(undefined, [consume('ductTape')]))),
    choice('bucket', 'Use Bucket', 'bucket', outcome(80, 'You keep pace with the rising water until dawn.'), outcome(20, 'The boat is damaged.', effects([subtract('hull', { min: 5, max: 10 })], [breakItem('bucket')]))),
    choice('map', 'Use Map', 'map',
      outcome(60, 'The map slows the leak.'),
      outcome(40, 'The map tears while slowing the leak.', effects(undefined, [breakItem('map')]))),
    choice('sleep', 'Sleep', undefined,
      outcome(60, 'The leak damages the boat.', atNextDawn(2, effects([subtract('hull', { min: 15, max: 20 })]))),
      outcome(40, 'The leak damages the boat and takes an item.', effects([subtract('hull', { min: 5, max: 20 })], [loseRandom(1)]))),
  ], undefined, { maximumAppearances: 1 }),
  event('school-of-fish', 'night', 'School of Fish', 'uncertain', 'fish', 4, 8, 39, [
    choice('fishingNet', 'Use Fishing Net', 'fishingNet',
      outcome(60, 'You gain three food.', effects([add('food', 3)])),
      outcome(40, 'You gain two food.', effects([add('food', 2)], [breakItem('fishingNet')]))),
    choice('bucket', 'Use Bucket', 'bucket',
      outcome(50, 'You gain one food.', effects([add('food', 1)])),
      outcome(50, 'The school slips beyond the bucket.', effects(undefined, [breakItem('bucket')]))),
    choice('spyglass', 'Use Binoculars', 'spyglass',
      outcome(50, 'The school passes beyond reach.'), outcome(50, 'You gain one food.', effects([add('food', 1)]))),
    choice('sleep', 'Sleep', undefined, outcome(1, 'The school moves on before dawn.')),
  ], undefined, { minimumPressure: 1 }),
  {
    ...event('snatcher', 'night', 'Tentacle Attack', 'uncertain', 'impact', 3, 8, 45, [
      choice('spyglass', 'Use Binoculars', 'spyglass', outcome(1, 'You keep sight of the tentacle.', effects(undefined, [breakItem('spyglass')]))),
      choice('swimRing', 'Use Swim Ring', 'swimRing', outcome(1, 'The swim ring is lost.', effects(undefined, [lose('swimRing')]))),
      choice('fishingNet', 'Use Fishing Net', 'fishingNet', outcome(1, 'The snatched item is lost.', effects(undefined, [loseEventTarget()]))),
      choice('rope', 'Use Rope', 'rope',
        outcome(80, 'The rope holds the snatched supply against the gunwale.'),
        outcome(20, 'The rope snaps and the snatched supply is lost.', effects(undefined, [
          breakItem('rope'), loseEventTarget(),
        ]))),
      choice('shotgun', 'Use Shotgun', 'shotgun', outcome(1, 'You gain two food.', effects([add('food', 2)], [consume('shotgun')]))),
      choice('sleep', 'Sleep', undefined, outcome(1, 'The snatched item is lost.', effects(undefined, [loseEventTarget()]))),
    ]),
    targetItemIds: [
      'anchor', 'bucket', 'medicalKit', 'flareGun', 'flashlight',
      'map', 'scubaSet', 'umbrella', 'cannedFood',
    ],
  },
  event('death-stare', 'night', 'Death Stare', 'dangerous', 'impact', 1, 9, 32, [
    choice('flashlight', 'Use Flashlight', 'flashlight',
      outcome(80, 'The creature sinks below the beam.'),
      outcome(20, 'The flashlight is lost.', atNextDawn(1, effects(undefined, [lose('flashlight')])))),
    choice('umbrella', 'Use Umbrella', 'umbrella',
      outcome(60, 'The umbrella breaks the creature\'s gaze.'),
      outcome(40, 'The creature attacks.', effects([
        subtract('hull', { min: 44, max: 60 }), subtract('health', 60),
      ], [breakItem('umbrella')]))),
    choice('cannedFood', 'Use Food', 'cannedFood',
      outcome(66, 'You lose two food.', effects([subtract('food', 2)])),
      outcome(33, 'The creature attacks.', effects([subtract('food', 1), subtract('hull', { min: 33, max: 55 }), subtract('health', 50)]))),
    choice('shotgun', 'Use Shotgun', 'shotgun', outcome(1, 'The shotgun is fired.', effects(undefined, [consume('shotgun')]))),
    choice('fishingNet', 'Use Fishing Net', 'fishingNet', outcome(1, 'The creature attacks.', effects([subtract('hull', { min: 55, max: 60 }), subtract('health', 60)], [breakItem('fishingNet')]))),
    choice('sleep', 'Sleep', undefined, outcome(5, 'The shape loses interest and sinks away.'), outcome(85, 'The creature attacks.', effects([subtract('hull', { min: 44, max: 60 }), subtract('health', 60)]))),
  ], undefined, { minimumPressure: 1 }),
  event('swarm-of-anglerfish', 'night', 'Swarm of Anglerfish', 'dangerous', 'fish', 1, 10, 38, [
    choice('fishingNet', 'Use Fishing Net', 'fishingNet',
      outcome(80, 'The net holds the swarm back.'),
      outcome(20, 'The net tears while holding the swarm back.', effects(undefined, [breakItem('fishingNet')]))),
    choice('shotgun', 'Use Shotgun', 'shotgun', outcome(1, 'You gain two food.', effects([add('food', 2)], [consume('shotgun')]))),
    choice('flashlight', 'Use Flashlight', 'flashlight', outcome(1, 'The swarm attacks.', effects([subtract('hull', { min: 20, max: 40 }), subtract('health', 50)]))),
    choice('baitTin', 'Use Bait', 'baitTin', outcome(1, 'You lose two bait.', effects([subtract('bait', 2)]))),
    choice('sleep', 'Sleep', undefined,
      outcome(65, 'The swarm attacks.', effects([subtract('hull', { min: 20, max: 40 }), subtract('health', 50)])), outcome(25, 'The cold lights scatter before reaching the hull.')),
  ], undefined, { minimumPressure: 1 }),
  event('tornado', 'night', 'Tornado', 'dangerous', 'impact', 1, 12, 30, [
    choice('anchor', 'Use Anchor', 'anchor', outcome(90, 'The anchor holds the boat outside the current.'), outcome(10, 'The boat is damaged.', effects([subtract('hull', { min: 5, max: 10 })], [breakItem('anchor')]))),
    choice('swimRing', 'Use Swim Ring', 'swimRing',
      outcome(60, 'The ring pulls the boat outside the strongest current.'),
      outcome(40, 'The boat is damaged.', effects([
        subtract('hull', { min: 20, max: 40 }),
      ], [breakItem('swimRing')]))),
    choice('sleep', 'Sleep', undefined,
      outcome(80, 'The boat is damaged.', atNextDawn(0, effects([subtract('hull', { min: 20, max: 40 })]))),
      outcome(30, 'The boat is badly damaged and one item is lost.', atNextDawn(2, effects([subtract('hull', { min: 50, max: 60 })], [loseRandom(1)])))),
  ], undefined, { minimumPressure: 1 }),
  event('shower-night', 'night', 'Shower Night', 'uncertain', 'storm', 3, 2, 35, [
    choice('bucket', 'Use Bucket', 'bucket', outcome(90, 'The bucket keeps the rain under control.'), outcome(10, 'The bucket keeps the rain under control.', effects(undefined, [breakItem('bucket')]))),
    choice('umbrella', 'Use Umbrella', 'umbrella', outcome(100, 'The umbrella shelters you.'), outcome(50, 'The umbrella shelters you.', effects(undefined, [breakItem('umbrella')]))),
    choice('map', 'Use Map', 'map', outcome(1, 'The map covers the exposed supplies.', effects(undefined, [breakItem('map')]))),
    choice('sleep', 'Sleep', undefined, outcome(80, 'The rain eases before dawn.'), outcome(20, 'You wake with two energy.', atNextDawn(2))),
  ]),
  event('windy-night', 'night', 'Windy Night', 'dangerous', 'storm', 1, 2, 40, [
    choice('fishingNet', 'Use Fishing Net', 'fishingNet',
      outcome(80, 'The net secures the loose supplies.'),
      outcome(20, 'The net tears while securing the loose supplies.', effects(undefined, [breakItem('fishingNet')]))),
    choice('rope', 'Use Rope', 'rope',
      outcome(80, 'The rope secures the loose supplies.'),
      outcome(20, 'The rope snaps while securing the loose supplies.', effects(undefined, [breakItem('rope')]))),
    choice('map', 'Use Map', 'map', outcome(1, 'The map is lost, but you find food.', effects([add('food', 1)], [lose('map')]))),
    choice('umbrella', 'Use Umbrella', 'umbrella',
      outcome(50, 'The umbrella shields the loose supplies.'),
      outcome(50, 'The umbrella is lost.', effects(undefined, [lose('umbrella')]))),
    choice('sleep', 'Sleep', undefined,
      outcome(80, 'The wind batters the boat.', effects([subtract('hull', { min: 10, max: 30 })], [breakRandom(2)])),
      outcome(20, 'The wind batters the boat.', atNextDawn(1, effects([subtract('hull', { min: 10, max: 30 })])))),
  ]),
  event('bad-sleep', 'night', 'Bad Sleep', 'uncertain', 'darkness', 4, 2, 40, [
    choice('bucket', 'Use Bucket', 'bucket', outcome(1, 'The hollow bucket knocks through the night.')),
    choice('flashlight', 'Use Flashlight', 'flashlight', outcome(1, 'The beam finds only empty water.')),
    choice('swimRing', 'Use Swim Ring', 'swimRing', outcome(1, 'The ring drifts against the gunwale.')),
    choice('umbrella', 'Use Umbrella', 'umbrella', outcome(100, 'The umbrella shelters a restless sleep.'), outcome(5, 'A hard gust folds the umbrella during the night.', effects(undefined, [breakItem('umbrella')]))),
    choice('sleep', 'Sleep', undefined, outcome(1, 'You wake with two energy.', atNextDawn(2))),
  ], 10),
  event('thunderstorm', 'night', 'Thunderstorm', 'dangerous', 'storm', 1, 2, 35, [
    choice('anchor', 'Use Anchor', 'anchor', outcome(80, 'The anchor holds through the storm.'), outcome(20, 'You wake with two energy.', atNextDawn(2))),
    choice('bucket', 'Use Bucket', 'bucket',
      outcome(40, 'The boat is damaged.', effects([subtract('hull', { min: 15, max: 25 })], [breakItem('bucket')])),
      outcome(30, 'The boat is damaged.', effects([subtract('hull', { min: 20, max: 30 })])),
      outcome(20, 'A random item is lost.', effects(undefined, [loseRandom(1)])),
      outcome(5, 'A random item is lost.', effects(undefined, [loseRandom(1), breakItem('bucket')]))),
    choice('umbrella', 'Use Umbrella', 'umbrella',
      outcome(60, 'The umbrella sheds the worst rain.'),
      outcome(40, 'The boat is damaged.', effects([
        subtract('hull', { min: 20, max: 30 }),
      ], [breakItem('umbrella')]))),
    choice('sleep', 'Sleep', undefined,
      outcome(60, 'The storm damages the boat and takes an item.', atNextDawn(2, effects([subtract('hull', { min: 30, max: 48 })], [loseRandom(1)]))),
      outcome(30, 'The storm damages the boat.', atNextDawn(2, effects([subtract('hull', { min: 20, max: 35 })])))),
  ]),
  event('restless-waves', 'night', 'Restless Waves', 'dangerous', 'impact', 1, 3, 35, [
    choice('anchor', 'Use Anchor', 'anchor', outcome(1, 'The anchor steadies the boat through the waves.')),
    choice('swimRing', 'Use Swim Ring', 'swimRing',
      outcome(50, 'The swim ring steadies the boat.'),
      outcome(50, 'The waves damage the boat.', effects([
        subtract('hull', { min: 10, max: 20 }),
      ], [breakItem('swimRing')]))),
    choice('sleep', 'Sleep', undefined,
      outcome(50, 'The waves damage the boat.', atNextDawn(1, effects([subtract('hull', { min: 20, max: 30 })]))),
      outcome(50, 'The waves damage the boat and take an item.', effects([subtract('hull', { min: 15, max: 25 })], [loseRandom(1)]))),
  ]),
  event('man-in-the-fog', 'night', 'Man in the Fog', 'dangerous', 'darkness', 1, 6, 40, [
    choice('compass', 'Use Compass', 'compass',
      outcome(1, 'The compass keeps the boat on a steady bearing.',
        effects([subtract('pressure', 1)]))),
    choice('spyglass', 'Use Binoculars', 'spyglass', outcome(1, 'Danger increases.', effects([add('pressure', 1)]))),
    choice('flashlight', 'Use Flashlight', 'flashlight',
      outcome(60, 'The beam drives the figure back into the fog.'),
      outcome(40, 'The figure attacks.', atNextDawn(1, effects([
        add('pressure', 2), subtract('health', 20),
      ])))),
    choice('sleep', 'Sleep', undefined,
      outcome(50, 'The boat is damaged.', effects([add('pressure', 1), subtract('hull', { min: 10, max: 30 })])),
      outcome(50, 'You are injured.', atNextDawn(2, effects([add('pressure', 1), subtract('health', 20)])))),
  ], undefined, { minimumPressure: 1 }),
  event('ghosts', 'night', 'Ghosts', 'uncertain', 'darkness', 3, 8, 38, [
    choice('flareGun', 'Use Flare Gun', 'flareGun',
      outcome(1, 'The flare drives the pale shapes into the dark.',
        effects([subtract('pressure', 1)], [consume('flareGun')]))),
    choice('flashlight', 'Use Flashlight', 'flashlight', outcome(60, 'The beam keeps the pale shapes beyond the gunwale.'), outcome(40, 'You wake with one energy.', atNextDawn(1))),
    choice('sleep', 'Sleep', undefined, outcome(60, 'You wake with two energy.', atNextDawn(2)), outcome(30, 'You wake with one energy.', atNextDawn(1))),
  ], undefined, { minimumPressure: 1 }),
  event('eerie-melody', 'night', 'Eerie Melody', 'dangerous', 'darkness', 1, 13, 30, [
    choice('bucket', 'Use Bucket', 'bucket', outcome(1, 'You wake with one energy.', atNextDawn(1, effects(undefined, [breakItem('bucket')])))),
    choice('spyglass', 'Use Binoculars', 'spyglass', outcome(1, 'The siren attacks.', effects([subtract('hull', { min: 50, max: 60 }), subtract('health', 50)]))),
    choice('umbrella', 'Use Umbrella', 'umbrella',
      outcome(60, 'The umbrella muffles the melody until it fades.'),
      outcome(40, 'The boat is damaged.', atNextDawn(1, effects([
        subtract('hull', { min: 40, max: 60 }),
      ], [breakItem('umbrella')])))),
    choice('ductTape', 'Use Duct Tape', 'ductTape',
      outcome(1, 'The tape blocks the melody until it fades.',
        effects([subtract('pressure', 1)], [consume('ductTape')]))),
    choice('sleep', 'Sleep', undefined,
      outcome(60, 'You wake exhausted.', atNextDawn(0)),
      outcome(40, 'The siren attacks.', atNextDawn(1, effects([subtract('hull', { min: 50, max: 60 }), subtract('health', 50)])))),
  ], undefined, { minimumPressure: 2 }),
  event('face-on-the-moon', 'night', 'Face on the Moon', 'uncertain', 'darkness', 1, 17, 50, [
    choice('umbrella', 'Use Umbrella', 'umbrella', outcome(1, 'You wake with two energy.', atNextDawn(2))),
    choice('spyglass', 'Use Binoculars', 'spyglass',
      outcome(60, 'You wake with one energy.', atNextDawn(1, effects(undefined, [breakItem('spyglass')]))),
      outcome(40, 'Danger increases.', effects([add('pressure', 1)]))),
    choice('sleep', 'Sleep', undefined,
      outcome(100, 'You wake exhausted.', atNextDawn(0)),
      outcome(20, 'You wake with two energy.', atNextDawn(2))),
  ], undefined, { minimumPressure: 3 }),
  event('shadow-figure', 'night', 'Shadow Figure', 'dangerous', 'darkness', 1, 20, 30, [
    choice('flashlight', 'Use Flashlight', 'flashlight',
      outcome(50, 'The false shape remains beyond the light.', effects([add('pressure', 1)])),
      outcome(50, 'The false shape claws you before retreating.', effects([subtract('health', 50)]))),
    choice('flareGun', 'Use Flare Gun', 'flareGun', outcome(
      1,
      'The false shape claws you before retreating.',
      effects([subtract('health', 50)], [consume('flareGun')]),
    )),
    contextualChoice('sleep', 'Sleep', outcome(1, 'The shadow leaves before dawn.')),
  ], undefined, { minimumPressure: 3, requiresLivingCompanion: true }),
  event('guarded-sleep', 'night', 'Guarded Sleep', 'uncertain', 'darkness', 4, 7, 4, [
    contextualChoice('watch', 'Let Carlitos Watch',
      outcome(85, 'Carlitos keeps the night peaceful.'),
      outcome(15, 'Something slips past his watch.', { followUpNight: true })),
    contextualChoice('sleep', 'Sleep Normally', outcome(
      1,
      'The normal night continues.',
      { followUpNight: true },
    )),
  ], undefined, { requiresLivingCompanion: true }),
  event('drifting-barrel', 'day', 'Drifting Barrel', 'safe', 'fish', 1, 3, 3, [
    {
      ...contextualChoice('retrieve', 'Retrieve It',
        featuredOutcome('drifting-barrel.food', 45, 'You recover two food.', effects([subtract('energy', 3), add('food', 2)])),
        featuredOutcome('drifting-barrel.bait', 25, 'You recover two bait.', effects([subtract('energy', 3), add('bait', 2)])),
        featuredOutcome('drifting-barrel.repair', 20, 'You recover repair timber.', effects([subtract('energy', 3), add('repairMaterial', 2)])),
        featuredOutcome('drifting-barrel.energy-bar', 10, 'You recover an energy bar.', effects([subtract('energy', 3)], [gain('energyBar')])),
      ),
      requirements: [{ resource: 'energy', minimum: 3 }],
    },
    {
      ...contextualChoice('delegate-carlitos', 'Send Carlitos',
        featuredOutcome('drifting-barrel.food', 45, 'Carlitos recovers two food.', effects([add('food', 2)])),
        featuredOutcome('drifting-barrel.bait', 25, 'Carlitos recovers two bait.', effects([add('bait', 2)])),
        featuredOutcome('drifting-barrel.repair', 20, 'Carlitos recovers repair timber.', effects([add('repairMaterial', 2)])),
        featuredOutcome('drifting-barrel.energy-bar', 10, 'Carlitos recovers an energy bar.', effects(undefined, [gain('energyBar')]))),
      companionAction: 'delegateCarlitos',
    },
    contextualChoice('sleep', 'Let It Drift',
      featuredOutcome('drifting-barrel.drift', 1, 'The barrel drifts out of reach.')),
  ]),
  event('drifting-chest', 'day', 'Drifting Chest', 'safe', 'fish', 1, 3, 3, [
    {
      ...contextualChoice('retrieve', 'Retrieve It',
        featuredOutcome(
          'drifting-chest.retrieve',
          1,
          'You recover the closed chest.',
          effects([subtract('energy', 3)], [gainChest()]),
        ),
      ),
      requirements: [{ resource: 'energy', minimum: 3 }],
    },
    {
      ...contextualChoice('delegate-carlitos', 'Send Carlitos',
        featuredOutcome(
          'drifting-chest.retrieve',
          1,
          'Carlitos recovers the closed chest.',
          effects(undefined, [gainChest()]),
        )),
      companionAction: 'delegateCarlitos',
    },
    contextualChoice('sleep', 'Let It Drift',
      featuredOutcome('drifting-chest.drift', 1, 'The chest drifts out of reach.')),
  ], undefined, { allowedChestStates: ['none'] }),
  event('empty-lifeboat', 'day', 'Empty Lifeboat', 'safe', 'sighting', 1, 10, 3, [
    {
      ...contextualChoice('search', 'Search It',
        featuredOutcome(
          'empty-lifeboat.search',
          1,
          'You find one food in the empty lifeboat.',
          effects([subtract('energy', 1), add('food', 1)]),
        ),
        featuredOutcome(
          'empty-lifeboat.search',
          1,
          'You find one bait in the empty lifeboat.',
          effects([subtract('energy', 1), add('bait', 1)]),
        ),
      ),
      requirements: [{ resource: 'energy', minimum: 1 }],
    },
    contextualChoice('sleep', 'Let It Drift',
      featuredOutcome(
        'empty-lifeboat.drift',
        1,
        'The empty lifeboat drifts away.',
      )),
  ]),
  event('check-the-back', 'night', 'Check the Back', 'safe', 'fish', 3, 2, 35, [
    contextualChoice('check', 'Yes',
      {
        ...featuredOutcome('check-the-back.fish', 80, 'A fish has landed aboard.', effects([add('food', 1)])),
        resultId: 'check-the-back.fish',
      },
      {
        ...featuredOutcome('check-the-back.bad', 20, 'An anglerfish strikes from the stern.', effects([subtract('health', 25)])),
        resultId: 'check-the-back.bad',
      },
    ),
    contextualChoice('sleep', 'No',
      featuredOutcome('check-the-back.ignore', 1, 'You leave the sound alone.')),
  ], undefined, { allowedChestStates: ['none'] }),
  event('flowers', 'night', 'Flowers', 'safe', 'sighting', 1, 2, 0, [
    choice('fishingNet', 'Use Fishing Net', 'fishingNet',
      featuredOutcome('flowers.collect', 1, 'You lift the flowers aboard.')),
    choice('bucket', 'Use Bucket', 'bucket',
      featuredOutcome('flowers.collect', 1, 'You gather the flowers in the bucket.')),
    contextualChoice('sleep', 'Let Them Drift',
      featuredOutcome('flowers.drift', 1, 'The flowers drift into the dark.')),
  ], 13, { maximumAppearances: 1 }),
  event('chest-attack', 'night', 'Chest Attack', 'dangerous', 'impact', 1, 1, 0, [
    choice('fishingNet', 'Use Fishing Net', 'fishingNet',
      outcome(1, 'The net binds the chest shut.', { chest: 'close' }, 'chest-bound')),
    contextualChoice('attack', 'Attack',
      outcome(1, 'The chest tears into you before it falls overboard.', {
        resources: [subtract('health', 40)],
        chest: 'destroy',
      }, 'chest-attack')),
  ], undefined, { allowedChestStates: ['mimic'] }),
  event('midnight-tour', 'night', 'Midnight Tour', 'dangerous', 'sighting', 2, 7, 30, [
    contextualChoice('visit', 'Visit the Island',
      outcome(80, 'You find a chest.', {
        ...atNextDawn(2, { resources: [add('pressure', 1)] }),
        items: [gainChest()],
      }, 'tour-chest'),
      outcome(20, 'Something jumps from the palms.', {
        resources: [subtract('health', { min: 25, max: 45 })],
      }, 'tour-attack'),
    ),
    contextualChoice('sleep', 'Sail On', outcome(1, 'The island disappears into the dark.', {}, 'tour-pass')),
  ], 40, { minimumPressure: 1, allowedChestStates: ['none'] }),
  event('night-trader', 'night', 'Night Trader', 'safe', 'sighting', 2, 10, 35, [
    choice('food', 'Offer Food', 'cannedFood', outcome(1, 'The trader gives you duct tape.', effects([subtract('food', 1)], [gain('ductTape')]), 'trader-reward')),
    choice('bait', 'Offer Bait', 'baitTin', outcome(1, 'The trader gives you an energy bar.', effects([subtract('bait', 1)], [gain('energyBar')]), 'trader-reward')),
    choice('map', 'Offer Map', 'map', outcome(1, 'The trader gives you a compass.', effects(undefined, [lose('map'), gain('compass')]), 'trader-reward')),
    choice('umbrella', 'Offer Umbrella', 'umbrella', outcome(1, 'The trader gives you a medkit.', effects(undefined, [lose('umbrella'), gain('medicalKit')]), 'trader-reward')),
    contextualChoice('sleep', 'Refuse', outcome(1, 'The trader rows on into the night.', {}, 'trader-refuse')),
  ]),
  event('handyman', 'night', 'Handyman', 'dangerous', 'repair', 2, 20, 50, [
    choice('spyglass', 'Spyglass for Flashlight', 'spyglass', outcome(1, 'The handyman gives you a flashlight.', effects(undefined, [lose('spyglass'), gain('flashlight')]), 'handyman-reward')),
    choice('flashlight', 'Flashlight for Spyglass', 'flashlight', outcome(1, 'The handyman gives you binoculars.', effects(undefined, [lose('flashlight'), gain('spyglass')]), 'handyman-reward')),
    choice('flareGun', 'Flare Gun for Shotgun', 'flareGun', outcome(1, 'The handyman gives you a shotgun.', effects(undefined, [consume('flareGun'), gain('shotgun')]), 'handyman-reward')),
    choice('shotgun', 'Shotgun for Flare Gun', 'shotgun', outcome(1, 'The handyman gives you a flare gun.', effects(undefined, [consume('shotgun'), gain('flareGun')]), 'handyman-reward')),
    choice('medicalKit', 'Medkit for Scuba Gear', 'medicalKit', outcome(1, 'The handyman gives you scuba gear.', effects(undefined, [consume('medicalKit'), gain('scubaSet')]), 'handyman-reward')),
    choice('fishingNet', 'Fishing Net for Bucket', 'fishingNet', outcome(1, 'The handyman gives you a bucket.', effects(undefined, [lose('fishingNet'), gain('bucket')]), 'handyman-reward')),
    choice('bucket', 'Bucket for Fishing Net', 'bucket', outcome(1, 'The handyman gives you a fishing net.', effects(undefined, [lose('bucket'), gain('fishingNet')]), 'handyman-reward')),
    choice('ductTape', 'Duct Tape for Energy Bar', 'ductTape', outcome(1, 'The handyman gives you an energy bar.', effects(undefined, [consume('ductTape'), gain('energyBar')]), 'handyman-reward')),
    choice('energyBar', 'Energy Bar for Duct Tape', 'energyBar', outcome(1, 'The handyman gives you duct tape.', effects(undefined, [consume('energyBar'), gain('ductTape')]), 'handyman-reward')),
    choice('anchor', 'Anchor for Chest', 'anchor', outcome(1, 'The handyman gives you a chest.', effects(undefined, [lose('anchor'), gainChest()]), 'handyman-reward')),
    {
      ...contextualChoice('chest', 'Chest for Anchor', outcome(1, 'The handyman gives you an anchor.', {
        chest: 'destroy',
        items: [gain('anchor')],
      }, 'handyman-reward')),
      requiredChestState: 'closed',
    },
    contextualChoice('touch', 'Touch the Hand', outcome(
      1,
      'The hand closes around you.',
      effects([subtract('hull', { min: 30, max: 60 }), subtract('health', 60)]), 'handyman-touch',
    )),
    contextualChoice('sleep', 'Sleep', outcome(1, 'The handyman shrugs and drifts away.', {}, 'handyman-sleep')),
  ], undefined, { minimumPressure: 2 }),
  event('other-people', 'night', 'Other People', 'safe', 'sighting', 2, 15, 20, [
    choice('flareGun', 'Use Flare Gun', 'flareGun', outcome(
      1,
      'The distant crew sees your flare.',
      effects([add('rescueLead', 6)], [consume('flareGun')]),
      'people-signaled',
    )),
    choice('flashlight', 'Use Flashlight', 'flashlight', outcome(
      1,
      'The distant crew answers your light.',
      effects([add('rescueLead', 4)]),
      'people-signaled',
    )),
    contextualChoice('sleep', 'Let It Pass', outcome(
      1,
      'You let the other boat pass.',
      {},
      'people-pass',
    )),
  ], undefined, { minimumRescueLead: 2, maximumAppearances: 2 }),
  event('plane', 'night', 'Plane', 'safe', 'sighting', 2, 15, 20, [
    choice('flareGun', 'Use Flare Gun', 'flareGun', outcome(
      1,
      'The plane banks after seeing your flare.',
      effects([add('rescueLead', 4)], [consume('flareGun')]),
      'plane-signaled',
    )),
    choice('flashlight', 'Use Flashlight', 'flashlight', outcome(
      1,
      'The plane answers your light with a wing dip.',
      effects([add('rescueLead', 2)]),
      'plane-signaled',
    )),
    contextualChoice('sleep', 'Let It Pass', outcome(
      1,
      'You let the plane pass into the dark.',
      {},
      'plane-pass',
    )),
  ], undefined, { minimumRescueLead: 2, maximumAppearances: 2 }),
]);

export function survivalEventById(id: string): SurvivalEventDefinition | undefined {
  return SURVIVAL_EVENTS.find((event) => event.id === id)
    ?? survivalEventFallbackById(id);
}

import {
  DAY_ACTION_ONLY_ITEM_IDS,
  ITEM_DEFINITIONS,
  ITEM_IDS,
  type ItemId,
} from '../game/ItemState';
import type {
  EventChoiceDefinition,
  DawnEnergy,
  DriftingCargoKind,
  EventInventoryMutation,
  EventResource,
  IntegerValue,
  PresentationCue,
  RandomSource,
  ResourceEffect,
  RiskLabel,
  EventPresentationKey,
  SurvivalEventDefinition,
  WeatherId,
  WeightedEventOutcome,
} from './survivalTypes';

export const SURVIVAL_EVENT_IDS = Object.freeze([
  'dangerous-waters', 'leak', 'school-of-fish', 'snatcher',
  'death-stare', 'swarm-of-anglerfish', 'tornado', 'shower-night',
  'windy-night', 'bad-sleep', 'thunderstorm', 'restless-waves',
  'man-in-the-fog', 'ghosts', 'eerie-melody', 'face-on-the-moon',
  'sick-companion', 'shadow-figure', 'guarded-sleep',
  'drifting-barrel', 'drifting-chest', 'drifting-bottle', 'check-the-back',
  'flowers', 'chest-attack', 'midnight-tour', 'night-trader',
  'handyman', 'other-people',
] as const);

export type SurvivalEventId = typeof SURVIVAL_EVENT_IDS[number];
export type DriftingCargoEventId = Extract<
  SurvivalEventId,
  'drifting-barrel' | 'drifting-chest'
>;

export function isDriftingCargoEventId(
  eventId: string,
): eventId is DriftingCargoEventId {
  return eventId === 'drifting-barrel' || eventId === 'drifting-chest';
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
  'sick-companion': 'Carlitos lies low and shivers beside the gunwale.',
  'shadow-figure': 'A second cat-shaped shadow watches from beyond the lantern light.',
  'guarded-sleep': 'Carlitos sits alert while the night presses close.',
  'drifting-barrel': 'A sealed barrel drifts within reach of the boat.',
  'drifting-chest': 'A small chest drifts within reach of the boat.',
  'drifting-bottle': 'A sealed bottle bobs against the hull.',
  'check-the-back': 'Something thumps against the back of the boat.',
  flowers: 'A small patch of flowers drifts beside the boat.',
  'chest-attack': 'The chest shudders and opens a row of wet teeth.',
  'midnight-tour': 'A low island shape rises from the midnight water.',
  'night-trader': 'A trader waits beside the boat with an open case.',
  handyman: 'A handyman offers to swap whatever you have on hand.',
  'other-people': 'A distant boat carries other people through the dark.',
});

const resource = (
  resourceName: EventResource,
  operation: ResourceEffect['operation'],
  value: IntegerValue,
): ResourceEffect => ({ resource: resourceName, operation, value });
const add = (name: EventResource, value: IntegerValue) => resource(name, 'add', value);
const subtract = (name: EventResource, value: IntegerValue) => resource(name, 'subtract', value);
const set = (name: EventResource, value: IntegerValue) => resource(name, 'set', value);

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
    | 'maximumAppearances' | 'absentItemIds' | 'minimumRescueProgress'
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
  event('dangerous-waters', 'night', 'Dangerous Waters', 'dangerous', 'impact', 2, 2, 0, [
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
  event('leak', 'night', 'Leak', 'dangerous', 'impact', 2, 4, 0, [
    choice('ductTape', 'Use Duct Tape', 'ductTape', outcome(1, 'The tape is used.', effects(undefined, [consume('ductTape')]))),
    choice('bucket', 'Use Bucket', 'bucket', outcome(80, 'You keep pace with the rising water until dawn.'), outcome(20, 'The boat is damaged.', effects([subtract('hull', { min: 5, max: 10 })], [breakItem('bucket')]))),
    choice('map', 'Use Map', 'map', outcome(1, 'The map slows the leak.', effects(undefined, [breakItem('map')]))),
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
      choice('shotgun', 'Use Shotgun', 'shotgun', outcome(1, 'You gain two food.', effects([add('food', 2)], [consume('shotgun')]))),
      choice('sleep', 'Sleep', undefined, outcome(1, 'The snatched item is lost.', effects(undefined, [loseEventTarget()]))),
    ]),
    targetItemIds: [
      'anchor', 'bucket', 'medicalKit', 'flareGun', 'flashlight',
      'map', 'scubaSet', 'umbrella', 'cannedFood',
    ],
  },
  event('death-stare', 'night', 'Death Stare', 'dangerous', 'impact', 4, 9, 32, [
    choice('flashlight', 'Use Flashlight', 'flashlight',
      outcome(80, 'The creature sinks below the beam.'), outcome(35, 'The flashlight is lost.', atNextDawn(1, effects(undefined, [lose('flashlight')])))),
    choice('umbrella', 'Use Umbrella', 'umbrella',
      outcome(40, 'The umbrella breaks the creature\'s gaze.'), outcome(50, 'The creature attacks.', effects([subtract('hull', { min: 44, max: 66 }), subtract('health', 60)], [breakItem('umbrella')]))),
    choice('cannedFood', 'Use Food', 'cannedFood',
      outcome(66, 'You lose two food.', effects([subtract('food', 2)])),
      outcome(33, 'The creature attacks.', effects([subtract('food', 1), subtract('hull', { min: 33, max: 55 }), subtract('health', 50)]))),
    choice('shotgun', 'Use Shotgun', 'shotgun', outcome(1, 'The shotgun is fired.', effects(undefined, [consume('shotgun')]))),
    choice('fishingNet', 'Use Fishing Net', 'fishingNet', outcome(1, 'The creature attacks.', effects([subtract('hull', { min: 55, max: 66 }), subtract('health', 70)], [breakItem('fishingNet')]))),
    choice('sleep', 'Sleep', undefined, outcome(5, 'The shape loses interest and sinks away.'), outcome(85, 'The creature attacks.', effects([subtract('hull', { min: 44, max: 66 }), subtract('health', 60)]))),
  ], undefined, { minimumPressure: 1 }),
  event('swarm-of-anglerfish', 'night', 'Swarm of Anglerfish', 'dangerous', 'fish', 2, 10, 38, [
    choice('fishingNet', 'Use Fishing Net', 'fishingNet', outcome(1, 'The net holds the swarm back.', effects(undefined, [breakItem('fishingNet')]))),
    choice('shotgun', 'Use Shotgun', 'shotgun', outcome(1, 'You gain two food.', effects([add('food', 2)], [consume('shotgun')]))),
    choice('flashlight', 'Use Flashlight', 'flashlight', outcome(1, 'The swarm attacks.', effects([subtract('hull', { min: 20, max: 40 }), subtract('health', 50)]))),
    choice('baitTin', 'Use Bait', 'baitTin', outcome(1, 'You lose two bait.', effects([subtract('bait', 2)]))),
    choice('sleep', 'Sleep', undefined,
      outcome(65, 'The swarm attacks.', effects([subtract('hull', { min: 20, max: 40 }), subtract('health', 50)])), outcome(25, 'The cold lights scatter before reaching the hull.')),
  ], undefined, { minimumPressure: 1 }),
  event('tornado', 'night', 'Tornado', 'dangerous', 'impact', 1, 12, 30, [
    choice('anchor', 'Use Anchor', 'anchor', outcome(90, 'The anchor holds the boat outside the current.'), outcome(10, 'The boat is damaged.', effects([subtract('hull', { min: 5, max: 10 })], [breakItem('anchor')]))),
    choice('swimRing', 'Use Swim Ring', 'swimRing',
      outcome(50, 'The boat is damaged.', effects([subtract('hull', { min: 20, max: 40 })])),
      outcome(50, 'The boat is damaged.', effects([subtract('hull', { min: 20, max: 40 })], [breakItem('swimRing')]))),
    choice('sleep', 'Sleep', undefined,
      outcome(80, 'The boat is damaged.', atNextDawn(0, effects([subtract('hull', { min: 20, max: 40 })]))),
      outcome(30, 'The boat is badly damaged and two items are lost.', atNextDawn(2, effects([subtract('hull', { min: 60, max: 80 })], [loseRandom(2)])))),
  ], undefined, { minimumPressure: 1 }),
  event('shower-night', 'night', 'Shower Night', 'uncertain', 'storm', 3, 2, 35, [
    choice('bucket', 'Use Bucket', 'bucket', outcome(90, 'The bucket keeps the rain under control.'), outcome(10, 'The bucket keeps the rain under control.', effects(undefined, [breakItem('bucket')]))),
    choice('umbrella', 'Use Umbrella', 'umbrella', outcome(100, 'The umbrella shelters you.'), outcome(50, 'The umbrella shelters you.', effects(undefined, [breakItem('umbrella')]))),
    choice('map', 'Use Map', 'map', outcome(1, 'The map covers the exposed supplies.', effects(undefined, [breakItem('map')]))),
    choice('sleep', 'Sleep', undefined, outcome(80, 'The rain eases before dawn.'), outcome(20, 'You wake with two energy.', atNextDawn(2))),
  ]),
  event('windy-night', 'night', 'Windy Night', 'dangerous', 'storm', 4, 2, 40, [
    choice('fishingNet', 'Use Fishing Net', 'fishingNet', outcome(1, 'The net secures the loose supplies.', effects(undefined, [breakItem('fishingNet')]))),
    choice('map', 'Use Map', 'map', outcome(1, 'The map is lost, but you find food.', effects([add('food', 1)], [lose('map')]))),
    choice('umbrella', 'Use Umbrella', 'umbrella', outcome(60, 'The umbrella is lost.', effects(undefined, [lose('umbrella')])), outcome(40, 'You wake with two energy.', atNextDawn(2))),
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
  event('thunderstorm', 'night', 'Thunderstorm', 'dangerous', 'storm', 4, 2, 35, [
    choice('anchor', 'Use Anchor', 'anchor', outcome(80, 'The anchor holds through the storm.'), outcome(20, 'You wake with two energy.', atNextDawn(2))),
    choice('bucket', 'Use Bucket', 'bucket',
      outcome(40, 'The boat is damaged.', effects([subtract('hull', { min: 15, max: 25 })], [breakItem('bucket')])),
      outcome(30, 'The boat is damaged.', effects([subtract('hull', { min: 20, max: 30 })])),
      outcome(20, 'A random item is lost.', effects(undefined, [loseRandom(1)])),
      outcome(5, 'A random item is lost.', effects(undefined, [loseRandom(1), breakItem('bucket')]))),
    choice('umbrella', 'Use Umbrella', 'umbrella',
      outcome(65, 'The boat is damaged.', effects([subtract('hull', { min: 10, max: 20 })], [breakItem('umbrella')])),
      outcome(35, 'The boat is damaged.', effects([subtract('hull', { min: 20, max: 30 })]))),
    choice('sleep', 'Sleep', undefined,
      outcome(60, 'The storm damages the boat and takes an item.', atNextDawn(2, effects([subtract('hull', { min: 30, max: 48 })], [loseRandom(1)]))),
      outcome(30, 'The storm damages the boat.', atNextDawn(2, effects([subtract('hull', { min: 20, max: 35 })])))),
  ]),
  event('restless-waves', 'night', 'Restless Waves', 'dangerous', 'impact', 3, 3, 35, [
    choice('anchor', 'Use Anchor', 'anchor', outcome(1, 'The anchor steadies the boat through the waves.')),
    choice('swimRing', 'Use Swim Ring', 'swimRing',
      outcome(50, 'The waves damage the boat.', effects([subtract('hull', { min: 10, max: 20 })])),
      outcome(50, 'The swim ring steadies the boat.', effects(undefined, [breakItem('swimRing')]))),
    choice('sleep', 'Sleep', undefined,
      outcome(50, 'The waves damage the boat.', atNextDawn(1, effects([subtract('hull', { min: 20, max: 30 })]))),
      outcome(50, 'The waves damage the boat and take an item.', effects([subtract('hull', { min: 15, max: 25 })], [loseRandom(1)]))),
  ]),
  event('man-in-the-fog', 'night', 'Man in the Fog', 'dangerous', 'darkness', 2, 6, 40, [
    choice('compass', 'Use Compass', 'compass',
      outcome(1, 'The compass keeps the boat on a steady bearing.',
        effects([subtract('pressure', 1)]))),
    choice('spyglass', 'Use Binoculars', 'spyglass', outcome(1, 'Danger increases.', effects([add('pressure', 1)]))),
    choice('flashlight', 'Use Flashlight', 'flashlight',
      outcome(70, 'The figure attacks.', atNextDawn(1, effects([add('pressure', 2), subtract('health', 20)]))),
      outcome(35, 'Danger increases.', effects([add('pressure', 2)]))),
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
  event('eerie-melody', 'night', 'Eerie Melody', 'dangerous', 'darkness', 3, 13, 30, [
    choice('bucket', 'Use Bucket', 'bucket', outcome(1, 'You wake with one energy.', atNextDawn(1, effects(undefined, [breakItem('bucket')])))),
    choice('spyglass', 'Use Binoculars', 'spyglass', outcome(1, 'The siren attacks.', effects([subtract('hull', { min: 50, max: 90 }), subtract('health', 50)]))),
    choice('umbrella', 'Use Umbrella', 'umbrella', outcome(1, 'The boat is damaged.', atNextDawn(1, effects([subtract('hull', { min: 40, max: 60 })])))),
    choice('ductTape', 'Use Duct Tape', 'ductTape',
      outcome(1, 'The tape blocks the melody until it fades.',
        effects([subtract('pressure', 1)], [consume('ductTape')]))),
    choice('sleep', 'Sleep', undefined,
      outcome(60, 'You wake exhausted.', atNextDawn(0)),
      outcome(40, 'The siren attacks.', atNextDawn(1, effects([subtract('hull', { min: 50, max: 90 }), subtract('health', 50)])))),
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
  event('sick-companion', 'night', 'Sick Companion', 'uncertain', 'darkness', 1, 5, 26, [
    choice('medicalKit', 'Use Medkit', 'medicalKit', outcome(
      1,
      'Carlitos recovers.',
      { items: [consume('medicalKit')], companion: [{ kind: 'sickness', operation: 'set', value: 0 }] },
    )),
    choice('energyBar', 'Use Energy Bar', 'energyBar', outcome(
      1,
      'The energy bar is gone, but his condition does not change.',
      { items: [consume('energyBar')] },
    )),
    choice('ductTape', 'Use Duct Tape', 'ductTape',
      outcome(80, 'The tape makes his sickness worse.', {
        items: [consume('ductTape')],
        companion: [{ kind: 'sickness', operation: 'add', value: 1 }],
      }),
      outcome(10, 'The tape changes nothing.', { items: [consume('ductTape')] })),
    contextualChoice('sleep', 'Sleep', outcome(
      1,
      'Carlitos grows sicker through the night.',
      { companion: [{ kind: 'sickness', operation: 'add', value: 2 }] },
    )),
  ], undefined, { requiresLivingCompanion: true }),
  event('shadow-figure', 'night', 'Shadow Figure', 'dangerous', 'darkness', 1, 20, 30, [
    choice('spyglass', 'Use Binoculars', 'spyglass', outcome(
      1,
      'The false shape sharpens in the dark.',
      effects([add('pressure', 1)]),
    )),
    choice('flashlight', 'Use Flashlight', 'flashlight',
      outcome(50, 'The false shape remains beyond the light.', effects([add('pressure', 1)])),
      outcome(50, 'The false shape carries you into the dark.', { endingReason: 'kidnapped' })),
    choice('flareGun', 'Use Flare Gun', 'flareGun', outcome(
      1,
      'The false shape carries you into the dark.',
      { items: [consume('flareGun')], endingReason: 'kidnapped' },
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
        featuredOutcome('drifting-chest.food', 45, 'You recover two food.', effects([subtract('energy', 3), add('food', 2)])),
        featuredOutcome('drifting-chest.bait', 25, 'You recover two bait.', effects([subtract('energy', 3), add('bait', 2)])),
        featuredOutcome('drifting-chest.repair', 20, 'You recover repair timber.', effects([subtract('energy', 3), add('repairMaterial', 2)])),
        featuredOutcome('drifting-chest.energy-bar', 10, 'You recover an energy bar.', effects([subtract('energy', 3)], [gain('energyBar')])),
      ),
      requirements: [{ resource: 'energy', minimum: 3 }],
    },
    {
      ...contextualChoice('delegate-carlitos', 'Send Carlitos',
        featuredOutcome('drifting-chest.food', 45, 'Carlitos recovers two food.', effects([add('food', 2)])),
        featuredOutcome('drifting-chest.bait', 25, 'Carlitos recovers two bait.', effects([add('bait', 2)])),
        featuredOutcome('drifting-chest.repair', 20, 'Carlitos recovers repair timber.', effects([add('repairMaterial', 2)])),
        featuredOutcome('drifting-chest.energy-bar', 10, 'Carlitos recovers an energy bar.', effects(undefined, [gain('energyBar')]))),
      companionAction: 'delegateCarlitos',
    },
    contextualChoice('sleep', 'Let It Drift',
      featuredOutcome('drifting-chest.drift', 1, 'The chest drifts out of reach.')),
  ]),
  event('drifting-bottle', 'day', 'Drifting Bottle', 'safe', 'sighting', 3, 2, 0, [
    {
      ...contextualChoice('retrieve', 'Pick It Up',
        featuredOutcome('drifting-bottle.retrieve', 1, 'You recover the message bottle.', effects(
          [subtract('energy', 1)],
          [gain('bottledPaper')],
        ))),
      requirements: [{ resource: 'energy', minimum: 1 }],
    },
    contextualChoice('sleep', 'Sleep',
      featuredOutcome('drifting-bottle.lost', 1, 'The bottle drifts away.')),
  ], undefined, { absentItemIds: ['bottledPaper'] }),
  event('check-the-back', 'night', 'Check the Back', 'safe', 'fish', 3, 2, 35, [
    contextualChoice('check', 'Yes',
      featuredOutcome('check-the-back.fish', 500, 'A fish has landed aboard.', effects([add('food', 1)])),
      featuredOutcome('check-the-back.empty', 50, 'There is nothing there.'),
    ),
    contextualChoice('sleep', 'No',
      featuredOutcome('check-the-back.ignore', 1, 'You leave the sound alone.')),
  ]),
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
    contextualChoice('sleep', 'Hide',
      outcome(1, 'The chest tears into you before it falls overboard.', {
        resources: [subtract('health', 40)],
        chest: 'destroy',
      }, 'chest-hide')),
  ], undefined, { allowedChestStates: ['mimic'] }),
  event('midnight-tour', 'night', 'Midnight Tour', 'dangerous', 'sighting', 2, 7, 30, [
    contextualChoice('visit', 'Visit the Island',
      outcome(50, 'You find a chest.', {
        ...atNextDawn(2, { resources: [add('pressure', 1)] }),
        items: [gainChest()],
      }, 'tour-chest'),
      outcome(50, 'You find one bait.', {
        resources: [add('bait', 1)],
      }, 'tour-bait'),
      outcome(12, 'Something drops from the rocks.', {
        resources: [subtract('health', 35)],
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
      effects([subtract('hull', { min: 30, max: 60 }), subtract('health', 70)]), 'handyman-touch',
    )),
    contextualChoice('sleep', 'Sleep', outcome(1, 'The handyman shrugs and drifts away.', {}, 'handyman-sleep')),
  ], undefined, { minimumPressure: 2 }),
  event('other-people', 'night', 'Other People', 'safe', 'sighting', 2, 15, 20, [
    choice('flareGun', 'Use Flare Gun', 'flareGun', outcome(1, 'The other boat sees your flare.', { rescue: true, items: [consume('flareGun')] }, 'people-rescue')),
    choice('flashlight', 'Use Flashlight', 'flashlight',
      outcome(40, 'The other boat sees your signal.', { rescue: true }, 'people-rescue'),
      outcome(60, 'The other boat disappears into the dark.', {}, 'people-missed')),
    contextualChoice('sleep', 'Let It Pass', outcome(
      1,
      'You let the other boat pass.',
      {},
      'people-pass',
    )),
  ], undefined, { minimumRescueProgress: 15, maximumAppearances: 2 }),
]);

const EVENT_RESOURCES: readonly EventResource[] = [
  'pressure', 'health', 'hull', 'energy', 'food', 'bait', 'repairMaterial', 'rescueProgress',
];
const ITEM_MUTATIONS = ['consume', 'break', 'lose', 'gain', 'gainChest', 'breakRandom', 'loseRandom', 'loseEventTarget'];

type PlainRecord = Record<PropertyKey, unknown>;

function assertPlainObject(value: unknown, path: string): asserts value is PlainRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${path} must be a plain object`);
  }
}

function printableKey(key: PropertyKey): string {
  return typeof key === 'symbol' ? key.toString() : String(key);
}

function assertExactKeys(
  record: PlainRecord,
  path: string,
  subject: string,
  allowed: readonly string[],
  required: readonly string[] = [],
): void {
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== 'string' || !allowed.includes(key)) {
      throw new Error(`${path} contains unsupported ${subject} key ${printableKey(key)}`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(record, key)) {
      throw new Error(`${path} ${subject} is missing required key ${key}`);
    }
  }
}

function validateIntegerValue(effect: ResourceEffect, path: string): void {
  const value = effect.value;
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || (effect.operation !== 'set' && value === 0)) {
      throw new Error(`${path} has an invalid resource value`);
    }
    return;
  }
  assertPlainObject(value, `${path}.value range`);
  assertExactKeys(value, `${path}.value`, 'range', ['min', 'max'], ['min', 'max']);
  if (!Number.isInteger(value.min) || !Number.isInteger(value.max)
    || value.min < 0 || value.max < value.min
    || (effect.operation !== 'set' && value.min === 0)) {
    throw new Error(`${path} has an invalid range`);
  }
}

function isItemId(value: unknown): value is ItemId {
  return typeof value === 'string' && (ITEM_IDS as readonly string[]).includes(value);
}

function validateMutation(candidate: unknown, path: string): void {
  assertPlainObject(candidate, `${path} mutation`);
  if (!Object.hasOwn(candidate, 'kind')) {
    throw new Error(`${path} mutation is missing required key kind`);
  }
  const kind = candidate.kind;
  if (typeof kind !== 'string' || !ITEM_MUTATIONS.includes(kind)) {
    throw new Error(`${path} has an unknown mutation kind`);
  }
  const itemSpecific = kind === 'consume' || kind === 'break' || kind === 'lose' || kind === 'gain';
  const allowed = kind === 'gain'
    ? ['kind', 'itemId', 'quantity', 'fallbackFood']
    : kind === 'gainChest'
      ? ['kind', 'quantity', 'fallbackFood']
      : itemSpecific ? ['kind', 'itemId', 'quantity'] : ['kind', 'quantity'];
  assertExactKeys(candidate, path, `${kind} mutation`, allowed, allowed);
  const quantity = candidate.quantity;
  if (!Number.isInteger(quantity) || (quantity as number) < 1) {
    throw new Error(`${path} has an invalid quantity`);
  }
  if (kind === 'loseEventTarget') {
    if (quantity !== 1) throw new Error(`${path} has an invalid quantity`);
    return;
  }
  if (kind === 'gainChest') {
    if (quantity !== 1 || candidate.fallbackFood !== 1) {
      throw new Error(`${path} has an invalid gain quantity or fallback food`);
    }
    return;
  }
  if (!itemSpecific) return;
  const itemId = candidate.itemId;
  if (!isItemId(itemId)) throw new Error(`${path} contains unknown item`);
  if (kind === 'gain') {
    if (quantity !== 1 || candidate.fallbackFood !== 1) {
      throw new Error(`${path} has an invalid gain quantity or fallback food`);
    }
    return;
  }
  if (kind === 'break' && !ITEM_DEFINITIONS[itemId].breakable) {
    throw new Error(`${path} cannot break ${itemId} because it is not breakable`);
  }
}

function validateOutcome(
  entry: WeightedEventOutcome,
  path: string,
  phase: SurvivalEventDefinition['phase'],
): void {
  const candidateOutcome: unknown = entry;
  assertPlainObject(candidateOutcome, `${path} outcome`);
  assertExactKeys(
    candidateOutcome,
    path,
    'outcome',
    ['resultId', 'weight', 'message', 'presentationKey', 'minimumPriorAppearances', 'effects'],
    ['weight', 'message', 'effects'],
  );
  const outcomeEntry = candidateOutcome as unknown as WeightedEventOutcome;
  if (outcomeEntry.resultId !== undefined
    && (typeof outcomeEntry.resultId !== 'string' || outcomeEntry.resultId.trim().length === 0)) {
    throw new Error(`${path} result ID is blank`);
  }
  if (!Number.isFinite(outcomeEntry.weight) || outcomeEntry.weight <= 0) throw new Error(`${path} outcome weight is invalid`);
  if (typeof outcomeEntry.message !== 'string' || outcomeEntry.message.trim().length === 0) throw new Error(`${path} message is blank`);
  if (outcomeEntry.presentationKey !== undefined
    && (typeof outcomeEntry.presentationKey !== 'string'
      || outcomeEntry.presentationKey.trim().length === 0)) {
    throw new Error(`${path} presentation key is invalid`);
  }
  if (outcomeEntry.minimumPriorAppearances !== undefined
    && (!Number.isInteger(outcomeEntry.minimumPriorAppearances)
      || outcomeEntry.minimumPriorAppearances < 1)) {
    throw new Error(`${path} minimum prior appearances is invalid`);
  }
  const candidateEffects: unknown = outcomeEntry.effects;
  assertPlainObject(candidateEffects, `${path}.effects`);
  assertExactKeys(
    candidateEffects,
    `${path}.effects`,
    'effect',
    [
      'resources', 'items', 'chest', 'rescue', 'companion',
      'nextDawnEnergy', 'followUpNight', 'endingReason',
    ],
  );
  const hasResources = Object.hasOwn(candidateEffects, 'resources');
  const hasItems = Object.hasOwn(candidateEffects, 'items');
  const hasRescue = Object.hasOwn(candidateEffects, 'rescue');
  const hasChest = Object.hasOwn(candidateEffects, 'chest');
  const hasCompanion = Object.hasOwn(candidateEffects, 'companion');
  const hasNextDawnEnergy = Object.hasOwn(candidateEffects, 'nextDawnEnergy');
  const hasFollowUpNight = Object.hasOwn(candidateEffects, 'followUpNight');
  const hasEndingReason = Object.hasOwn(candidateEffects, 'endingReason');
  const chest = hasChest ? candidateEffects.chest : undefined;
  const resourceEntries = hasResources
    ? candidateEffects.resources
    : undefined;
  const itemEntries = hasItems
    ? candidateEffects.items
    : undefined;
  const rescue = hasRescue
    ? candidateEffects.rescue
    : undefined;
  if (hasResources && !Array.isArray(resourceEntries)) {
    throw new Error(`${path}.resources must be an array`);
  }
  if (hasItems && !Array.isArray(itemEntries)) {
    throw new Error(`${path}.items must be an array`);
  }
  const resources = Array.isArray(resourceEntries) ? resourceEntries : [];
  const items = Array.isArray(itemEntries) ? itemEntries : [];
  for (const [index, candidateEffect] of resources.entries()) {
    const effectPath = `${path}.resources[${index}]`;
    assertPlainObject(candidateEffect, `${effectPath} resource effect`);
    assertExactKeys(
      candidateEffect,
      effectPath,
      'resource effect',
      ['resource', 'operation', 'value'],
      ['resource', 'operation', 'value'],
    );
    const effect = candidateEffect as unknown as ResourceEffect;
    if (!EVENT_RESOURCES.includes(effect.resource)) throw new Error(`${effectPath} contains unknown resource`);
    if (!['add', 'subtract', 'set'].includes(effect.operation)) throw new Error(`${effectPath} has an invalid operation`);
    validateIntegerValue(effect, effectPath);
  }
  if (phase === 'night' && resources.some(
    (candidateEffect) => (candidateEffect as ResourceEffect).resource === 'energy',
  )) {
    throw new Error(`${path} changes immediate energy during a night event`);
  }
  for (const [index, itemEffect] of items.entries()) {
    validateMutation(itemEffect, `${path}.items[${index}]`);
  }
  if (hasRescue && typeof rescue !== 'boolean') {
    throw new Error(`${path}.rescue must be boolean`);
  }
  if (hasChest && !['acquire', 'close', 'destroy'].includes(chest as string)) {
    throw new Error(`${path}.chest has an invalid effect`);
  }
  if (hasCompanion) {
    const companionEffects = candidateEffects.companion;
    if (!Array.isArray(companionEffects) || companionEffects.length === 0) {
      throw new Error(`${path}.companion must be a non-empty array`);
    }
    companionEffects.forEach((candidate, index) => {
      const effectPath = `${path}.companion[${index}]`;
      assertPlainObject(candidate, `${effectPath} companion effect`);
      if (candidate.kind === 'sickness') {
        assertExactKeys(
          candidate,
          effectPath,
          'companion sickness effect',
          ['kind', 'operation', 'value'],
          ['kind', 'operation', 'value'],
        );
        if (candidate.operation !== 'add' && candidate.operation !== 'set') {
          throw new Error(`${effectPath} has an invalid companion sickness operation`);
        }
        if (!Number.isInteger(candidate.value) || (candidate.value as number) < 0) {
          throw new Error(`${effectPath} has an invalid companion sickness value`);
        }
        return;
      }
      throw new Error(`${effectPath} has an unknown companion effect kind`);
    });
  }
  if (hasNextDawnEnergy && (
    !Number.isInteger(candidateEffects.nextDawnEnergy)
    || (candidateEffects.nextDawnEnergy as number) < 0
    || (candidateEffects.nextDawnEnergy as number) > 3
  )) {
    throw new Error(`${path}.nextDawnEnergy must be an integer from zero through three`);
  }
  if (hasFollowUpNight && candidateEffects.followUpNight !== true) {
    throw new Error(`${path}.followUpNight must be true`);
  }
  if (hasEndingReason && candidateEffects.endingReason !== 'kidnapped') {
    throw new Error(`${path}.endingReason must be kidnapped`);
  }
}

export function validateSurvivalEventCatalog(
  catalog: readonly SurvivalEventDefinition[] = SURVIVAL_EVENTS,
): void {
  const eventIds = new Set<string>();
  for (const eventEntry of catalog) {
    if (typeof eventEntry.id !== 'string' || eventEntry.id.trim().length === 0) throw new Error('event ID is blank');
    if (!['safe', 'uncertain', 'dangerous'].includes(eventEntry.danger)) {
      throw new Error(`${eventEntry.id} danger is invalid`);
    }
    if (typeof eventEntry.revealText !== 'string' || eventEntry.revealText.trim().length === 0) {
      throw new Error(`${eventEntry.id} reveal text is blank`);
    }
    if (eventIds.has(eventEntry.id)) throw new Error(`event ID ${eventEntry.id} is duplicated`);
    eventIds.add(eventEntry.id);
    if (!Number.isFinite(eventEntry.weight) || eventEntry.weight <= 0) throw new Error(`${eventEntry.id} event weight is invalid`);
    if (!Number.isInteger(eventEntry.earliestDay) || eventEntry.earliestDay < 0
      || (eventEntry.latestDay !== undefined
        && (!Number.isInteger(eventEntry.latestDay) || eventEntry.latestDay < eventEntry.earliestDay))) {
      throw new Error(`${eventEntry.id} has invalid day bounds`);
    }
    if (!Number.isInteger(eventEntry.cooldownDays) || eventEntry.cooldownDays < 0) {
      throw new Error(`${eventEntry.id} has an invalid cooldown`);
    }
    if (Object.hasOwn(eventEntry, 'requiresLivingCompanion')
      && typeof eventEntry.requiresLivingCompanion !== 'boolean') {
      throw new Error(`${eventEntry.id} living companion requirement must be boolean`);
    }
    if (eventEntry.maximumAppearances !== undefined
      && (!Number.isInteger(eventEntry.maximumAppearances) || eventEntry.maximumAppearances < 1)) {
      throw new Error(`${eventEntry.id} has an invalid maximum appearances`);
    }
    if (eventEntry.absentItemIds !== undefined) {
      if (!Array.isArray(eventEntry.absentItemIds) || eventEntry.absentItemIds.length === 0) {
        throw new Error(`${eventEntry.id} absent item IDs must be a non-empty array`);
      }
      const absentItemIds = new Set<ItemId>();
      for (const itemId of eventEntry.absentItemIds) {
        if (!isItemId(itemId)) throw new Error(`${eventEntry.id} absent item IDs contain an unknown item`);
        if (absentItemIds.has(itemId)) throw new Error(`${eventEntry.id} absent item ID ${itemId} is duplicated`);
        absentItemIds.add(itemId);
      }
    }
    if (eventEntry.minimumRescueProgress !== undefined
      && (!Number.isFinite(eventEntry.minimumRescueProgress)
        || !Number.isInteger(eventEntry.minimumRescueProgress)
        || eventEntry.minimumRescueProgress < 0)) {
      throw new Error(`${eventEntry.id} has an invalid minimum rescue progress`);
    }
    for (const [name, value] of [
      ['minimum', eventEntry.minimumPressure],
      ['maximum', eventEntry.maximumPressure],
    ] as const) {
      if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 4)) {
        throw new Error(`${eventEntry.id} has an invalid ${name} pressure`);
      }
    }
    if (eventEntry.minimumPressure !== undefined
      && eventEntry.maximumPressure !== undefined
      && eventEntry.minimumPressure > eventEntry.maximumPressure) {
      throw new Error(`${eventEntry.id} has inverted pressure bounds`);
    }
    if (eventEntry.allowedChestStates !== undefined
      && (!Array.isArray(eventEntry.allowedChestStates)
        || eventEntry.allowedChestStates.length === 0
        || eventEntry.allowedChestStates.some(
          (state) => !['none', 'closed', 'mimic'].includes(state),
        ))) {
      throw new Error(`${eventEntry.id} allowed chest states are invalid`);
    }
    const candidateTargetItemIds: unknown = eventEntry.targetItemIds;
    if (candidateTargetItemIds !== undefined || Object.hasOwn(eventEntry, 'targetItemIds')) {
      if (!Array.isArray(candidateTargetItemIds)) {
        throw new Error(`${eventEntry.id} target item IDs must be an array`);
      }
      if (candidateTargetItemIds.length === 0) {
        throw new Error(`${eventEntry.id} target item IDs are empty`);
      }
      const targetItemIds = new Set<ItemId>();
      for (const candidateItemId of candidateTargetItemIds) {
        if (!isItemId(candidateItemId)) {
          throw new Error(`${eventEntry.id} target item IDs contain an unknown item`);
        }
        if (targetItemIds.has(candidateItemId)) {
          throw new Error(`${eventEntry.id} target item ID ${candidateItemId} is duplicated`);
        }
        targetItemIds.add(candidateItemId);
      }
    }
    if (!Array.isArray(eventEntry.choices) || eventEntry.choices.length === 0) {
      throw new Error(`${eventEntry.id} choices are empty`);
    }
    const choiceIds = new Set<string>();
    for (const eventChoice of eventEntry.choices) {
      if (typeof eventChoice.id !== 'string' || eventChoice.id.trim().length === 0) throw new Error(`${eventEntry.id} choice ID is blank`);
      if (choiceIds.has(eventChoice.id)) throw new Error(`${eventEntry.id} choice ID ${eventChoice.id} is duplicated`);
      choiceIds.add(eventChoice.id);
      if (eventChoice.itemId !== undefined && !isItemId(eventChoice.itemId)) throw new Error(`${eventEntry.id}.${eventChoice.id} contains unknown item`);
      if (eventChoice.itemId !== undefined
        && DAY_ACTION_ONLY_ITEM_IDS.includes(eventChoice.itemId)) {
        throw new Error(`${eventEntry.id}.${eventChoice.id} uses a day-action-only item`);
      }
      if (Object.hasOwn(eventChoice, 'companionAction')
        && eventChoice.companionAction !== 'delegateCarlitos') {
        throw new Error(`${eventEntry.id}.${eventChoice.id} has an invalid companion action`);
      }
      if (eventChoice.requiredChestState !== undefined
        && !['none', 'closed', 'mimic'].includes(eventChoice.requiredChestState)) {
        throw new Error(`${eventEntry.id}.${eventChoice.id} has an invalid required chest state`);
      }
      if (eventChoice.requirements !== undefined) {
        if (!Array.isArray(eventChoice.requirements)) {
          throw new Error(`${eventEntry.id}.${eventChoice.id} requirements must be an array`);
        }
        const requirementResources = new Set<EventResource>();
        for (const requirement of eventChoice.requirements) {
          if (requirement === null || typeof requirement !== 'object' || Array.isArray(requirement)) {
            throw new Error(`${eventEntry.id}.${eventChoice.id} requirement must be an object`);
          }
          const candidate = requirement as Record<string, unknown>;
          assertExactKeys(candidate, `${eventEntry.id}.${eventChoice.id} requirement`, 'requirement', ['resource', 'minimum'], ['resource', 'minimum']);
          if (!EVENT_RESOURCES.includes(candidate.resource as EventResource)) {
            throw new Error(`${eventEntry.id}.${eventChoice.id} requirement contains unknown resource`);
          }
          if (!Number.isInteger(candidate.minimum) || (candidate.minimum as number) < 0) {
            throw new Error(`${eventEntry.id}.${eventChoice.id} requirement has an invalid minimum`);
          }
          const resource = candidate.resource as EventResource;
          if (requirementResources.has(resource)) {
            throw new Error(`${eventEntry.id}.${eventChoice.id} requirement ${resource} is duplicated`);
          }
          requirementResources.add(resource);
        }
      }
      if (!Array.isArray(eventChoice.outcomes) || eventChoice.outcomes.length === 0) throw new Error(`${eventEntry.id}.${eventChoice.id} outcomes are empty`);
      (eventChoice.outcomes as readonly WeightedEventOutcome[]).forEach(
        (entry, index) => validateOutcome(
          entry,
          `${eventEntry.id}.${eventChoice.id}.outcomes[${index}]`,
          eventEntry.phase,
        ),
      );
    }
  }
  for (const id of SURVIVAL_EVENT_IDS) {
    if (!eventIds.has(id)) throw new Error(`event ${id} is missing`);
  }
  if (eventIds.size !== SURVIVAL_EVENT_IDS.length) {
    throw new Error('event catalog contains an unsupported event');
  }
}

validateSurvivalEventCatalog();

export interface EventEligibility {
  phase: 'day' | 'night';
  day: number;
  weather: WeatherId;
  lastEventId: string | null;
  lastSeenDay: ReadonlyMap<string, number>;
  targetableItemIds: ReadonlySet<ItemId>;
  appearanceCounts: ReadonlyMap<string, number>;
  inventoryItemIds: ReadonlySet<ItemId>;
  rescueProgress: number;
  pressure?: number;
  chestState?: import('./survivalTypes').ChestState;
  hasLivingCompanion?: boolean;
}

export function eligibleEvents(
  catalog: readonly SurvivalEventDefinition[],
  criteria: EventEligibility,
): SurvivalEventDefinition[] {
  return catalog.filter((eventEntry) => {
    if (eventEntry.phase !== criteria.phase || eventEntry.id === criteria.lastEventId) return false;
    if (eventEntry.requiresLivingCompanion === true && criteria.hasLivingCompanion !== true) return false;
    if (criteria.day < eventEntry.earliestDay
      || (eventEntry.latestDay !== undefined && criteria.day > eventEntry.latestDay)) return false;
    if (eventEntry.weather !== undefined && !eventEntry.weather.includes(criteria.weather)) return false;
    if (eventEntry.targetItemIds !== undefined
      && !eventEntry.targetItemIds.some((itemId) => criteria.targetableItemIds.has(itemId))) return false;
    if (eventEntry.maximumAppearances !== undefined
      && (criteria.appearanceCounts.get(eventEntry.id) ?? 0) >= eventEntry.maximumAppearances) return false;
    if (eventEntry.absentItemIds !== undefined
      && eventEntry.absentItemIds.some((itemId) => criteria.inventoryItemIds.has(itemId))) return false;
    if (eventEntry.minimumRescueProgress !== undefined
      && criteria.rescueProgress < eventEntry.minimumRescueProgress) return false;
    const pressure = criteria.pressure ?? 0;
    if (eventEntry.minimumPressure !== undefined && pressure < eventEntry.minimumPressure) return false;
    if (eventEntry.maximumPressure !== undefined && pressure > eventEntry.maximumPressure) return false;
    const chestState = criteria.chestState ?? 'none';
    if (eventEntry.allowedChestStates !== undefined
      && !eventEntry.allowedChestStates.includes(chestState)) return false;
    const lastSeen = criteria.lastSeenDay.get(eventEntry.id);
    return lastSeen === undefined || criteria.day - lastSeen >= eventEntry.cooldownDays;
  });
}

const FALLBACKS: Readonly<Record<'day' | 'night', SurvivalEventDefinition>> = deepFreeze({
  day: {
    id: 'day-calm-fallback', phase: 'day', title: 'Quiet Waters',
    revealText: 'The sea stays calm around the boat.',
    prompt: 'The day passes without incident.', danger: 'safe', cue: 'none',
    weight: 1, earliestDay: 1, cooldownDays: 0,
    choices: [choice('sleep', 'Continue', undefined, outcome(1, 'The day passes quietly.'))],
  },
  night: {
    id: 'night-calm-fallback', phase: 'night', title: 'Quiet Night',
    revealText: 'The dark water drifts past without disturbance.',
    prompt: 'The night passes without incident.', danger: 'safe', cue: 'none',
    weight: 1, earliestDay: 1, cooldownDays: 0,
    choices: [choice('sleep', 'Sleep', undefined, outcome(1, 'The night passes quietly.'))],
  },
});

export function survivalEventById(id: string): SurvivalEventDefinition | undefined {
  return SURVIVAL_EVENTS.find((event) => event.id === id)
    ?? Object.values(FALLBACKS).find((event) => event.id === id);
}

export function drawWeightedEvent(
  pool: readonly SurvivalEventDefinition[],
  random: RandomSource,
  fallbackPhase: 'day' | 'night' = 'day',
): SurvivalEventDefinition {
  if (pool.length === 0) return FALLBACKS[fallbackPhase];
  const totalWeight = pool.reduce((sum, eventEntry) => sum + Math.max(0, eventEntry.weight), 0);
  if (totalWeight <= 0) return pool[0]!;
  const roll = random.next() * totalWeight;
  let boundary = 0;
  for (const eventEntry of pool) {
    boundary += Math.max(0, eventEntry.weight);
    if (roll < boundary) return eventEntry;
  }
  return pool[pool.length - 1]!;
}

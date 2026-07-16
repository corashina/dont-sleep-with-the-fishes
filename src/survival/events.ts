import { ITEM_DEFINITIONS, ITEM_IDS, type ItemId } from '../game/ItemState';
import type {
  EventChoiceDefinition,
  EventInventoryMutation,
  EventResource,
  IntegerValue,
  PresentationCue,
  RandomSource,
  ResourceEffect,
  RiskLabel,
  SurvivalEventDefinition,
  WeatherId,
  WeightedEventOutcome,
} from './survivalTypes';

export const INCLUDED_EVENT_PHASES = Object.freeze({
  'dangerous-waters': 'day', leak: 'day', 'school-of-fish': 'day',
  snatcher: 'day', 'death-stare': 'day', 'swarm-of-anglerfish': 'day',
  whirlpool: 'day', 'shark-men': 'day',
  'shower-night': 'night', 'windy-night': 'night', 'bad-sleep': 'night',
  thunderstorm: 'night', 'restless-waves': 'night', 'man-in-the-fog': 'night',
  ghosts: 'night', 'eerie-melody': 'night', 'face-on-the-moon': 'night',
} as const);

type IncludedEventId = keyof typeof INCLUDED_EVENT_PHASES;

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

function effects(
  resources?: readonly ResourceEffect[],
  items?: readonly EventInventoryMutation[],
): WeightedEventOutcome['effects'] {
  return {
    ...(resources?.length ? { resources } : {}),
    ...(items?.length ? { items } : {}),
  };
}

const outcome = (
  weight: number,
  message: string,
  outcomeEffects: WeightedEventOutcome['effects'] = {},
): WeightedEventOutcome => ({ weight, message, effects: outcomeEffects });

function choice(
  id: string,
  label: string,
  itemId: ItemId | undefined,
  ...outcomes: [WeightedEventOutcome, ...WeightedEventOutcome[]]
): EventChoiceDefinition {
  return { id, label, ...(itemId ? { itemId } : {}), outcomes };
}

function riskForCue(cue: PresentationCue): RiskLabel {
  if (cue === 'fish') return 'safe';
  if (cue === 'impact' || cue === 'storm') return 'dangerous';
  return 'uncertain';
}

function event(
  id: IncludedEventId,
  title: string,
  cue: PresentationCue,
  weight: number,
  earliestDay: number,
  cooldownDays: number,
  choices: [EventChoiceDefinition, ...EventChoiceDefinition[]],
  latestDay?: number,
): SurvivalEventDefinition {
  return {
    id,
    phase: INCLUDED_EVENT_PHASES[id],
    title,
    prompt: 'Choose a response.',
    danger: riskForCue(cue),
    cue,
    weight,
    earliestDay,
    ...(latestDay === undefined ? {} : { latestDay }),
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
  event('dangerous-waters', 'Dangerous Waters', 'impact', 15, 2, 0, [
    choice('map', 'Use Map', 'map',
      outcome(80, 'Nothing happens.'),
      outcome(20, 'The rocks damage the boat.', effects([subtract('hull', { min: 5, max: 10 }), subtract('rescueProgress', 5)]))),
    choice('compass', 'Use Compass', 'compass',
      outcome(50, 'Nothing happens.'),
      outcome(50, 'The rocks damage the boat.', effects([subtract('hull', { min: 5, max: 8 }), subtract('rescueProgress', 5)]))),
    choice('sleep', 'Sleep', undefined,
      outcome(1, 'The rocks damage the boat.', effects([subtract('hull', { min: 25, max: 45 }), subtract('rescueProgress', 5)]))),
  ], 30),
  event('leak', 'Leak', 'impact', 10, 4, 0, [
    choice('ductTape', 'Use Duct Tape', 'ductTape', outcome(1, 'The tape is used.', effects(undefined, [consume('ductTape')]))),
    choice('bucket', 'Use Bucket', 'bucket', outcome(80, 'Nothing happens.'), outcome(20, 'The boat is damaged and the bucket breaks.', effects([subtract('hull', { min: 5, max: 10 })], [breakItem('bucket')]))),
    choice('map', 'Use Map', 'map', outcome(1, 'The map breaks.', effects(undefined, [breakItem('map')]))),
    choice('sleep', 'Sleep', undefined,
      outcome(60, 'The leak damages the boat.', effects([subtract('hull', { min: 15, max: 20 }), set('energy', 2)])),
      outcome(40, 'The leak damages the boat and takes an item.', effects([subtract('hull', { min: 5, max: 20 })], [loseRandom(1)]))),
  ]),
  event('school-of-fish', 'School of Fish', 'fish', 66, 8, 39, [
    choice('fishingNet', 'Use Fishing Net', 'fishingNet',
      outcome(60, 'You gain three food.', effects([add('food', 3)])),
      outcome(40, 'You gain two food and the net breaks.', effects([add('food', 2)], [breakItem('fishingNet')]))),
    choice('bucket', 'Use Bucket', 'bucket',
      outcome(50, 'You gain one food.', effects([add('food', 1)])),
      outcome(50, 'The bucket breaks.', effects(undefined, [breakItem('bucket')]))),
    choice('spyglass', 'Use Spyglass', 'spyglass',
      outcome(50, 'Nothing happens.'), outcome(50, 'You gain one food.', effects([add('food', 1)]))),
    choice('sleep', 'Sleep', undefined, outcome(1, 'Nothing happens.')),
  ]),
  event('snatcher', 'Snatcher', 'impact', 28, 8, 45, [
    choice('spyglass', 'Use Spyglass', 'spyglass', outcome(1, 'The spyglass breaks.', effects(undefined, [breakItem('spyglass')]))),
    choice('swimRing', 'Use Swim Ring', 'swimRing', outcome(1, 'The swim ring is lost.', effects(undefined, [lose('swimRing')]))),
    choice('fishingNet', 'Use Fishing Net', 'fishingNet', outcome(1, 'The snatched item is lost.', effects(undefined, [loseEventTarget()]))),
    choice('harpoonGun', 'Use Harpoon Gun', 'harpoonGun', outcome(1, 'You gain two food.', effects([add('food', 2)], [consume('harpoonGun')]))),
    choice('sleep', 'Sleep', undefined, outcome(1, 'The snatched item is lost.', effects(undefined, [loseEventTarget()]))),
  ]),
  event('death-stare', 'Death Stare', 'impact', 160, 9, 32, [
    choice('flashlight', 'Use Flashlight', 'flashlight',
      outcome(80, 'Nothing happens.'), outcome(35, 'The flashlight is lost.', effects([set('energy', 1)], [lose('flashlight')]))),
    choice('umbrella', 'Use Umbrella', 'umbrella',
      outcome(40, 'Nothing happens.'), outcome(50, 'The creature attacks.', effects([subtract('hull', { min: 44, max: 66 }), subtract('health', 60)], [breakItem('umbrella')]))),
    choice('cannedFood', 'Use Food', 'cannedFood',
      outcome(66, 'You lose two food.', effects([subtract('food', 2)])),
      outcome(33, 'The creature attacks.', effects([subtract('food', 1), subtract('hull', { min: 33, max: 55 }), subtract('health', 50)]))),
    choice('harpoonGun', 'Use Harpoon Gun', 'harpoonGun', outcome(1, 'The harpoon is used.', effects(undefined, [consume('harpoonGun')]))),
    choice('fishingNet', 'Use Fishing Net', 'fishingNet', outcome(1, 'The creature attacks.', effects([subtract('hull', { min: 55, max: 66 }), subtract('health', 70)], [breakItem('fishingNet')]))),
    choice('sleep', 'Sleep', undefined, outcome(5, 'Nothing happens.'), outcome(85, 'The creature attacks.', effects([subtract('hull', { min: 44, max: 66 }), subtract('health', 60)]))),
  ]),
  event('swarm-of-anglerfish', 'Swarm of Anglerfish', 'fish', 12, 10, 38, [
    choice('fishingNet', 'Use Fishing Net', 'fishingNet', outcome(1, 'The fishing net breaks.', effects(undefined, [breakItem('fishingNet')]))),
    choice('harpoonGun', 'Use Harpoon Gun', 'harpoonGun', outcome(1, 'You gain two food.', effects([add('food', 2)], [consume('harpoonGun')]))),
    choice('flashlight', 'Use Flashlight', 'flashlight', outcome(1, 'The swarm attacks.', effects([subtract('hull', { min: 20, max: 40 }), subtract('health', 50)]))),
    choice('baitTin', 'Use Bait', 'baitTin', outcome(1, 'You lose two bait.', effects([subtract('bait', 2)]))),
    choice('sleep', 'Sleep', undefined,
      outcome(65, 'The swarm attacks.', effects([subtract('hull', { min: 20, max: 40 }), subtract('health', 50)])), outcome(25, 'Nothing happens.')),
  ]),
  event('whirlpool', 'Whirlpool', 'impact', 5, 12, 30, [
    choice('anchor', 'Use Anchor', 'anchor', outcome(90, 'Nothing happens.'), outcome(10, 'The boat is damaged and the anchor breaks.', effects([subtract('hull', { min: 5, max: 10 })], [breakItem('anchor')]))),
    choice('swimRing', 'Use Swim Ring', 'swimRing',
      outcome(50, 'The boat is damaged.', effects([subtract('hull', { min: 20, max: 40 })])),
      outcome(50, 'The boat is damaged and the swim ring breaks.', effects([subtract('hull', { min: 20, max: 40 })], [breakItem('swimRing')]))),
    choice('sleep', 'Sleep', undefined,
      outcome(80, 'The boat is damaged.', effects([subtract('hull', { min: 20, max: 40 }), set('energy', 0)])),
      outcome(30, 'The boat is badly damaged and two items are lost.', effects([subtract('hull', { min: 60, max: 80 }), set('energy', 2)], [loseRandom(2)]))),
  ]),
  event('shark-men', 'Shark Men', 'impact', 15, 15, 30, [
    choice('harpoonGun', 'Use Harpoon Gun', 'harpoonGun', outcome(1, 'The harpoon is used.', effects(undefined, [consume('harpoonGun')]))),
    choice('swimRing', 'Use Swim Ring', 'swimRing',
      outcome(85, 'The swim ring is lost.', effects(undefined, [lose('swimRing')])),
      outcome(35, 'The shark men attack.', effects([subtract('hull', { min: 50, max: 70 }), subtract('health', 50)], [breakItem('swimRing')]))),
    choice('scubaSet', 'Use Scuba Gear', 'scubaSet',
      outcome(70, 'You gain four food.', effects([set('energy', 2), add('food', 4)], [breakItem('scubaSet')])),
      outcome(36, 'The shark men attack.', effects([set('energy', 1), subtract('hull', { min: 20, max: 30 }), subtract('health', 80)], [breakItem('scubaSet')]))),
    choice('sleep', 'Sleep', undefined,
      outcome(80, 'The shark men attack.', effects([subtract('hull', { min: 50, max: 70 }), subtract('health', 50)])), outcome(20, 'Nothing happens.')),
  ]),
  event('shower-night', 'Shower Night', 'storm', 35, 2, 35, [
    choice('bucket', 'Use Bucket', 'bucket', outcome(90, 'The bucket keeps the rain under control.'), outcome(10, 'The bucket breaks.', effects(undefined, [breakItem('bucket')]))),
    choice('umbrella', 'Use Umbrella', 'umbrella', outcome(100, 'The umbrella shelters you.'), outcome(50, 'The umbrella breaks.', effects(undefined, [breakItem('umbrella')]))),
    choice('map', 'Use Map', 'map', outcome(1, 'The map breaks.', effects(undefined, [breakItem('map')]))),
    choice('sleep', 'Sleep', undefined, outcome(80, 'Nothing happens.'), outcome(20, 'You wake with two energy.', effects([set('energy', 2)]))),
  ]),
  event('windy-night', 'Windy Night', 'storm', 40, 2, 40, [
    choice('fishingNet', 'Use Fishing Net', 'fishingNet', outcome(1, 'The net breaks.', effects(undefined, [breakItem('fishingNet')]))),
    choice('map', 'Use Map', 'map', outcome(1, 'The map is lost, but you find food.', effects([add('food', 1)], [lose('map')]))),
    choice('umbrella', 'Use Umbrella', 'umbrella', outcome(60, 'The umbrella is lost.', effects(undefined, [lose('umbrella')])), outcome(40, 'You wake with two energy.', effects([set('energy', 2)]))),
    choice('sleep', 'Sleep', undefined,
      outcome(80, 'The wind batters the boat and breaks two items.', effects([subtract('hull', { min: 10, max: 30 })], [breakRandom(2)])),
      outcome(20, 'The wind batters the boat.', effects([subtract('hull', { min: 10, max: 30 }), set('energy', 1)]))),
  ]),
  event('bad-sleep', 'Bad Sleep', 'darkness', 40, 2, 40, [
    choice('bucket', 'Use Bucket', 'bucket', outcome(1, 'Nothing happens.')),
    choice('flashlight', 'Use Flashlight', 'flashlight', outcome(1, 'Nothing happens.')),
    choice('swimRing', 'Use Swim Ring', 'swimRing', outcome(1, 'Nothing happens.')),
    choice('umbrella', 'Use Umbrella', 'umbrella', outcome(100, 'Nothing happens.'), outcome(5, 'The umbrella breaks.', effects(undefined, [breakItem('umbrella')]))),
    choice('sleep', 'Sleep', undefined, outcome(1, 'You wake with two energy.', effects([set('energy', 2)]))),
  ], 10),
  event('thunderstorm', 'Thunderstorm', 'storm', 40, 2, 35, [
    choice('anchor', 'Use Anchor', 'anchor', outcome(80, 'Nothing happens.'), outcome(20, 'You wake with two energy.', effects([set('energy', 2)]))),
    choice('bucket', 'Use Bucket', 'bucket',
      outcome(40, 'The boat and bucket are damaged.', effects([subtract('hull', { min: 15, max: 25 })], [breakItem('bucket')])),
      outcome(30, 'The boat is damaged.', effects([subtract('hull', { min: 20, max: 30 })])),
      outcome(20, 'A random item is lost.', effects(undefined, [loseRandom(1)])),
      outcome(5, 'A random item is lost and the bucket breaks.', effects(undefined, [loseRandom(1), breakItem('bucket')]))),
    choice('umbrella', 'Use Umbrella', 'umbrella',
      outcome(65, 'The boat is damaged and the umbrella breaks.', effects([subtract('hull', { min: 10, max: 20 })], [breakItem('umbrella')])),
      outcome(35, 'The boat is damaged.', effects([subtract('hull', { min: 20, max: 30 })]))),
    choice('sleep', 'Sleep', undefined,
      outcome(60, 'The storm damages the boat and takes an item.', effects([subtract('hull', { min: 30, max: 48 }), set('energy', 2)], [loseRandom(1)])),
      outcome(30, 'The storm damages the boat.', effects([subtract('hull', { min: 20, max: 35 }), set('energy', 2)]))),
  ]),
  event('restless-waves', 'Restless Waves', 'impact', 30, 3, 35, [
    choice('anchor', 'Use Anchor', 'anchor', outcome(1, 'Nothing happens.')),
    choice('swimRing', 'Use Swim Ring', 'swimRing',
      outcome(50, 'The waves damage the boat.', effects([subtract('hull', { min: 10, max: 20 })])),
      outcome(50, 'The swim ring breaks.', effects(undefined, [breakItem('swimRing')]))),
    choice('sleep', 'Sleep', undefined,
      outcome(50, 'The waves damage the boat.', effects([subtract('hull', { min: 20, max: 30 }), set('energy', 1)])),
      outcome(50, 'The waves damage the boat and take an item.', effects([subtract('hull', { min: 15, max: 25 })], [loseRandom(1)]))),
  ]),
  event('man-in-the-fog', 'Man in the Fog', 'darkness', 18, 6, 40, [
    choice('compass', 'Use Compass', 'compass', outcome(1, 'Nothing happens.')),
    choice('spyglass', 'Use Spyglass', 'spyglass', outcome(1, 'Danger increases.', effects([subtract('rescueProgress', 5)]))),
    choice('flashlight', 'Use Flashlight', 'flashlight',
      outcome(70, 'The figure attacks.', effects([subtract('rescueProgress', 10), subtract('health', 20), set('energy', 1)])),
      outcome(35, 'Danger increases.', effects([subtract('rescueProgress', 10)]))),
    choice('sleep', 'Sleep', undefined,
      outcome(50, 'The boat is damaged.', effects([subtract('rescueProgress', 5), subtract('hull', { min: 10, max: 30 })])),
      outcome(50, 'You are injured.', effects([subtract('rescueProgress', 5), subtract('health', 20), set('energy', 2)]))),
  ]),
  event('ghosts', 'Ghosts', 'darkness', 25, 8, 38, [
    choice('flareGun', 'Use Flare Gun', 'flareGun', outcome(1, 'The flare is used.', effects(undefined, [consume('flareGun')]))),
    choice('flashlight', 'Use Flashlight', 'flashlight', outcome(60, 'Nothing happens.'), outcome(40, 'You wake with one energy.', effects([set('energy', 1)]))),
    choice('sleep', 'Sleep', undefined, outcome(60, 'You wake with two energy.', effects([set('energy', 2)])), outcome(30, 'You wake with one energy.', effects([set('energy', 1)]))),
  ]),
  event('eerie-melody', 'Eerie Melody', 'darkness', 19, 13, 30, [
    choice('bucket', 'Use Bucket', 'bucket', outcome(1, 'The bucket breaks.', effects([set('energy', 1)], [breakItem('bucket')]))),
    choice('spyglass', 'Use Spyglass', 'spyglass', outcome(1, 'The siren attacks.', effects([subtract('hull', { min: 50, max: 90 }), subtract('health', 50)]))),
    choice('umbrella', 'Use Umbrella', 'umbrella', outcome(1, 'The boat is damaged.', effects([subtract('hull', { min: 40, max: 60 }), set('energy', 1)]))),
    choice('ductTape', 'Use Duct Tape', 'ductTape', outcome(1, 'The duct tape is used.', effects(undefined, [consume('ductTape')]))),
    choice('sleep', 'Sleep', undefined,
      outcome(60, 'You wake exhausted.', effects([set('energy', 0)])),
      outcome(40, 'The siren attacks.', effects([subtract('hull', { min: 50, max: 90 }), subtract('health', 50), set('energy', 1)]))),
  ]),
  event('face-on-the-moon', 'Face on the Moon', 'darkness', 5, 17, 50, [
    choice('umbrella', 'Use Umbrella', 'umbrella', outcome(1, 'You wake with two energy.', effects([set('energy', 2)]))),
    choice('spyglass', 'Use Spyglass', 'spyglass',
      outcome(60, 'The spyglass breaks.', effects([set('energy', 1)], [breakItem('spyglass')])),
      outcome(40, 'Danger increases.', effects([subtract('rescueProgress', 5)]))),
    choice('sleep', 'Sleep', undefined,
      outcome(100, 'You wake exhausted.', effects([set('energy', 0)])),
      outcome(20, 'You wake with two energy.', effects([set('energy', 2)]))),
  ]),
]);

const EVENT_RESOURCES: readonly EventResource[] = [
  'health', 'hull', 'energy', 'food', 'bait', 'rescueProgress',
];
const ITEM_MUTATIONS = ['consume', 'break', 'lose', 'breakRandom', 'loseRandom', 'loseEventTarget'];

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
  const itemSpecific = kind === 'consume' || kind === 'break' || kind === 'lose';
  const allowed = itemSpecific ? ['kind', 'itemId', 'quantity'] : ['kind', 'quantity'];
  assertExactKeys(candidate, path, `${kind} mutation`, allowed, allowed);
  const quantity = candidate.quantity;
  if (!Number.isInteger(quantity) || (quantity as number) < 1) {
    throw new Error(`${path} has an invalid quantity`);
  }
  if (kind === 'loseEventTarget') {
    if (quantity !== 1) throw new Error(`${path} has an invalid quantity`);
    return;
  }
  if (!itemSpecific) return;
  const itemId = candidate.itemId;
  if (!isItemId(itemId)) throw new Error(`${path} contains unknown item`);
  if (kind === 'break' && !ITEM_DEFINITIONS[itemId].breakable) {
    throw new Error(`${path} cannot break ${itemId} because it is not breakable`);
  }
}

function validateOutcome(entry: WeightedEventOutcome, path: string): void {
  const candidateOutcome: unknown = entry;
  assertPlainObject(candidateOutcome, `${path} outcome`);
  assertExactKeys(
    candidateOutcome,
    path,
    'outcome',
    ['weight', 'message', 'effects'],
    ['weight', 'message', 'effects'],
  );
  const outcomeEntry = candidateOutcome as unknown as WeightedEventOutcome;
  if (!Number.isFinite(outcomeEntry.weight) || outcomeEntry.weight <= 0) throw new Error(`${path} outcome weight is invalid`);
  if (typeof outcomeEntry.message !== 'string' || outcomeEntry.message.trim().length === 0) throw new Error(`${path} message is blank`);
  const candidateEffects: unknown = outcomeEntry.effects;
  assertPlainObject(candidateEffects, `${path}.effects`);
  assertExactKeys(candidateEffects, `${path}.effects`, 'effect', ['resources', 'items', 'rescue']);
  const hasResources = Object.hasOwn(candidateEffects, 'resources');
  const hasItems = Object.hasOwn(candidateEffects, 'items');
  const hasRescue = Object.hasOwn(candidateEffects, 'rescue');
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
  for (const [index, itemEffect] of items.entries()) {
    validateMutation(itemEffect, `${path}.items[${index}]`);
  }
  if (hasRescue && typeof rescue !== 'boolean') {
    throw new Error(`${path}.rescue must be boolean`);
  }
}

export function validateSurvivalEventCatalog(
  catalog: readonly SurvivalEventDefinition[] = SURVIVAL_EVENTS,
): void {
  const eventIds = new Set<string>();
  for (const eventEntry of catalog) {
    if (typeof eventEntry.id !== 'string' || eventEntry.id.trim().length === 0) throw new Error('event ID is blank');
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
    if (!Array.isArray(eventEntry.choices) || eventEntry.choices.length === 0) {
      throw new Error(`${eventEntry.id} choices are empty`);
    }
    const choiceIds = new Set<string>();
    for (const eventChoice of eventEntry.choices) {
      if (typeof eventChoice.id !== 'string' || eventChoice.id.trim().length === 0) throw new Error(`${eventEntry.id} choice ID is blank`);
      if (choiceIds.has(eventChoice.id)) throw new Error(`${eventEntry.id} choice ID ${eventChoice.id} is duplicated`);
      choiceIds.add(eventChoice.id);
      if (eventChoice.itemId !== undefined && !isItemId(eventChoice.itemId)) throw new Error(`${eventEntry.id}.${eventChoice.id} contains unknown item`);
      if (!Array.isArray(eventChoice.outcomes) || eventChoice.outcomes.length === 0) throw new Error(`${eventEntry.id}.${eventChoice.id} outcomes are empty`);
      (eventChoice.outcomes as readonly WeightedEventOutcome[]).forEach(
        (entry, index) => validateOutcome(entry, `${eventEntry.id}.${eventChoice.id}.outcomes[${index}]`),
      );
    }
  }
}

validateSurvivalEventCatalog();

export interface EventEligibility {
  phase: 'day' | 'night';
  day: number;
  weather: WeatherId;
  lastEventId: string | null;
  lastSeenDay: ReadonlyMap<string, number>;
}

export function eligibleEvents(
  catalog: readonly SurvivalEventDefinition[],
  criteria: EventEligibility,
): SurvivalEventDefinition[] {
  return catalog.filter((eventEntry) => {
    if (eventEntry.phase !== criteria.phase || eventEntry.id === criteria.lastEventId) return false;
    if (criteria.day < eventEntry.earliestDay
      || (eventEntry.latestDay !== undefined && criteria.day > eventEntry.latestDay)) return false;
    if (eventEntry.weather !== undefined && !eventEntry.weather.includes(criteria.weather)) return false;
    const lastSeen = criteria.lastSeenDay.get(eventEntry.id);
    return lastSeen === undefined || criteria.day - lastSeen >= eventEntry.cooldownDays;
  });
}

const FALLBACKS: Readonly<Record<'day' | 'night', SurvivalEventDefinition>> = deepFreeze({
  day: {
    id: 'day-calm-fallback', phase: 'day', title: 'Quiet Waters',
    prompt: 'The day passes without incident.', danger: 'safe', cue: 'none',
    weight: 1, earliestDay: 1, cooldownDays: 0,
    choices: [choice('sleep', 'Continue', undefined, outcome(1, 'The day passes quietly.'))],
  },
  night: {
    id: 'night-calm-fallback', phase: 'night', title: 'Quiet Night',
    prompt: 'The night passes without incident.', danger: 'safe', cue: 'none',
    weight: 1, earliestDay: 1, cooldownDays: 0,
    choices: [choice('sleep', 'Sleep', undefined, outcome(1, 'The night passes quietly.'))],
  },
});

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

import { RUNTIME_ITEM_IDS, type RuntimeItemId } from './items';
import { validateRange, validateWeights } from './validate';
import type { IntegerValue } from './types';
import type {
  AutomaticEventDefinition,
  CanonicalEventDefinition,
  ChoiceEventDefinition,
  EventChoiceDefinition,
  EventInventoryMutation,
  EventResource,
  EventRoute,
  PresentationCue,
  ResourceEffect,
  WeightedEventOutcome,
} from '../survival/survivalTypes';

export interface BrokenBoatTrigger {
  resource: 'hull';
  max: 10;
  chancePercentBase: 100;
}

export interface ChestAttackTrigger {
  itemId: 'chest';
  minAgeDays: 2;
}

export type CanonicalCatalogEvent = (ChoiceEventDefinition | AutomaticEventDefinition) & {
  sourceId: 'events';
  selectable: boolean;
  sourceNote?: string;
  normalizationNote?: string;
  trigger?: BrokenBoatTrigger | ChestAttackTrigger;
};

const resource = (
  resourceName: EventResource,
  operation: ResourceEffect['operation'],
  value: IntegerValue,
): ResourceEffect => ({ resource: resourceName, operation, value });
const add = (name: EventResource, value: IntegerValue) => resource(name, 'add', value);
const subtract = (name: EventResource, value: IntegerValue) => resource(name, 'subtract', value);
const set = (name: EventResource, value: IntegerValue) => resource(name, 'set', value);

const mutation = (
  kind: 'consume' | 'break' | 'lose' | 'gain',
  itemId: RuntimeItemId,
  quantity = 1,
): EventInventoryMutation => ({ kind, itemId, quantity });
const consume = (itemId: RuntimeItemId) => mutation('consume', itemId);
const breakItem = (itemId: RuntimeItemId) => mutation('break', itemId);
const lose = (itemId: RuntimeItemId) => mutation('lose', itemId);
const gain = (itemId: RuntimeItemId) => mutation('gain', itemId);
const loseRandom = (quantity: number): EventInventoryMutation => ({ kind: 'loseRandom', quantity });
const breakRandom = (quantity: number): EventInventoryMutation => ({ kind: 'breakRandom', quantity });
const loseEventTarget = (): EventInventoryMutation => ({ kind: 'loseEventTarget', quantity: 1 });

function effects(
  resources?: readonly ResourceEffect[],
  items?: readonly EventInventoryMutation[],
  route?: EventRoute,
  terminal?: 'sunk',
): WeightedEventOutcome['effects'] {
  return {
    ...(resources?.length ? { resources } : {}),
    ...(items?.length ? { items } : {}),
    ...(route ? { route } : {}),
    ...(terminal ? { terminal } : {}),
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
  itemId: RuntimeItemId | 'any' | undefined,
  ...choiceOutcomes: [WeightedEventOutcome, ...WeightedEventOutcome[]]
): EventChoiceDefinition {
  return { id, label, ...(itemId ? { itemId } : {}), outcomes: choiceOutcomes };
}

function tradeChoice(itemId: RuntimeItemId, receive: RuntimeItemId): EventChoiceDefinition {
  return {
    ...choice(
      itemId,
      `Trade ${itemId}`,
      itemId,
      outcome(1, 'The hand accepts the trade.', effects(undefined, [lose(itemId), gain(receive)])),
    ),
    trade: { receive, fallbackFood: 1 },
  };
}

const common = (
  id: string,
  title: string,
  cue: PresentationCue,
  weight: number,
  minDay: number,
  cooldownDays: number,
  dangerMin = 0,
) => ({
  id, phase: 'night' as const, title, prompt: 'Choose a response.', cue,
  weight, minDay, cooldownDays, maxAppearances: 1,
  dangerMin, sourceId: 'events' as const, selectable: true,
});

export const CANONICAL_EVENTS: readonly CanonicalCatalogEvent[] = [
  {
    ...common('peaceful-night', 'Peaceful Night', 'none', 75, 0, 0),
    maxAppearances: 0,
    normalizationNote: 'Synthetic sleep choice normalizes the source no-choice passive event to the ordinary choice schema.',
    choices: [choice('sleep', 'Sleep', undefined, outcome(1, 'The night passes peacefully.'))],
  },
  {
    ...common('shower-night', 'Shower Night', 'storm', 35, 2, 35),
    choices: [
      choice('bucket', 'Use Bucket', 'bucket',
        outcome(90, 'The bucket keeps the rain under control.'),
        outcome(10, 'The bucket breaks.', effects(undefined, [breakItem('bucket')]))),
      choice('umbrella', 'Use Umbrella', 'umbrella',
        outcome(100, 'The umbrella shelters you.'),
        outcome(50, 'The umbrella breaks.', effects(undefined, [breakItem('umbrella')]))),
      choice('map', 'Use Map', 'map', outcome(1, 'The map breaks.', effects(undefined, [breakItem('map')]))),
      choice('sleep', 'Sleep', undefined,
        outcome(80, 'Nothing happens.'), outcome(20, 'You wake with two energy.', effects([set('energy', 2)]))),
    ],
  },
  {
    ...common('windy-night', 'Windy Night', 'storm', 40, 2, 40),
    choices: [
      choice('fishingNet', 'Use Fishing Net', 'fishingNet', outcome(1, 'The net breaks.', effects(undefined, [breakItem('fishingNet')]))),
      choice('map', 'Use Map', 'map', outcome(1, 'The map is lost, but you find food.', effects([add('food', 1)], [lose('map')]))),
      choice('umbrella', 'Use Umbrella', 'umbrella',
        outcome(60, 'The umbrella is lost.', effects(undefined, [lose('umbrella')])),
        outcome(40, 'You wake with two energy.', effects([set('energy', 2)]))),
      choice('sleep', 'Sleep', undefined,
        outcome(80, 'The wind batters the boat and breaks two items.', effects([subtract('hull', { min: 10, max: 30 })], [breakRandom(2)])),
        outcome(20, 'The wind batters the boat.', effects([subtract('hull', { min: 10, max: 30 }), set('energy', 1)]))),
    ],
  },
  {
    ...common('bad-sleep', 'Bad Sleep', 'darkness', 40, 2, 40), maxDay: 10,
    choices: [
      choice('bucket', 'Use Bucket', 'bucket', outcome(1, 'Nothing happens.')),
      choice('flashlight', 'Use Flashlight', 'flashlight', outcome(1, 'Nothing happens.')),
      choice('swimRing', 'Use Swim Ring', 'swimRing', outcome(1, 'Nothing happens.')),
      choice('umbrella', 'Use Umbrella', 'umbrella', outcome(100, 'Nothing happens.'), outcome(5, 'The umbrella breaks.', effects(undefined, [breakItem('umbrella')]))),
      choice('sleep', 'Sleep', undefined, outcome(1, 'You wake with two energy.', effects([set('energy', 2)]))),
    ],
  },
  {
    ...common('thunderstorm', 'Thunderstorm', 'storm', 40, 2, 35),
    choices: [
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
    ],
  },
  {
    ...common('check-the-back', 'Check the Back', 'sighting', 35, 2, 35),
    choices: [
      choice('yes', 'Yes', undefined,
        outcome(500, 'You find a fish.', effects([add('food', 1)])),
        outcome(50, 'You find nothing.'),
        outcome(1, 'A bizarre face stares back at you.')),
      choice('no', 'No', undefined, outcome(1, 'You go back to sleep.')),
    ],
  },
  {
    ...common('dangerous-waters', 'Dangerous Waters', 'impact', 15, 2, 0),
    maxDay: 30, routeWeightBonuses: { right: 25 },
    choices: [
      choice('map', 'Use Map', 'map', outcome(80, 'Nothing happens.'), outcome(20, 'The rocks damage the boat.', effects([subtract('hull', { min: 5, max: 10 }), add('danger', 1)]))),
      choice('compass', 'Use Compass', 'compass', outcome(50, 'Nothing happens.'), outcome(50, 'The rocks damage the boat.', effects([subtract('hull', { min: 5, max: 8 }), add('danger', 1)]))),
      choice('sleep', 'Sleep', undefined, outcome(1, 'The rocks damage the boat.', effects([subtract('hull', { min: 25, max: 45 }), add('danger', 1)]))),
    ],
  },
  {
    ...common('needs-direction', 'Needs Direction', 'sighting', 33, 2, 0), maxDay: 24,
    choices: [
      choice('left', 'Left', undefined, outcome(1, 'You turn left.', effects(undefined, undefined, 'left'))),
      choice('right', 'Right', undefined, outcome(1, 'You turn right.', effects(undefined, undefined, 'right'))),
    ],
  },
  {
    ...common('restless-waves', 'Restless Waves', 'impact', 30, 3, 35),
    choices: [
      choice('anchor', 'Use Anchor', 'anchor', outcome(1, 'Nothing happens.')),
      choice('swimRing', 'Use Swim Ring', 'swimRing',
        outcome(50, 'The waves damage the boat.', effects([subtract('hull', { min: 10, max: 20 })])),
        outcome(50, 'The swim ring breaks.', effects(undefined, [breakItem('swimRing')]))),
      choice('sleep', 'Sleep', undefined,
        outcome(50, 'The waves damage the boat.', effects([subtract('hull', { min: 20, max: 30 }), set('energy', 1)])),
        outcome(50, 'The waves damage the boat and take an item.', effects([subtract('hull', { min: 15, max: 25 })], [loseRandom(1)]))),
    ],
  },
  {
    ...common('leak', 'Leak', 'impact', 10, 4, 0),
    choices: [
      choice('ductTape', 'Use Duct Tape', 'ductTape', outcome(1, 'The tape is used.', effects(undefined, [consume('ductTape')]))),
      choice('bucket', 'Use Bucket', 'bucket', outcome(80, 'Nothing happens.'), outcome(20, 'The boat is damaged and the bucket breaks.', effects([subtract('hull', { min: 5, max: 10 })], [breakItem('bucket')]))),
      choice('map', 'Use Map', 'map', outcome(1, 'The map breaks.', effects(undefined, [breakItem('map')]))),
      choice('sleep', 'Sleep', undefined,
        outcome(60, 'The leak damages the boat.', effects([subtract('hull', { min: 15, max: 20 }), set('energy', 2)])),
        outcome(40, 'The leak damages the boat and takes an item.', effects([subtract('hull', { min: 5, max: 20 })], [loseRandom(1)]))),
    ],
  },
  {
    ...common('man-in-the-fog', 'Man in the Fog', 'darkness', 18, 6, 40, 1),
    choices: [
      choice('compass', 'Use Compass', 'compass', outcome(1, 'Nothing happens.')),
      choice('telescope', 'Use Telescope', 'telescope', outcome(1, 'Danger increases.', effects([add('danger', 1)]))),
      choice('flashlight', 'Use Flashlight', 'flashlight',
        outcome(70, 'The figure attacks.', effects([add('danger', 2), subtract('health', 20), set('energy', 1)])),
        outcome(35, 'Danger increases.', effects([add('danger', 2)]))),
      choice('sleep', 'Sleep', undefined,
        outcome(50, 'The boat is damaged.', effects([add('danger', 1), subtract('hull', { min: 10, max: 30 })])),
        outcome(50, 'You are injured.', effects([add('danger', 1), subtract('health', 20), set('energy', 2)]))),
    ],
  },
  {
    ...common('mystery-chest', 'Mystery Chest', 'sighting', 45, 6, 33, 1), routeWeightBonuses: { right: 5 },
    forbiddenItems: ['chest'],
    choices: [
      choice('yes', 'Yes', undefined,
        outcome(80, 'You recover the chest.', effects(undefined, [gain('chest')])),
        outcome(30, 'The mimic attacks.', effects([subtract('health', 25)]))),
      choice('no', 'No', undefined, outcome(1, 'You go back to sleep.')),
    ],
  },
  {
    ...common('seagull', 'Seagull', 'sighting', 0, 0, 0),
    selectable: false, maxAppearances: 0,
    sourceNote: 'Chance, minimum day, cooldown, and outcome weights are undocumented on the Events page.',
    choices: [
      choice('shoo', 'Shoo the seagull', undefined, outcome(0, 'The seagull is scared away.')),
      choice('cannedFood', 'Give Food', 'cannedFood', outcome(0, 'The seagull eats one food.', effects([subtract('food', 1)]))),
    ],
  },
  {
    ...common('midnight-tour', 'Midnight Tour', 'sighting', 22, 7, 30, 1),
    maxDay: 40, routeWeightBonuses: { right: 8 },
    forbiddenItems: ['chest'],
    choices: [
      choice('yes', 'Yes', undefined,
        outcome(50, 'You recover a chest.', effects([add('danger', 1), set('energy', 2)], [gain('chest')])),
        outcome(50, 'You recover bait.', effects([add('bait', 1)])),
        outcome(12, 'A creature attacks.', effects([subtract('health', 35)]))),
      choice('no', 'No', undefined, outcome(1, 'You go back to sleep.')),
    ],
  },
  {
    ...common('ghosts', 'Ghosts', 'darkness', 25, 8, 38, 1), routeWeightBonuses: { left: 3 },
    choices: [
      choice('flareGun', 'Use Flare Gun', 'flareGun', outcome(1, 'The flare is used.', effects(undefined, [consume('flareGun')]))),
      choice('flashlight', 'Use Flashlight', 'flashlight', outcome(60, 'Nothing happens.'), outcome(40, 'You wake with one energy.', effects([set('energy', 1)]))),
      choice('sleep', 'Sleep', undefined, outcome(60, 'You wake with two energy.', effects([set('energy', 2)])), outcome(30, 'You wake with one energy.', effects([set('energy', 1)]))),
    ],
  },
  {
    ...common('school-of-fish', 'School of Fish', 'fish', 66, 8, 39, 1), routeWeightBonuses: { right: 5 },
    choices: [
      choice('fishingNet', 'Use Fishing Net', 'fishingNet',
        outcome(60, 'You gain three food.', effects([add('food', 3)])),
        outcome(40, 'You gain two food and the net breaks.', effects([add('food', 2)], [breakItem('fishingNet')]))),
      choice('bucket', 'Use Bucket', 'bucket',
        outcome(50, 'You gain one food.', effects([add('food', 1)])),
        outcome(50, 'The bucket breaks.', effects(undefined, [breakItem('bucket')]))),
      choice('telescope', 'Use Telescope', 'telescope',
        outcome(50, 'Nothing happens.'), outcome(50, 'You gain one food.', effects([add('food', 1)]))),
      choice('sleep', 'Sleep', undefined, outcome(1, 'Nothing happens.')),
    ],
  },
  {
    ...common('snatcher', 'Snatcher', 'impact', 28, 8, 45, 1), routeWeightBonuses: { left: 5 },
    requiredAnyAssets: [
      { kind: 'item', itemId: 'anchor' }, { kind: 'item', itemId: 'bucket' },
      { kind: 'item', itemId: 'medicalKit' }, { kind: 'item', itemId: 'flareGun' },
      { kind: 'item', itemId: 'flashlight' }, { kind: 'item', itemId: 'map' },
      { kind: 'item', itemId: 'scubaSet' }, { kind: 'item', itemId: 'umbrella' },
      { kind: 'resource', resource: 'food', min: 1 },
    ],
    choices: [
      choice('telescope', 'Use Telescope', 'telescope', outcome(1, 'The telescope breaks.', effects(undefined, [breakItem('telescope')]))),
      choice('swimRing', 'Use Swim Ring', 'swimRing', outcome(1, 'The swim ring is lost.', effects(undefined, [lose('swimRing')]))),
      choice('fishingNet', 'Use Fishing Net', 'fishingNet', outcome(1, 'The snatched item is lost.', effects(undefined, [loseEventTarget()]))),
      choice('harpoonGun', 'Use Harpoon Gun', 'harpoonGun', outcome(1, 'You gain two food.', effects([add('food', 2)], [consume('harpoonGun')]))),
      choice('sleep', 'Sleep', undefined, outcome(1, 'The snatched item is lost.', effects(undefined, [loseEventTarget()]))),
    ],
  },
  {
    ...common('chest-attack', 'Chest left unopened', 'impact', 0, 0, 0),
    selectable: false, maxAppearances: 0,
    trigger: { itemId: 'chest', minAgeDays: 2 },
    sourceNote: 'Chance, minimum day, cooldown, damage, and outcome weights are undocumented on the Events page.',
    choices: [
      choice('fishingNet', 'Use Fishing Net', 'fishingNet', outcome(0, 'The mimic becomes a regular chest again.')),
      choice('touch', 'Touch the chest', undefined, outcome(0, 'The mimic attacks.')),
      choice('sleep', 'Sleep', undefined, outcome(0, 'The mimic attacks.')),
    ],
  },
  {
    ...common('death-stare', 'Death Stare', 'impact', 160, 9, 32, 1),
    choices: [
      choice('flashlight', 'Use Flashlight', 'flashlight',
        outcome(80, 'Nothing happens.'),
        outcome(35, 'The flashlight is lost.', effects([set('energy', 1)], [lose('flashlight')]))),
      choice('umbrella', 'Use Umbrella', 'umbrella',
        outcome(40, 'Nothing happens.'),
        outcome(50, 'The creature attacks.', effects([subtract('hull', { min: 44, max: 66 }), subtract('health', 60)], [breakItem('umbrella')]))),
      choice('cannedFood', 'Use Food', 'cannedFood',
        outcome(66, 'You lose two food.', effects([subtract('food', 2)])),
        outcome(33, 'The creature attacks.', effects([subtract('food', 1), subtract('hull', { min: 33, max: 55 }), subtract('health', 50)]))),
      choice('harpoonGun', 'Use Harpoon Gun', 'harpoonGun', outcome(1, 'The harpoon is used.', effects(undefined, [consume('harpoonGun')]))),
      choice('fishingNet', 'Use Fishing Net', 'fishingNet', outcome(1, 'The creature attacks.', effects([subtract('hull', { min: 55, max: 66 }), subtract('health', 70)], [breakItem('fishingNet')]))),
      choice('sleep', 'Sleep', undefined,
        outcome(5, 'Nothing happens.'),
        outcome(85, 'The creature attacks.', effects([subtract('hull', { min: 44, max: 66 }), subtract('health', 60)]))),
    ],
  },
  {
    ...common('swarm-of-anglerfish', 'Swarm of Anglerfish', 'fish', 12, 10, 38, 1), routeWeightBonuses: { left: 4 },
    choices: [
      choice('fishingNet', 'Use Fishing Net', 'fishingNet', outcome(1, 'The fishing net breaks.', effects(undefined, [breakItem('fishingNet')]))),
      choice('harpoonGun', 'Use Harpoon Gun', 'harpoonGun', outcome(1, 'You gain two food.', effects([add('food', 2)], [consume('harpoonGun')]))),
      choice('flashlight', 'Use Flashlight', 'flashlight', outcome(1, 'The swarm attacks.', effects([subtract('hull', { min: 20, max: 40 }), subtract('health', 50)]))),
      choice('baitTin', 'Use Bait', 'baitTin', outcome(1, 'You lose two bait.', effects([subtract('bait', 2)]))),
      choice('sleep', 'Sleep', undefined,
        outcome(65, 'The swarm attacks.', effects([subtract('hull', { min: 20, max: 40 }), subtract('health', 50)])),
        outcome(25, 'Nothing happens.')),
    ],
  },
  {
    ...common('whirlpool', 'Whirlpool', 'impact', 5, 12, 30, 1), routeWeightBonuses: { left: 1 },
    choices: [
      choice('anchor', 'Use Anchor', 'anchor', outcome(90, 'Nothing happens.'), outcome(10, 'The boat is damaged and the anchor breaks.', effects([subtract('hull', { min: 5, max: 10 })], [breakItem('anchor')]))),
      choice('swimRing', 'Use Swim Ring', 'swimRing',
        outcome(50, 'The boat is damaged.', effects([subtract('hull', { min: 20, max: 40 })])),
        outcome(50, 'The boat is damaged and the swim ring breaks.', effects([subtract('hull', { min: 20, max: 40 })], [breakItem('swimRing')]))),
      choice('sleep', 'Sleep', undefined,
        outcome(80, 'The boat is damaged.', effects([subtract('hull', { min: 20, max: 40 }), set('energy', 0)])),
        outcome(30, 'The boat is badly damaged and two items are lost.', effects([subtract('hull', { min: 60, max: 80 }), set('energy', 2)], [loseRandom(2)]))),
    ],
  },
  {
    ...common('eerie-melody', 'Eerie Melody', 'darkness', 19, 13, 30, 2), routeWeightBonuses: { right: 7 },
    choices: [
      choice('bucket', 'Use Bucket', 'bucket', outcome(1, 'The bucket breaks.', effects([set('energy', 1)], [breakItem('bucket')]))),
      choice('telescope', 'Use Telescope', 'telescope', outcome(1, 'The siren attacks.', effects([subtract('hull', { min: 50, max: 90 }), subtract('health', 50)]))),
      choice('umbrella', 'Use Umbrella', 'umbrella', outcome(1, 'The boat is damaged.', effects([subtract('hull', { min: 40, max: 60 }), set('energy', 1)]))),
      choice('ductTape', 'Use Duct Tape', 'ductTape', outcome(1, 'The duct tape is used.', effects(undefined, [consume('ductTape')]))),
      choice('sleep', 'Sleep', undefined,
        outcome(60, 'You wake exhausted.', effects([set('energy', 0)])),
        outcome(40, 'The siren attacks.', effects([subtract('hull', { min: 50, max: 90 }), subtract('health', 50), set('energy', 1)]))),
    ],
  },
  {
    ...common('shark-men', 'Shark Men', 'impact', 15, 15, 30, 2), routeWeightBonuses: { left: 5 },
    choices: [
      choice('harpoonGun', 'Use Harpoon Gun', 'harpoonGun', outcome(1, 'The harpoon is used.', effects(undefined, [consume('harpoonGun')]))),
      choice('swimRing', 'Use Swim Ring', 'swimRing',
        outcome(85, 'The swim ring is lost.', effects(undefined, [lose('swimRing')])),
        outcome(35, 'The shark men attack.', effects([subtract('hull', { min: 50, max: 70 }), subtract('health', 50)], [breakItem('swimRing')]))),
      choice('scubaSet', 'Use Scuba Gear', 'scubaSet',
        outcome(70, 'You gain four food.', effects([set('energy', 2), add('food', 4)], [breakItem('scubaSet')])),
        outcome(36, 'The shark men attack.', effects([set('energy', 1), subtract('hull', { min: 20, max: 30 }), subtract('health', 80)], [breakItem('scubaSet')]))),
      choice('sleep', 'Sleep', undefined,
        outcome(80, 'The shark men attack.', effects([subtract('hull', { min: 50, max: 70 }), subtract('health', 50)])),
        outcome(20, 'Nothing happens.')),
    ],
  },
  {
    ...common('face-on-the-moon', 'Face on the Moon', 'darkness', 5, 17, 50, 3), routeWeightBonuses: { left: 1 },
    choices: [
      choice('umbrella', 'Use Umbrella', 'umbrella', outcome(1, 'You wake with two energy.', effects([set('energy', 2)]))),
      choice('telescope', 'Use Telescope', 'telescope',
        outcome(60, 'The telescope breaks.', effects([set('energy', 1)], [breakItem('telescope')])),
        outcome(40, 'Danger increases.', effects([add('danger', 1)]))),
      choice('sleep', 'Sleep', undefined,
        outcome(100, 'You wake exhausted.', effects([set('energy', 0)])),
        outcome(20, 'You wake with two energy.', effects([set('energy', 2)]))),
    ],
  },
  {
    ...common('broken-boat', 'Broken Boat', 'sinking', 0, 0, 0),
    selectable: false, maxAppearances: 0, automatic: true,
    sourceNote: 'This event uses its documented hull threshold roll instead of weighted event selection.',
    trigger: { resource: 'hull', max: 10, chancePercentBase: 100 },
    automaticOutcome: outcome(1, 'The boat collapses beneath you.', effects(undefined, undefined, undefined, 'sunk')),
  },
  {
    ...common('the-handyman', 'The Handyman', 'sighting', 12, 20, 50, 2), routeWeightBonuses: { left: 8 },
    choices: [
      tradeChoice('telescope', 'flashlight'), tradeChoice('flashlight', 'telescope'),
      tradeChoice('flareGun', 'harpoonGun'), tradeChoice('harpoonGun', 'flareGun'),
      tradeChoice('scubaSet', 'medicalKit'), tradeChoice('medicalKit', 'scubaSet'),
      tradeChoice('fishingNet', 'bucket'), tradeChoice('bucket', 'fishingNet'),
      tradeChoice('ductTape', 'energyBar'), tradeChoice('energyBar', 'ductTape'),
      tradeChoice('chest', 'anchor'), tradeChoice('anchor', 'chest'),
      choice('invalid-trade', 'Offer another item', 'any', outcome(1, 'The hand returns food.', effects([add('food', 1)], [loseEventTarget()]))),
      choice('touch', 'Touch the Hand', undefined, outcome(1, 'The hand lashes out.', effects([subtract('hull', { min: 30, max: 60 }), subtract('health', 70)]))),
      choice('sleep', 'Sleep', undefined, outcome(1, 'Nothing happens.')),
    ],
  },
];

export const SURVIVAL_EVENTS = CANONICAL_EVENTS;

export function eventDamageMultiplier(phase: 'day' | 'night', day: number): 1 | 2 {
  return phase === 'night' && day >= 50 ? 2 : 1;
}

function isRuntimeItemId(value: string): value is RuntimeItemId {
  return (RUNTIME_ITEM_IDS as readonly string[]).includes(value);
}

const EVENT_RESOURCES: readonly EventResource[] = [
  'health', 'hull', 'energy', 'food', 'bait', 'danger',
];

function validateOutcome(outcomeEntry: WeightedEventOutcome, path: string): void {
  for (const [index, effect] of (outcomeEntry.effects.resources ?? []).entries()) {
    if (typeof effect.value === 'object') validateRange(effect.value, `${path}.resources[${index}]`);
  }
  for (const itemEffect of outcomeEntry.effects.items ?? []) {
    if ('itemId' in itemEffect && !isRuntimeItemId(itemEffect.itemId)) {
      throw new Error(`${path} contains unknown item ID ${itemEffect.itemId}`);
    }
    if (!Number.isInteger(itemEffect.quantity) || itemEffect.quantity < 1) {
      throw new Error(`${path} contains an invalid item quantity`);
    }
  }
}

export function validateCanonicalEvents(
  catalog: readonly CanonicalEventDefinition[] = CANONICAL_EVENTS,
): void {
  const ids = new Set<string>();
  for (const eventEntry of catalog) {
    if (ids.has(eventEntry.id)) throw new Error(`canonical event ${eventEntry.id} is duplicated`);
    ids.add(eventEntry.id);
    if (!Number.isFinite(eventEntry.weight) || eventEntry.weight < 0) {
      throw new Error(`canonical event ${eventEntry.id} has an invalid weight`);
    }
    for (const itemId of [
      ...(eventEntry.requiredItems ?? []),
      ...(eventEntry.requiredAnyItems ?? []),
      ...(eventEntry.forbiddenItems ?? []),
      ...(eventEntry.requiredAnyAssets ?? [])
        .filter((requirement) => requirement.kind === 'item')
        .map((requirement) => requirement.itemId),
    ]) {
      if (!isRuntimeItemId(itemId)) throw new Error(`${eventEntry.id} contains unknown item ID ${itemId}`);
    }
    for (const requirement of eventEntry.requiredAnyAssets ?? []) {
      if (requirement.kind === 'resource') {
        if (!EVENT_RESOURCES.includes(requirement.resource)) {
          throw new Error(`${eventEntry.id} contains unknown resource ${requirement.resource}`);
        }
        if (!Number.isInteger(requirement.min) || requirement.min < 1) {
          throw new Error(`${eventEntry.id} contains an invalid resource asset minimum`);
        }
      }
    }

    if (eventEntry.automatic) {
      const automaticAtRuntime = eventEntry as AutomaticEventDefinition & { choices?: unknown };
      const triggerAtRuntime = eventEntry as AutomaticEventDefinition & { trigger?: unknown };
      if (eventEntry.selectable !== false) {
        throw new Error(`automatic event ${eventEntry.id} must be non-selectable`);
      }
      if (eventEntry.weight !== 0) {
        throw new Error(`automatic event ${eventEntry.id} must have zero weight`);
      }
      if (automaticAtRuntime.choices !== undefined) {
        throw new Error(`automatic event ${eventEntry.id} must have no choices`);
      }
      if (triggerAtRuntime.trigger === undefined) {
        throw new Error(`automatic event ${eventEntry.id} requires an explicit trigger`);
      }
      const trigger = triggerAtRuntime.trigger as Partial<BrokenBoatTrigger>;
      if (trigger.resource !== 'hull' || trigger.max !== 10 || trigger.chancePercentBase !== 100) {
        throw new Error(`automatic event ${eventEntry.id} requires the documented broken boat trigger`);
      }
      if (!eventEntry.automaticOutcome?.effects.terminal) {
        throw new Error(`automatic event ${eventEntry.id} requires an explicit terminal outcome`);
      }
      validateOutcome(eventEntry.automaticOutcome, `${eventEntry.id}.automaticOutcome`);
      continue;
    }
    if (eventEntry.selectable === false) {
      if (eventEntry.weight !== 0) throw new Error(`non-selectable event ${eventEntry.id} must have zero weight`);
    } else if (eventEntry.weight <= 0) {
      throw new Error(`selectable event ${eventEntry.id} must have positive weight`);
    }
    if (!eventEntry.choices?.length) throw new Error(`canonical event ${eventEntry.id} choices are empty`);
    for (const eventChoice of eventEntry.choices) {
      if (eventChoice.itemId && eventChoice.itemId !== 'any' && !isRuntimeItemId(eventChoice.itemId)) {
        throw new Error(`${eventEntry.id}.${eventChoice.id} contains unknown item ID ${eventChoice.itemId}`);
      }
      if (eventChoice.trade && !isRuntimeItemId(eventChoice.trade.receive)) {
        throw new Error(`${eventEntry.id}.${eventChoice.id} trade contains unknown item ID ${eventChoice.trade.receive}`);
      }
      if (!eventChoice.outcomes.length) throw new Error(`${eventEntry.id}.${eventChoice.id} outcomes are empty`);
      if (eventEntry.selectable !== false) validateWeights(eventChoice.outcomes, `${eventEntry.id}.${eventChoice.id}.outcomes`);
      eventChoice.outcomes.forEach((entry, index) => validateOutcome(entry, `${eventEntry.id}.${eventChoice.id}.outcomes[${index}]`));
    }
  }
}

const moduleEnvironment = (import.meta as ImportMeta & {
  env?: { DEV?: boolean; MODE?: string };
}).env;
if (moduleEnvironment?.DEV || moduleEnvironment?.MODE === 'test') validateCanonicalEvents();

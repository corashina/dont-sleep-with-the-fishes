import { describe, expect, it } from 'vitest';
import type { ItemId } from '../src/game/ItemState';
import {
  INCLUDED_EVENT_PHASES,
  SURVIVAL_EVENTS,
  drawWeightedEvent,
  eligibleEvents,
  validateSurvivalEventCatalog,
} from '../src/survival/events';
import { sequenceRandom } from '../src/survival/random';

const INCLUDED = {
  'dangerous-waters': 'day', leak: 'day', 'school-of-fish': 'day',
  snatcher: 'day', 'death-stare': 'day', 'swarm-of-anglerfish': 'day',
  whirlpool: 'day', 'shark-men': 'day',
  'shower-night': 'night', 'windy-night': 'night', 'bad-sleep': 'night',
  thunderstorm: 'night', 'restless-waves': 'night', 'man-in-the-fog': 'night',
  ghosts: 'night', 'eerie-melody': 'night', 'face-on-the-moon': 'night',
} as const;

const resource = (resourceName: string, operation: string, value: unknown) => ({
  resource: resourceName, operation, value,
});
const add = (name: string, value: unknown) => resource(name, 'add', value);
const subtract = (name: string, value: unknown) => resource(name, 'subtract', value);
const set = (name: string, value: unknown) => resource(name, 'set', value);
const item = (kind: string, itemId: string, quantity = 1) => ({ kind, itemId, quantity });
const randomItem = (kind: string, quantity: number) => ({ kind, quantity });
const target = () => ({ kind: 'loseEventTarget', quantity: 1 });
const outcome = (
  weight: number,
  message: string,
  resources: readonly unknown[] = [],
  items: readonly unknown[] = [],
) => ({
  weight,
  message,
  effects: {
    ...(resources.length ? { resources } : {}),
    ...(items.length ? { items } : {}),
  },
});
const choice = (id: string, label: string, itemId: string | undefined, ...outcomes: unknown[]) => ({
  id, label, ...(itemId ? { itemId } : {}), outcomes,
});

const EXPECTED_METADATA = {
  'dangerous-waters': ['Dangerous Waters', 'impact', 15, 2, 30, 0],
  leak: ['Leak', 'impact', 10, 4, undefined, 0],
  'school-of-fish': ['School of Fish', 'fish', 66, 8, undefined, 39],
  snatcher: ['Snatcher', 'impact', 28, 8, undefined, 45],
  'death-stare': ['Death Stare', 'impact', 160, 9, undefined, 32],
  'swarm-of-anglerfish': ['Swarm of Anglerfish', 'fish', 12, 10, undefined, 38],
  whirlpool: ['Whirlpool', 'impact', 5, 12, undefined, 30],
  'shark-men': ['Shark Men', 'impact', 15, 15, undefined, 30],
  'shower-night': ['Shower Night', 'storm', 35, 2, undefined, 35],
  'windy-night': ['Windy Night', 'storm', 40, 2, undefined, 40],
  'bad-sleep': ['Bad Sleep', 'darkness', 40, 2, 10, 40],
  thunderstorm: ['Thunderstorm', 'storm', 40, 2, undefined, 35],
  'restless-waves': ['Restless Waves', 'impact', 30, 3, undefined, 35],
  'man-in-the-fog': ['Man in the Fog', 'darkness', 18, 6, undefined, 40],
  ghosts: ['Ghosts', 'darkness', 25, 8, undefined, 38],
  'eerie-melody': ['Eerie Melody', 'darkness', 19, 13, undefined, 30],
  'face-on-the-moon': ['Face on the Moon', 'darkness', 5, 17, undefined, 50],
} as const;

const EXPECTED_CHOICES = {
  'dangerous-waters': [
    choice('map', 'Use Map', 'map',
      outcome(80, 'Nothing happens.'),
      outcome(20, 'The rocks damage the boat.', [subtract('hull', { min: 5, max: 10 }), subtract('rescueProgress', 5)])),
    choice('compass', 'Use Compass', 'compass',
      outcome(50, 'Nothing happens.'),
      outcome(50, 'The rocks damage the boat.', [subtract('hull', { min: 5, max: 8 }), subtract('rescueProgress', 5)])),
    choice('sleep', 'Sleep', undefined,
      outcome(1, 'The rocks damage the boat.', [subtract('hull', { min: 25, max: 45 }), subtract('rescueProgress', 5)])),
  ],
  leak: [
    choice('ductTape', 'Use Duct Tape', 'ductTape', outcome(1, 'The tape is used.', [], [item('consume', 'ductTape')])),
    choice('bucket', 'Use Bucket', 'bucket', outcome(80, 'Nothing happens.'), outcome(20, 'The boat is damaged and the bucket breaks.', [subtract('hull', { min: 5, max: 10 })], [item('break', 'bucket')])),
    choice('map', 'Use Map', 'map', outcome(1, 'The map breaks.', [], [item('break', 'map')])),
    choice('sleep', 'Sleep', undefined,
      outcome(60, 'The leak damages the boat.', [subtract('hull', { min: 15, max: 20 }), set('energy', 2)]),
      outcome(40, 'The leak damages the boat and takes an item.', [subtract('hull', { min: 5, max: 20 })], [randomItem('loseRandom', 1)])),
  ],
  'school-of-fish': [
    choice('fishingNet', 'Use Fishing Net', 'fishingNet', outcome(60, 'You gain three food.', [add('food', 3)]), outcome(40, 'You gain two food and the net breaks.', [add('food', 2)], [item('break', 'fishingNet')])),
    choice('bucket', 'Use Bucket', 'bucket', outcome(50, 'You gain one food.', [add('food', 1)]), outcome(50, 'The bucket breaks.', [], [item('break', 'bucket')])),
    choice('spyglass', 'Use Spyglass', 'spyglass', outcome(50, 'Nothing happens.'), outcome(50, 'You gain one food.', [add('food', 1)])),
    choice('sleep', 'Sleep', undefined, outcome(1, 'Nothing happens.')),
  ],
  snatcher: [
    choice('spyglass', 'Use Spyglass', 'spyglass', outcome(1, 'The spyglass breaks.', [], [item('break', 'spyglass')])),
    choice('swimRing', 'Use Swim Ring', 'swimRing', outcome(1, 'The swim ring is lost.', [], [item('lose', 'swimRing')])),
    choice('fishingNet', 'Use Fishing Net', 'fishingNet', outcome(1, 'The snatched item is lost.', [], [target()])),
    choice('harpoonGun', 'Use Harpoon Gun', 'harpoonGun', outcome(1, 'You gain two food.', [add('food', 2)], [item('consume', 'harpoonGun')])),
    choice('sleep', 'Sleep', undefined, outcome(1, 'The snatched item is lost.', [], [target()])),
  ],
  'death-stare': [
    choice('flashlight', 'Use Flashlight', 'flashlight', outcome(80, 'Nothing happens.'), outcome(35, 'The flashlight is lost.', [set('energy', 1)], [item('lose', 'flashlight')])),
    choice('umbrella', 'Use Umbrella', 'umbrella', outcome(40, 'Nothing happens.'), outcome(50, 'The creature attacks.', [subtract('hull', { min: 44, max: 66 }), subtract('health', 60)], [item('break', 'umbrella')])),
    choice('cannedFood', 'Use Food', 'cannedFood', outcome(66, 'You lose two food.', [subtract('food', 2)]), outcome(33, 'The creature attacks.', [subtract('food', 1), subtract('hull', { min: 33, max: 55 }), subtract('health', 50)])),
    choice('harpoonGun', 'Use Harpoon Gun', 'harpoonGun', outcome(1, 'The harpoon is used.', [], [item('consume', 'harpoonGun')])),
    choice('fishingNet', 'Use Fishing Net', 'fishingNet', outcome(1, 'The creature attacks.', [subtract('hull', { min: 55, max: 66 }), subtract('health', 70)], [item('break', 'fishingNet')])),
    choice('sleep', 'Sleep', undefined, outcome(5, 'Nothing happens.'), outcome(85, 'The creature attacks.', [subtract('hull', { min: 44, max: 66 }), subtract('health', 60)])),
  ],
  'swarm-of-anglerfish': [
    choice('fishingNet', 'Use Fishing Net', 'fishingNet', outcome(1, 'The fishing net breaks.', [], [item('break', 'fishingNet')])),
    choice('harpoonGun', 'Use Harpoon Gun', 'harpoonGun', outcome(1, 'You gain two food.', [add('food', 2)], [item('consume', 'harpoonGun')])),
    choice('flashlight', 'Use Flashlight', 'flashlight', outcome(1, 'The swarm attacks.', [subtract('hull', { min: 20, max: 40 }), subtract('health', 50)])),
    choice('baitTin', 'Use Bait', 'baitTin', outcome(1, 'You lose two bait.', [subtract('bait', 2)])),
    choice('sleep', 'Sleep', undefined, outcome(65, 'The swarm attacks.', [subtract('hull', { min: 20, max: 40 }), subtract('health', 50)]), outcome(25, 'Nothing happens.')),
  ],
  whirlpool: [
    choice('anchor', 'Use Anchor', 'anchor', outcome(90, 'Nothing happens.'), outcome(10, 'The boat is damaged and the anchor breaks.', [subtract('hull', { min: 5, max: 10 })], [item('break', 'anchor')])),
    choice('swimRing', 'Use Swim Ring', 'swimRing', outcome(50, 'The boat is damaged.', [subtract('hull', { min: 20, max: 40 })]), outcome(50, 'The boat is damaged and the swim ring breaks.', [subtract('hull', { min: 20, max: 40 })], [item('break', 'swimRing')])),
    choice('sleep', 'Sleep', undefined, outcome(80, 'The boat is damaged.', [subtract('hull', { min: 20, max: 40 }), set('energy', 0)]), outcome(30, 'The boat is badly damaged and two items are lost.', [subtract('hull', { min: 60, max: 80 }), set('energy', 2)], [randomItem('loseRandom', 2)])),
  ],
  'shark-men': [
    choice('harpoonGun', 'Use Harpoon Gun', 'harpoonGun', outcome(1, 'The harpoon is used.', [], [item('consume', 'harpoonGun')])),
    choice('swimRing', 'Use Swim Ring', 'swimRing', outcome(85, 'The swim ring is lost.', [], [item('lose', 'swimRing')]), outcome(35, 'The shark men attack.', [subtract('hull', { min: 50, max: 70 }), subtract('health', 50)], [item('break', 'swimRing')])),
    choice('scubaSet', 'Use Scuba Gear', 'scubaSet', outcome(70, 'You gain four food.', [set('energy', 2), add('food', 4)], [item('break', 'scubaSet')]), outcome(36, 'The shark men attack.', [set('energy', 1), subtract('hull', { min: 20, max: 30 }), subtract('health', 80)], [item('break', 'scubaSet')])),
    choice('sleep', 'Sleep', undefined, outcome(80, 'The shark men attack.', [subtract('hull', { min: 50, max: 70 }), subtract('health', 50)]), outcome(20, 'Nothing happens.')),
  ],
  'shower-night': [
    choice('bucket', 'Use Bucket', 'bucket', outcome(90, 'The bucket keeps the rain under control.'), outcome(10, 'The bucket breaks.', [], [item('break', 'bucket')])),
    choice('umbrella', 'Use Umbrella', 'umbrella', outcome(100, 'The umbrella shelters you.'), outcome(50, 'The umbrella breaks.', [], [item('break', 'umbrella')])),
    choice('map', 'Use Map', 'map', outcome(1, 'The map breaks.', [], [item('break', 'map')])),
    choice('sleep', 'Sleep', undefined, outcome(80, 'Nothing happens.'), outcome(20, 'You wake with two energy.', [set('energy', 2)])),
  ],
  'windy-night': [
    choice('fishingNet', 'Use Fishing Net', 'fishingNet', outcome(1, 'The net breaks.', [], [item('break', 'fishingNet')])),
    choice('map', 'Use Map', 'map', outcome(1, 'The map is lost, but you find food.', [add('food', 1)], [item('lose', 'map')])),
    choice('umbrella', 'Use Umbrella', 'umbrella', outcome(60, 'The umbrella is lost.', [], [item('lose', 'umbrella')]), outcome(40, 'You wake with two energy.', [set('energy', 2)])),
    choice('sleep', 'Sleep', undefined, outcome(80, 'The wind batters the boat and breaks two items.', [subtract('hull', { min: 10, max: 30 })], [randomItem('breakRandom', 2)]), outcome(20, 'The wind batters the boat.', [subtract('hull', { min: 10, max: 30 }), set('energy', 1)])),
  ],
  'bad-sleep': [
    choice('bucket', 'Use Bucket', 'bucket', outcome(1, 'Nothing happens.')),
    choice('flashlight', 'Use Flashlight', 'flashlight', outcome(1, 'Nothing happens.')),
    choice('swimRing', 'Use Swim Ring', 'swimRing', outcome(1, 'Nothing happens.')),
    choice('umbrella', 'Use Umbrella', 'umbrella', outcome(100, 'Nothing happens.'), outcome(5, 'The umbrella breaks.', [], [item('break', 'umbrella')])),
    choice('sleep', 'Sleep', undefined, outcome(1, 'You wake with two energy.', [set('energy', 2)])),
  ],
  thunderstorm: [
    choice('anchor', 'Use Anchor', 'anchor', outcome(80, 'Nothing happens.'), outcome(20, 'You wake with two energy.', [set('energy', 2)])),
    choice('bucket', 'Use Bucket', 'bucket', outcome(40, 'The boat and bucket are damaged.', [subtract('hull', { min: 15, max: 25 })], [item('break', 'bucket')]), outcome(30, 'The boat is damaged.', [subtract('hull', { min: 20, max: 30 })]), outcome(20, 'A random item is lost.', [], [randomItem('loseRandom', 1)]), outcome(5, 'A random item is lost and the bucket breaks.', [], [randomItem('loseRandom', 1), item('break', 'bucket')])),
    choice('umbrella', 'Use Umbrella', 'umbrella', outcome(65, 'The boat is damaged and the umbrella breaks.', [subtract('hull', { min: 10, max: 20 })], [item('break', 'umbrella')]), outcome(35, 'The boat is damaged.', [subtract('hull', { min: 20, max: 30 })])),
    choice('sleep', 'Sleep', undefined, outcome(60, 'The storm damages the boat and takes an item.', [subtract('hull', { min: 30, max: 48 }), set('energy', 2)], [randomItem('loseRandom', 1)]), outcome(30, 'The storm damages the boat.', [subtract('hull', { min: 20, max: 35 }), set('energy', 2)])),
  ],
  'restless-waves': [
    choice('anchor', 'Use Anchor', 'anchor', outcome(1, 'Nothing happens.')),
    choice('swimRing', 'Use Swim Ring', 'swimRing', outcome(50, 'The waves damage the boat.', [subtract('hull', { min: 10, max: 20 })]), outcome(50, 'The swim ring breaks.', [], [item('break', 'swimRing')])),
    choice('sleep', 'Sleep', undefined, outcome(50, 'The waves damage the boat.', [subtract('hull', { min: 20, max: 30 }), set('energy', 1)]), outcome(50, 'The waves damage the boat and take an item.', [subtract('hull', { min: 15, max: 25 })], [randomItem('loseRandom', 1)])),
  ],
  'man-in-the-fog': [
    choice('compass', 'Use Compass', 'compass', outcome(1, 'Nothing happens.')),
    choice('spyglass', 'Use Spyglass', 'spyglass', outcome(1, 'Danger increases.', [subtract('rescueProgress', 5)])),
    choice('flashlight', 'Use Flashlight', 'flashlight', outcome(70, 'The figure attacks.', [subtract('rescueProgress', 10), subtract('health', 20), set('energy', 1)]), outcome(35, 'Danger increases.', [subtract('rescueProgress', 10)])),
    choice('sleep', 'Sleep', undefined, outcome(50, 'The boat is damaged.', [subtract('rescueProgress', 5), subtract('hull', { min: 10, max: 30 })]), outcome(50, 'You are injured.', [subtract('rescueProgress', 5), subtract('health', 20), set('energy', 2)])),
  ],
  ghosts: [
    choice('flareGun', 'Use Flare Gun', 'flareGun', outcome(1, 'The flare is used.', [], [item('consume', 'flareGun')])),
    choice('flashlight', 'Use Flashlight', 'flashlight', outcome(60, 'Nothing happens.'), outcome(40, 'You wake with one energy.', [set('energy', 1)])),
    choice('sleep', 'Sleep', undefined, outcome(60, 'You wake with two energy.', [set('energy', 2)]), outcome(30, 'You wake with one energy.', [set('energy', 1)])),
  ],
  'eerie-melody': [
    choice('bucket', 'Use Bucket', 'bucket', outcome(1, 'The bucket breaks.', [set('energy', 1)], [item('break', 'bucket')])),
    choice('spyglass', 'Use Spyglass', 'spyglass', outcome(1, 'The siren attacks.', [subtract('hull', { min: 50, max: 90 }), subtract('health', 50)])),
    choice('umbrella', 'Use Umbrella', 'umbrella', outcome(1, 'The boat is damaged.', [subtract('hull', { min: 40, max: 60 }), set('energy', 1)])),
    choice('ductTape', 'Use Duct Tape', 'ductTape', outcome(1, 'The duct tape is used.', [], [item('consume', 'ductTape')])),
    choice('sleep', 'Sleep', undefined, outcome(60, 'You wake exhausted.', [set('energy', 0)]), outcome(40, 'The siren attacks.', [subtract('hull', { min: 50, max: 90 }), subtract('health', 50), set('energy', 1)])),
  ],
  'face-on-the-moon': [
    choice('umbrella', 'Use Umbrella', 'umbrella', outcome(1, 'You wake with two energy.', [set('energy', 2)])),
    choice('spyglass', 'Use Spyglass', 'spyglass', outcome(60, 'The spyglass breaks.', [set('energy', 1)], [item('break', 'spyglass')]), outcome(40, 'Danger increases.', [subtract('rescueProgress', 5)])),
    choice('sleep', 'Sleep', undefined, outcome(100, 'You wake exhausted.', [set('energy', 0)]), outcome(20, 'You wake with two energy.', [set('energy', 2)])),
  ],
} as const;

describe('survival events', () => {
  it('selects exactly the approved 8 day and 9 night wiki events', () => {
    expect(INCLUDED_EVENT_PHASES).toEqual(INCLUDED);
    expect(Object.fromEntries(SURVIVAL_EVENTS.map(({ id, phase }) => [id, phase]))).toEqual(INCLUDED);
    expect(SURVIVAL_EVENTS).toHaveLength(17);
  });

  it('ports every documented event field, weighted choice, effect, and mutation exactly', () => {
    for (const event of SURVIVAL_EVENTS) {
      const [title, cue, weight, earliestDay, latestDay, cooldownDays] = EXPECTED_METADATA[event.id as keyof typeof EXPECTED_METADATA];
      expect(event).toMatchObject({ title, prompt: 'Choose a response.', cue, weight, earliestDay, cooldownDays });
      expect(event.latestDay).toBe(latestDay);
      expect(event.choices).toEqual(EXPECTED_CHOICES[event.id as keyof typeof EXPECTED_CHOICES]);
      expect(event.choices.filter(({ itemId }) => itemId === undefined), event.id).toHaveLength(1);
    }
  });

  it('defines the exact canonical Snatcher target types in event data', () => {
    const snatcher = SURVIVAL_EVENTS.find(({ id }) => id === 'snatcher')!;
    expect(snatcher.targetItemIds).toEqual([
      'anchor',
      'bucket',
      'medicalKit',
      'flareGun',
      'flashlight',
      'map',
      'scubaSet',
      'umbrella',
      'cannedFood',
    ]);
    expect(Object.isFrozen(snatcher.targetItemIds)).toBe(true);
  });

  it('uses spyglass exclusively and contains no excluded state or item references', () => {
    const serialized = JSON.stringify(SURVIVAL_EVENTS);
    expect(serialized).not.toMatch(/telescope|waterJug|chest|trade|route/i);
    expect(SURVIVAL_EVENTS.flatMap(({ choices }) => choices).some(({ itemId }) => itemId === 'spyglass')).toBe(true);
  });

  it('freezes the catalog through every nested outcome and effect', () => {
    const event = SURVIVAL_EVENTS[0]!;
    const outcomeEntry = event.choices[0]!.outcomes[0];
    expect(Object.isFrozen(INCLUDED_EVENT_PHASES)).toBe(true);
    expect(Object.isFrozen(SURVIVAL_EVENTS)).toBe(true);
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.choices)).toBe(true);
    expect(Object.isFrozen(outcomeEntry)).toBe(true);
    expect(Object.isFrozen(outcomeEntry.effects)).toBe(true);
  });

  it('filters by phase, day bounds, immediate repeat, and cooldown', () => {
    const events = eligibleEvents(SURVIVAL_EVENTS, {
      phase: 'day', day: 9, weather: 'calm', lastEventId: 'school-of-fish',
      lastSeenDay: new Map([['death-stare', 8], ['leak', 8]]),
      targetableItemIds: new Set(['anchor']),
    });
    expect(events.every((event) => event.phase === 'day' && event.earliestDay <= 9)).toBe(true);
    expect(events.map((event) => event.id)).not.toContain('school-of-fish');
    expect(events.map((event) => event.id)).not.toContain('death-stare');
    expect(events.map((event) => event.id)).toContain('leak');
    expect(eligibleEvents(SURVIVAL_EVENTS, {
      phase: 'day', day: 31, weather: 'calm', lastEventId: null, lastSeenDay: new Map(),
      targetableItemIds: new Set(['anchor']),
    }).map((event) => event.id)).not.toContain('dangerous-waters');
  });

  it('excludes Snatcher from the draw pool without a canonical target', () => {
    const eligible = (targetableItemIds: ReadonlySet<ItemId>) => eligibleEvents(SURVIVAL_EVENTS, {
      phase: 'day', day: 8, weather: 'calm', lastEventId: null, lastSeenDay: new Map(),
      targetableItemIds,
    });

    expect(eligible(new Set()).map(({ id }) => id)).not.toContain('snatcher');
    expect(eligible(new Set(['baitTin', 'fishingNet'])).map(({ id }) => id)).not.toContain('snatcher');
    expect(eligible(new Set(['cannedFood'])).map(({ id }) => id)).toContain('snatcher');
  });

  it('draws by stable weighted boundaries and returns a quiet fallback for an empty pool', () => {
    const pool = SURVIVAL_EVENTS.filter((event) => event.phase === 'day').slice(0, 2);
    expect(drawWeightedEvent(pool, sequenceRandom([0])).id).toBe(pool[0]!.id);
    expect(drawWeightedEvent(pool, sequenceRandom([pool[0]!.weight / (pool[0]!.weight + pool[1]!.weight)])).id).toBe(pool[1]!.id);
    expect(drawWeightedEvent([], sequenceRandom([0]), 'day').id).toBe('day-calm-fallback');
    expect(drawWeightedEvent([], sequenceRandom([0]), 'night').id).toBe('night-calm-fallback');
  });

  it('rejects malformed event IDs, choice IDs, weights, effects, mutations, and day bounds', () => {
    const rejects = (mutate: (catalog: any[]) => void, expected: RegExp) => {
      const catalog = structuredClone(SURVIVAL_EVENTS) as any[];
      mutate(catalog);
      expect(() => validateSurvivalEventCatalog(catalog)).toThrow(expected);
    };

    expect(() => validateSurvivalEventCatalog()).not.toThrow();
    rejects((catalog) => { catalog[1].id = catalog[0].id; }, /event ID.*duplicated/i);
    rejects((catalog) => { catalog[0].id = ' '; }, /event ID.*blank/i);
    rejects((catalog) => { catalog[0].choices[1].id = catalog[0].choices[0].id; }, /choice ID.*duplicated/i);
    rejects((catalog) => { catalog[0].choices = []; }, /choices.*empty/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes = []; }, /outcomes.*empty/i);
    rejects((catalog) => { catalog[0].weight = 0; }, /event.*weight/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].weight = 0; }, /outcome.*weight/i);
    rejects((catalog) => { catalog[0].choices[0].itemId = 'telescope'; }, /unknown item/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects.resources = [add('danger', 1)]; }, /unknown resource/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects.resources = [subtract('hull', { min: 4, max: 3 })]; }, /invalid range/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects = null; }, /effects/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects.resources = {}; }, /resources/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects.items = [item('consume', 'telescope')]; }, /unknown item/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects.items = [item('consume', 'ductTape', 1.5)]; }, /quantity/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects.items = [item('break', 'flashlight')]; }, /not breakable/i);
    rejects((catalog) => { catalog[0].latestDay = 1; }, /day bounds/i);
  });

  it('rejects forbidden effect categories and non-exact effect object shapes', () => {
    const rejectsEffects = (effects: unknown, expected: RegExp) => {
      const catalog = structuredClone(SURVIVAL_EVENTS) as any[];
      catalog[0].choices[0].outcomes[0].effects = effects;
      expect(() => validateSurvivalEventCatalog(catalog)).toThrow(expected);
    };
    const rejectsResource = (effect: unknown, expected: RegExp) => {
      const catalog = structuredClone(SURVIVAL_EVENTS) as any[];
      catalog[0].choices[0].outcomes[1].effects.resources = [effect];
      expect(() => validateSurvivalEventCatalog(catalog)).toThrow(expected);
    };

    rejectsEffects({ route: 'left' }, /unsupported effect key route/i);
    rejectsEffects({ terminal: 'sunk' }, /unsupported effect key terminal/i);
    rejectsEffects({ resources: undefined }, /resources.*array/i);
    rejectsEffects({ items: undefined }, /items.*array/i);
    rejectsEffects({ rescue: undefined }, /rescue.*boolean/i);
    const hiddenRoute = {};
    Object.defineProperty(hiddenRoute, 'route', { value: 'left' });
    rejectsEffects(hiddenRoute, /unsupported effect key route/i);
    rejectsEffects(Object.create({ route: 'left' }), /effects.*plain object/i);
    rejectsEffects([], /effects.*plain object/i);
    const catalogWithOutcomeRoute = structuredClone(SURVIVAL_EVENTS) as any[];
    catalogWithOutcomeRoute[0].choices[0].outcomes[0].route = 'left';
    expect(() => validateSurvivalEventCatalog(catalogWithOutcomeRoute)).toThrow(/unsupported outcome key route/i);
    rejectsResource({ resource: 'hull', operation: 'subtract' }, /resource effect.*missing.*value/i);
    rejectsResource({ resource: 'hull', operation: 'subtract', value: 1, route: 'left' }, /unsupported resource effect key route/i);
    rejectsResource({ resource: 'hull', operation: 'subtract', value: { min: 1, max: 2, step: 1 } }, /unsupported range key step/i);
    rejectsResource(['hull', 'subtract', 1], /resource effect.*plain object/i);
    rejectsResource(null, /resource effect.*plain object/i);
  });

  it('rejects hybrid, incomplete, excess, inherited, and non-object inventory mutations', () => {
    const rejectsMutation = (mutation: unknown, expected: RegExp) => {
      const catalog = structuredClone(SURVIVAL_EVENTS) as any[];
      catalog[1].choices[0].outcomes[0].effects.items = [mutation];
      expect(() => validateSurvivalEventCatalog(catalog)).toThrow(expected);
    };

    rejectsMutation({ kind: 'breakRandom', quantity: 1, itemId: 'bucket' }, /unsupported breakRandom mutation key itemId/i);
    rejectsMutation({ kind: 'loseRandom', quantity: 1, resource: 'food' }, /unsupported loseRandom mutation key resource/i);
    rejectsMutation({ kind: 'breakRandom' }, /breakRandom mutation.*missing.*quantity/i);
    rejectsMutation({ kind: 'consume', quantity: 1 }, /consume mutation.*missing.*itemId/i);
    rejectsMutation({ kind: 'break', itemId: 'bucket', quantity: 1, target: true }, /unsupported break mutation key target/i);
    rejectsMutation({ kind: 'loseEventTarget', quantity: 1, itemId: 'map' }, /unsupported loseEventTarget mutation key itemId/i);
    rejectsMutation(Object.assign(Object.create({ itemId: 'ductTape' }), { kind: 'consume', quantity: 1 }), /mutation.*plain object/i);
    rejectsMutation(['consume', 'ductTape', 1], /mutation.*plain object/i);
    rejectsMutation(null, /mutation.*plain object/i);
  });
});

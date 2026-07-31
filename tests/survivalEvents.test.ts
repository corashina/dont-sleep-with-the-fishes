// Importance: 5/5. Protects event eligibility and schema rules.
import { describe, expect, it } from 'vitest';
import type { ItemId } from '../src/game/ItemState';
import {
  INCLUDED_EVENT_PHASES,
  SURVIVAL_EVENTS,
  drawWeightedEvent,
  eligibleEvents,
  validateSurvivalEventCatalog,
} from '../src/survival/events';
import { sequenceRandom } from './helpers/random';

const INCLUDED = {
  'dangerous-waters': 'night', leak: 'night', 'school-of-fish': 'night',
  snatcher: 'night', 'death-stare': 'night', 'swarm-of-anglerfish': 'night',
  whirlpool: 'night',
  'shower-night': 'night', 'windy-night': 'night', 'bad-sleep': 'night',
  thunderstorm: 'night', 'restless-waves': 'night', 'man-in-the-fog': 'night',
  ghosts: 'night', 'eerie-melody': 'night', 'face-on-the-moon': 'night',
} as const;

const MOVED_NIGHT_EVENT_IDS = [
  'dangerous-waters',
  'leak',
  'school-of-fish',
  'snatcher',
  'death-stare',
  'swarm-of-anglerfish',
  'whirlpool',
] as const;

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
const dangerousWatersOutcome = (
  weight: number,
  message: string,
  resources: readonly unknown[] = [],
) => ({
  weight,
  message,
  effects: {
    ...(resources.length ? { resources } : {}),
    flags: { set: ['direction2'] },
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

const EXPECTED_REVEAL_TEXT = {
  'dangerous-waters': 'Jagged rocks break the surface as the current pulls the boat off course.',
  leak: 'Water pushes through a split in the hull.',
  'school-of-fish': 'A dense school churns the water beside the boat.',
  snatcher: 'Something reaches over the gunwale and grabs one of your supplies.',
  'death-stare': 'A huge shape rises and fixes its gaze on the boat.',
  'swarm-of-anglerfish': 'Cold lights gather beneath the surface and close in.',
  whirlpool: 'The sea begins circling faster around the boat.',
  'shower-night': 'Rain starts falling over the exposed boat.',
  'windy-night': 'Wind catches every loose object on the boat.',
  'bad-sleep': 'Uneasy darkness settles over the boat.',
  thunderstorm: 'Thunder rolls as the storm breaks overhead.',
  'restless-waves': 'Waves hammer the sides through the night.',
  'man-in-the-fog': 'A lone figure appears in the fog.',
  ghosts: 'Pale shapes gather around the drifting boat.',
  'eerie-melody': 'A distant melody drifts across the water.',
  'face-on-the-moon': 'A face takes shape across the moon.',
} as const;

const EXPECTED_CHOICES = {
  'dangerous-waters': [
    choice('map', 'Use Map', 'map',
      dangerousWatersOutcome(80, 'Nothing happens.'),
      dangerousWatersOutcome(20, 'The rocks damage the boat.', [
        subtract('hull', { min: 5, max: 10 }),
        add('pressure', 1),
      ])),
    choice('compass', 'Use Compass', 'compass',
      dangerousWatersOutcome(50, 'Nothing happens.'),
      dangerousWatersOutcome(50, 'The rocks damage the boat.', [
        subtract('hull', { min: 5, max: 8 }),
        add('pressure', 1),
      ])),
    choice('sleep', 'Sleep', undefined,
      dangerousWatersOutcome(1, 'The rocks damage the boat.', [
        subtract('hull', { min: 25, max: 45 }),
        add('pressure', 1),
      ])),
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
    choice('spyglass', 'Use Binoculars', 'spyglass', outcome(50, 'Nothing happens.'), outcome(50, 'You gain one food.', [add('food', 1)])),
    choice('sleep', 'Sleep', undefined, outcome(1, 'Nothing happens.')),
  ],
  snatcher: [
    choice('spyglass', 'Use Binoculars', 'spyglass', outcome(1, 'The binoculars break.', [], [item('break', 'spyglass')])),
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
    choice('spyglass', 'Use Binoculars', 'spyglass', outcome(1, 'Danger increases.', [subtract('rescueProgress', 5), add('pressure', 1)])),
    choice('flashlight', 'Use Flashlight', 'flashlight', outcome(70, 'The figure attacks.', [subtract('rescueProgress', 10), subtract('health', 20), set('energy', 1)]), outcome(35, 'Danger increases.', [subtract('rescueProgress', 10), add('pressure', 1)])),
    choice('sleep', 'Sleep', undefined, outcome(50, 'The boat is damaged.', [subtract('rescueProgress', 5), subtract('hull', { min: 10, max: 30 })]), outcome(50, 'You are injured.', [subtract('rescueProgress', 5), subtract('health', 20), set('energy', 2)])),
  ],
  ghosts: [
    choice('flareGun', 'Use Flare Gun', 'flareGun', outcome(1, 'The flare is used.', [], [item('consume', 'flareGun')])),
    choice('flashlight', 'Use Flashlight', 'flashlight', outcome(60, 'Nothing happens.'), outcome(40, 'You wake with one energy.', [set('energy', 1)])),
    choice('sleep', 'Sleep', undefined, outcome(60, 'You wake with two energy.', [set('energy', 2)]), outcome(30, 'You wake with one energy.', [set('energy', 1)])),
  ],
  'eerie-melody': [
    choice('bucket', 'Use Bucket', 'bucket', outcome(1, 'The bucket breaks.', [set('energy', 1)], [item('break', 'bucket')])),
    choice('spyglass', 'Use Binoculars', 'spyglass', outcome(1, 'The siren attacks.', [subtract('hull', { min: 50, max: 90 }), subtract('health', 50)])),
    choice('umbrella', 'Use Umbrella', 'umbrella', outcome(1, 'The boat is damaged.', [subtract('hull', { min: 40, max: 60 }), set('energy', 1)])),
    choice('ductTape', 'Use Duct Tape', 'ductTape', outcome(1, 'The duct tape is used.', [], [item('consume', 'ductTape')])),
    choice('sleep', 'Sleep', undefined, outcome(60, 'You wake exhausted.', [set('energy', 0)]), outcome(40, 'The siren attacks.', [subtract('hull', { min: 50, max: 90 }), subtract('health', 50), set('energy', 1)])),
  ],
  'face-on-the-moon': [
    choice('umbrella', 'Use Umbrella', 'umbrella', outcome(1, 'You wake with two energy.', [set('energy', 2)])),
    choice('spyglass', 'Use Binoculars', 'spyglass', outcome(60, 'The binoculars break.', [set('energy', 1)], [item('break', 'spyglass')]), outcome(40, 'Danger increases.', [subtract('rescueProgress', 5), add('pressure', 1)])),
    choice('sleep', 'Sleep', undefined, outcome(100, 'You wake exhausted.', [set('energy', 0)]), outcome(20, 'You wake with two energy.', [set('energy', 2)])),
  ],
} as const;

describe('survival events', () => {
  it('keeps only Drifting Loot in the random day catalog', () => {
    expect(
      SURVIVAL_EVENTS
        .filter(({ phase }) => phase === 'day')
        .map(({ id }) => id),
    ).toEqual(['drifting-loot']);
    expect(
      MOVED_NIGHT_EVENT_IDS.every((id) => (
        SURVIVAL_EVENTS.find((event) => event.id === id)?.phase === 'night'
      )),
    ).toBe(true);
  });


  it('contains the approved non-story expansion', () => {
    expect(SURVIVAL_EVENTS.map(({ id }) => id)).toEqual(expect.arrayContaining([
      'drifting-loot', 'drifting-bottle', 'check-the-back', 'mystery-chest',
      'midnight-tour', 'night-trader', 'handyman', 'other-people',
      'flowers', 'chest-attack',
    ]));
  });

  it('requires Fishing Net or Swim Ring to recover the Drifting Bottle', () => {
    const bottle = SURVIVAL_EVENTS.find(({ id }) => id === 'drifting-bottle');

    expect(bottle?.choices.map(({ id, itemId }) => ({ id, itemId }))).toEqual([
      { id: 'fishingNet', itemId: 'fishingNet' },
      { id: 'swimRing', itemId: 'swimRing' },
      { id: 'sleep', itemId: undefined },
    ]);
  });

  it('encodes the authored Drifting Loot cost, Handyman response, and fallback labels', () => {
    const event = (id: string) => SURVIVAL_EVENTS.find((candidate) => candidate.id === id)!;
    const retrieve = event('drifting-loot').choices.find(({ id }) => id === 'retrieve')!;
    expect(retrieve.requirements).toEqual([{ resource: 'energy', minimum: 3 }]);
    expect(retrieve.outcomes.every(({ effects }) => (
      effects.resources?.some((effect) => (
        effect.resource === 'energy'
        && effect.operation === 'subtract'
        && effect.value === 3
      )) === true
    ))).toBe(true);

    expect(event('handyman').choices.find(({ id }) => id === 'touch')).toMatchObject({
      label: 'Touch the Hand',
      outcomes: [{
        effects: {
          resources: [
            { resource: 'hull', operation: 'subtract', value: { min: 30, max: 60 } },
            { resource: 'health', operation: 'subtract', value: 70 },
          ],
        },
      }],
    });
    expect([
      ['check-the-back', 'Ignore'],
      ['mystery-chest', 'Leave'],
      ['midnight-tour', 'Sail On'],
      ['night-trader', 'Refuse'],
    ].map(([eventId, label]) => (
      event(eventId!).choices.find(({ id }) => id === 'sleep')?.label === label
    ))).toEqual([true, true, true, true]);
  });

  it('keeps Drifting Loot in the catalog as a dawn-only zero-cooldown reward event', () => {
    const loot = SURVIVAL_EVENTS.find(({ id }) => id === 'drifting-loot');

    expect(loot).toMatchObject({
      phase: 'day',
      earliestDay: 3,
      cooldownDays: 0,
    });
    const retrieve = loot?.choices.find(({ id }) => id === 'retrieve');
    expect(retrieve?.label).toBe('Retrieve It');
    expect(retrieve?.requirements).toEqual([{ resource: 'energy', minimum: 3 }]);
    expect(retrieve?.outcomes.map(({ weight }) => weight)).toEqual([45, 25, 20, 10]);
  });

  it('encodes the exact rules and presentation keys for the five featured events', () => {
    const event = (id: string) => SURVIVAL_EVENTS.find((candidate) => candidate.id === id)!;

    expect(event('drifting-loot')).toMatchObject({ phase: 'day', weight: 18, earliestDay: 3 });
    expect(event('drifting-bottle')).toMatchObject({
      weight: 30,
      earliestDay: 2,
      maximumAppearances: 1,
      absentItemIds: ['bottledPaper'],
    });
    expect(event('check-the-back').choices[0]?.outcomes).toMatchObject([
      { weight: 500, presentationKey: 'check-the-back.fish' },
      { weight: 50, presentationKey: 'check-the-back.empty' },
      {
        weight: 1,
        presentationKey: 'check-the-back.face',
        minimumPriorAppearances: 1,
      },
    ]);
    expect(event('mystery-chest').choices[0]?.outcomes).toMatchObject([
      { weight: 80, presentationKey: 'mystery-chest.safe' },
      {
        weight: 30,
        presentationKey: 'mystery-chest.mimic',
        effects: { resources: [{ resource: 'health', operation: 'subtract', value: 25 }] },
      },
    ]);
    expect(event('flowers')).toMatchObject({
      weight: 2,
      earliestDay: 2,
      latestDay: 13,
      maximumAppearances: 1,
    });
    expect(event('flowers').maximumPressure).toBeUndefined();
  });

  it('blocks one-time, absent-item, and rescue-progress events', () => {
    const base = {
      phase: 'night' as const, day: 20, weather: 'calm' as const, lastEventId: null,
      lastSeenDay: new Map<string, number>(), targetableItemIds: new Set<ItemId>(),
      appearanceCounts: new Map<string, number>(), inventoryItemIds: new Set<ItemId>(), rescueProgress: 0,
    };
    expect(eligibleEvents(SURVIVAL_EVENTS, {
      ...base,
      inventoryItemIds: new Set(['bottledPaper']),
    }).some(({ id }) => id === 'drifting-bottle')).toBe(false);
    expect(eligibleEvents(SURVIVAL_EVENTS, {
      ...base,
      rescueProgress: 14,
    }).some(({ id }) => id === 'other-people')).toBe(false);
    expect(eligibleEvents(SURVIVAL_EVENTS, {
      ...base,
      appearanceCounts: new Map([['drifting-bottle', 1]]),
    }).some(({ id }) => id === 'drifting-bottle')).toBe(false);
  });

  it('filters by phase, day bounds, immediate repeat, and cooldown', () => {
    const events = eligibleEvents(SURVIVAL_EVENTS, {
      phase: 'night', day: 9, weather: 'calm', lastEventId: 'school-of-fish',
      lastSeenDay: new Map([['death-stare', 8], ['leak', 8]]),
      targetableItemIds: new Set(['anchor']),
      appearanceCounts: new Map(), inventoryItemIds: new Set(), rescueProgress: 0,
    });
    expect(events.every((event) => event.phase === 'night' && event.earliestDay <= 9)).toBe(true);
    expect(events.map((event) => event.id)).not.toContain('school-of-fish');
    expect(events.map((event) => event.id)).not.toContain('death-stare');
    expect(events.map((event) => event.id)).toContain('leak');
    expect(eligibleEvents(SURVIVAL_EVENTS, {
      phase: 'night', day: 31, weather: 'calm', lastEventId: null, lastSeenDay: new Map(),
      targetableItemIds: new Set(['anchor']),
      appearanceCounts: new Map(), inventoryItemIds: new Set(), rescueProgress: 0,
    }).map((event) => event.id)).not.toContain('dangerous-waters');
  });

  it('assigns Dangerous Waters to the night with its authored one-time rule', () => {
    const event = SURVIVAL_EVENTS.find(({ id }) => id === 'dangerous-waters');

    expect(event).toMatchObject({
      phase: 'night',
      weight: 15,
      earliestDay: 2,
      latestDay: 30,
      maximumAppearances: 1,
    });
  });

  it('limits Dangerous Waters to one appearance per run', () => {
    expect(eligibleEvents(SURVIVAL_EVENTS, {
      phase: 'night', day: 12, weather: 'calm', lastEventId: null,
      lastSeenDay: new Map(), targetableItemIds: new Set(),
      appearanceCounts: new Map([['dangerous-waters', 1]]),
      inventoryItemIds: new Set(), rescueProgress: 0,
    }).map(({ id }) => id)).not.toContain('dangerous-waters');
  });

  it('excludes Snatcher from the draw pool without a canonical target', () => {
    const eligible = (targetableItemIds: ReadonlySet<ItemId>) => eligibleEvents(SURVIVAL_EVENTS, {
      phase: 'night', day: 8, weather: 'calm', lastEventId: null, lastSeenDay: new Map(),
      targetableItemIds,
      appearanceCounts: new Map(), inventoryItemIds: new Set(), rescueProgress: 0,
    });

    expect(eligible(new Set()).map(({ id }) => id)).not.toContain('snatcher');
    expect(eligible(new Set(['baitTin', 'fishingNet'])).map(({ id }) => id)).not.toContain('snatcher');
    expect(eligible(new Set(['cannedFood'])).map(({ id }) => id)).toContain('snatcher');
  });

  it('draws by stable weighted boundaries and returns a quiet fallback for an empty pool', () => {
    const pool = SURVIVAL_EVENTS.filter((event) => event.phase === 'night').slice(0, 2);
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
    rejects((catalog) => { catalog[0].revealText = ' '; }, /reveal text.*blank/i);
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

  it.each([
    ['a non-array', 'anchor', /target item IDs.*array/i],
    ['an explicit undefined value', undefined, /target item IDs.*array/i],
    ['an empty array', [], /target item IDs.*empty/i],
    ['duplicate IDs', ['anchor', 'anchor'], /target item ID anchor.*duplicated/i],
    ['an unknown item ID', ['waterJug'], /target item IDs.*unknown item/i],
  ] as const)('rejects target item catalogs containing %s', (_case, targetItemIds, expected) => {
    const catalog = structuredClone(SURVIVAL_EVENTS) as any[];
    catalog[3].targetItemIds = targetItemIds;
    expect(() => validateSurvivalEventCatalog(catalog)).toThrow(expected);
  });

  it('rejects malformed inherited target item catalogs before event eligibility reads them', () => {
    const catalog = structuredClone(SURVIVAL_EVENTS) as any[];
    const snatcher = catalog[3];
    delete snatcher.targetItemIds;
    catalog[3] = Object.assign(Object.create({ targetItemIds: 'anchor' }), snatcher);

    expect(() => validateSurvivalEventCatalog(catalog)).toThrow(/target item IDs.*array/i);
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
    rejectsEffects({ chest: undefined }, /chest.*invalid effect/i);
    rejectsEffects({ flags: undefined }, /flags.*plain object/i);
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

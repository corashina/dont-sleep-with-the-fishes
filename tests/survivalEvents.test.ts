// Importance: 5/5. Protects event eligibility and schema rules.
import { describe, expect, it } from 'vitest';
import type { ItemId } from '../src/game/ItemState';
import {
  SURVIVAL_EVENT_IDS,
  SURVIVAL_EVENTS,
  drawWeightedEvent,
  eligibleEvents,
  survivalEventById,
  validateSurvivalEventCatalog,
} from '../src/survival/events';
import { sequenceRandom } from './helpers/random';

const EXPECTED_WEIGHTS = {
  'dangerous-waters': 2, leak: 2, 'school-of-fish': 4, snatcher: 3,
  'death-stare': 4, 'swarm-of-anglerfish': 2, tornado: 1,
  'shower-night': 3, 'windy-night': 4, 'bad-sleep': 4,
  thunderstorm: 4, 'restless-waves': 3, 'man-in-the-fog': 2,
  ghosts: 3, 'eerie-melody': 3, 'face-on-the-moon': 1,
  'sick-companion': 1, 'shadow-figure': 1,
  'guarded-sleep': 4, 'drifting-barrel': 1, 'drifting-chest': 1,
  'drifting-bottle': 3,
  'check-the-back': 3, flowers: 1,
  'chest-attack': 1, 'midnight-tour': 2, 'night-trader': 2,
  handyman: 2, 'other-people': 2,
} as const;

const EXPECTED_RISK = {
  'dangerous-waters': 'dangerous', leak: 'dangerous',
  'school-of-fish': 'uncertain', snatcher: 'uncertain',
  'death-stare': 'dangerous', 'swarm-of-anglerfish': 'dangerous',
  tornado: 'dangerous', 'shower-night': 'uncertain',
  'windy-night': 'dangerous', 'bad-sleep': 'uncertain',
  thunderstorm: 'dangerous', 'restless-waves': 'dangerous',
  'man-in-the-fog': 'dangerous', ghosts: 'uncertain',
  'eerie-melody': 'dangerous', 'face-on-the-moon': 'uncertain',
  'sick-companion': 'uncertain', 'shadow-figure': 'dangerous',
  'guarded-sleep': 'uncertain',
  'drifting-barrel': 'safe', 'drifting-chest': 'safe', 'drifting-bottle': 'safe',
  'check-the-back': 'safe',
  flowers: 'safe', 'chest-attack': 'dangerous',
  'midnight-tour': 'dangerous', 'night-trader': 'safe',
  handyman: 'dangerous', 'other-people': 'safe',
} as const;

const resource = (resourceName: string, operation: string, value: unknown) => ({
  resource: resourceName, operation, value,
});
const add = (name: string, value: unknown) => resource(name, 'add', value);
const subtract = (name: string, value: unknown) => resource(name, 'subtract', value);
const item = (kind: string, itemId: string, quantity = 1) => ({ kind, itemId, quantity });

describe('survival events', () => {
  it('uses the approved phase, risk, weight, and cooldown rules', () => {
    const byId = Object.fromEntries(SURVIVAL_EVENTS.map((event) => [event.id, event]));
    expect(SURVIVAL_EVENTS.map(({ id }) => id)).toEqual(SURVIVAL_EVENT_IDS);
    expect(Object.fromEntries(SURVIVAL_EVENTS.map(({ id, weight }) => [id, weight])))
      .toEqual(EXPECTED_WEIGHTS);
    expect(Object.fromEntries(SURVIVAL_EVENTS.map(({ id, danger }) => [id, danger])))
      .toEqual(EXPECTED_RISK);
    expect(SURVIVAL_EVENTS.filter(({ phase }) => phase === 'day').map(({ id }) => id))
      .toEqual(['drifting-barrel', 'drifting-chest', 'drifting-bottle']);
    expect(byId['school-of-fish']!.phase).toBe('night');
    expect(byId.flowers!.phase).toBe('night');
    expect(byId['drifting-barrel']!.cooldownDays).toBe(3);
    expect(byId['guarded-sleep']!.cooldownDays).toBe(4);
    expect(byId['swarm-of-anglerfish']!.requiresLivingCompanion).toBeUndefined();
  });

  it('rejects generic placeholder copy and keeps every live result specific', () => {
    const genericPlaceholder = ['Nothing', 'happens.'].join(' ');
    const isSpecificResultCopy = (message: string): boolean => (
      message.trim().length > 0 && message.trim() !== genericPlaceholder
    );
    const messages = SURVIVAL_EVENTS.flatMap(({ choices }) => (
      choices.flatMap(({ outcomes }) => outcomes.map(({ message }) => message))
    ));
    expect(isSpecificResultCopy(genericPlaceholder)).toBe(false);
    expect(messages.every(isSpecificResultCopy)).toBe(true);
  });
  it('uses dawn energy instead of immediate energy during night events', () => {
    for (const event of SURVIVAL_EVENTS.filter(({ phase }) => phase === 'night')) {
      for (const choice of event.choices) {
        for (const result of choice.outcomes) {
          expect(
            result.effects.resources?.some(({ resource }) => resource === 'energy') ?? false,
            `${event.id}.${choice.id}`,
          ).toBe(false);
        }
      }
    }
  });

  it('defines Carlitos event gates and living-companion eligibility', () => {
    expect(survivalEventById('sick-companion')).toMatchObject({
      earliestDay: 5, weight: 1, cooldownDays: 26, requiresLivingCompanion: true,
    });
    expect(survivalEventById('shadow-figure')).toMatchObject({
      earliestDay: 20, minimumPressure: 3, weight: 1, cooldownDays: 30,
      requiresLivingCompanion: true,
    });
    expect(survivalEventById('guarded-sleep')).toMatchObject({
      earliestDay: 7, weight: 4, cooldownDays: 4, requiresLivingCompanion: true,
    });
    expect(survivalEventById('swarm-of-anglerfish')?.requiresLivingCompanion).toBeUndefined();

    const criteria = {
      phase: 'night' as const,
      day: 30,
      weather: 'calm' as const,
      lastEventId: null,
      lastSeenDay: new Map<string, number>(),
      targetableItemIds: new Set<ItemId>(),
      appearanceCounts: new Map<string, number>(),
      inventoryItemIds: new Set<ItemId>(),
      rescueProgress: 0,
      pressure: 4,
    };
    const companionEvents = [
      'sick-companion', 'shadow-figure', 'guarded-sleep',
    ];
    const absent = eligibleEvents(SURVIVAL_EVENTS, {
      ...criteria,
      hasLivingCompanion: false,
    }).map(({ id }) => id);
    expect(companionEvents.every((id) => !absent.includes(id))).toBe(true);

    const living = eligibleEvents(SURVIVAL_EVENTS, {
      ...criteria,
      hasLivingCompanion: true,
    }).map(({ id }) => id);
    expect(companionEvents.every((id) => living.includes(id))).toBe(true);
  });

  it('defines exact Carlitos choices and delegated loot weights', () => {
    const event = (id: string) => survivalEventById(id)!;

    expect(event('sick-companion').choices.map(({ id, itemId }) => ({ id, itemId })))
      .toEqual([
        { id: 'medicalKit', itemId: 'medicalKit' },
        { id: 'energyBar', itemId: 'energyBar' },
        { id: 'ductTape', itemId: 'ductTape' },
        { id: 'sleep', itemId: undefined },
      ]);
    expect(event('shadow-figure').choices.map(({ id, itemId }) => ({ id, itemId })))
      .toEqual([
        { id: 'spyglass', itemId: 'spyglass' },
        { id: 'flashlight', itemId: 'flashlight' },
        { id: 'flareGun', itemId: 'flareGun' },
        { id: 'sleep', itemId: undefined },
      ]);
    expect(event('guarded-sleep').choices.map(({ id }) => id))
      .toEqual(['watch', 'sleep']);
    expect(event('sick-companion').choices.find(({ id }) => id === 'ductTape')
      ?.outcomes.map(({ weight }) => weight)).toEqual([80, 10]);

    const delegate = event('drifting-barrel').choices.find(({ id }) => id === 'delegate-carlitos');
    expect(delegate).toMatchObject({
      label: 'Send Carlitos',
      companionAction: 'delegateCarlitos',
    });
    expect(delegate?.requirements).toBeUndefined();
    expect(delegate?.outcomes.map(({ weight }) => weight)).toEqual([45, 25, 20, 10]);
    expect(delegate?.outcomes.flatMap(({ effects }) => effects.resources ?? [])
      .some(({ resource }) => resource === 'energy')).toBe(false);
  });

  it('sets the six night-event rule constraints', () => {
    const leak = survivalEventById('leak')!;
    const school = survivalEventById('school-of-fish')!;
    const death = survivalEventById('death-stare')!;
    const swarm = survivalEventById('swarm-of-anglerfish')!;
    const tornado = survivalEventById('tornado')!;

    expect(leak.maximumAppearances).toBe(1);
    expect(school.minimumPressure).toBe(1);
    expect(death.minimumPressure).toBe(1);
    expect(swarm.minimumPressure).toBe(1);
    expect(tornado.minimumPressure).toBe(1);
    expect(tornado).toMatchObject({
      title: 'Tornado',
      revealText: 'A dark wind funnel spins above the sea.',
    });
  });

  it('preserves the exact approved Tornado event data', () => {
    expect(survivalEventById('tornado')).toEqual({
      id: 'tornado',
      phase: 'night',
      title: 'Tornado',
      revealText: 'A dark wind funnel spins above the sea.',
      prompt: 'Choose a response.',
      danger: 'dangerous',
      cue: 'impact',
      weight: 1,
      earliestDay: 12,
      minimumPressure: 1,
      cooldownDays: 30,
      choices: [
        {
          id: 'anchor',
          label: 'Use Anchor',
          itemId: 'anchor',
          outcomes: [
            {
              weight: 90,
              message: 'The anchor holds the boat outside the current.',
              effects: {},
            },
            {
              weight: 10,
              message: 'The boat is damaged.',
              effects: {
                resources: [{
                  resource: 'hull',
                  operation: 'subtract',
                  value: { min: 5, max: 10 },
                }],
                items: [{ kind: 'break', itemId: 'anchor', quantity: 1 }],
              },
            },
          ],
        },
        {
          id: 'swimRing',
          label: 'Use Swim Ring',
          itemId: 'swimRing',
          outcomes: [
            {
              weight: 50,
              message: 'The boat is damaged.',
              effects: {
                resources: [{
                  resource: 'hull',
                  operation: 'subtract',
                  value: { min: 20, max: 40 },
                }],
              },
            },
            {
              weight: 50,
              message: 'The boat is damaged.',
              effects: {
                resources: [{
                  resource: 'hull',
                  operation: 'subtract',
                  value: { min: 20, max: 40 },
                }],
                items: [{ kind: 'break', itemId: 'swimRing', quantity: 1 }],
              },
            },
          ],
        },
        {
          id: 'sleep',
          label: 'Sleep',
          outcomes: [
            {
              weight: 80,
              message: 'The boat is damaged.',
              effects: {
                resources: [{
                  resource: 'hull',
                  operation: 'subtract',
                  value: { min: 20, max: 40 },
                }],
                nextDawnEnergy: 0,
              },
            },
            {
              weight: 30,
              message: 'The boat is badly damaged and two items are lost.',
              effects: {
                resources: [{
                  resource: 'hull',
                  operation: 'subtract',
                  value: { min: 60, max: 80 },
                }],
                items: [{ kind: 'loseRandom', quantity: 2 }],
                nextDawnEnergy: 2,
              },
            },
          ],
        },
      ],
    });
  });

  it('contains the approved non-story expansion', () => {
    expect(SURVIVAL_EVENTS.map(({ id }) => id)).toEqual(expect.arrayContaining([
      'drifting-barrel', 'drifting-chest', 'drifting-bottle', 'check-the-back',
      'midnight-tour', 'night-trader', 'handyman', 'other-people',
      'flowers', 'chest-attack',
    ]));
  });

  it('uses the authored gates for the five-night events', () => {
    const event = (id: string) => SURVIVAL_EVENTS.find((candidate) => candidate.id === id)!;

    expect(event('midnight-tour')).toMatchObject({
      weight: 2,
      earliestDay: 7,
      latestDay: 40,
      minimumPressure: 1,
      cooldownDays: 30,
      allowedChestStates: ['none'],
    });
    expect(event('handyman')).toMatchObject({
      weight: 2,
      earliestDay: 20,
      minimumPressure: 2,
      cooldownDays: 50,
    });
    expect(event('other-people')).toMatchObject({
      weight: 2,
      earliestDay: 15,
      cooldownDays: 20,
      minimumRescueProgress: 15,
      maximumAppearances: 2,
    });
  });

  it('defines the authored five-night choice outcomes', () => {
    const event = (id: string) => SURVIVAL_EVENTS.find((candidate) => candidate.id === id)!;
    const resultIds = (eventId: string, choiceId: string) => (
      event(eventId).choices.find(({ id }) => id === choiceId)!.outcomes.map(({ resultId }) => resultId)
    );

    expect(resultIds('chest-attack', 'fishingNet')).toEqual(['chest-bound']);
    expect(event('chest-attack').choices.some(({ id }) => id === 'fight')).toBe(false);
    expect(resultIds('chest-attack', 'sleep')).toEqual(['chest-hide']);
    expect(event('midnight-tour').choices.find(({ id }) => id === 'visit')?.outcomes).toMatchObject([
      {
        resultId: 'tour-chest', weight: 50,
        effects: {
          resources: [add('pressure', 1)],
          nextDawnEnergy: 2,
          items: [{ kind: 'gainChest', quantity: 1, fallbackFood: 1 }],
        },
      },
      { resultId: 'tour-bait', weight: 50, effects: { resources: [add('bait', 1)] } },
      { resultId: 'tour-attack', weight: 12, effects: { resources: [subtract('health', 35)] } },
    ]);
    expect(resultIds('midnight-tour', 'sleep')).toEqual(['tour-pass']);
    expect(['food', 'bait', 'map', 'umbrella'].every((choiceId) => (
      resultIds('night-trader', choiceId).every((resultId) => resultId === 'trader-reward')
    ))).toBe(true);
    expect(event('night-trader').choices.slice(0, 4).map(({ id, itemId, label }) => ({
      id,
      itemId,
      label,
    }))).toEqual([
      { id: 'food', itemId: 'cannedFood', label: 'Offer Food' },
      { id: 'bait', itemId: 'baitTin', label: 'Offer Bait' },
      { id: 'map', itemId: 'map', label: 'Offer Map' },
      { id: 'umbrella', itemId: 'umbrella', label: 'Offer Umbrella' },
    ]);
    expect(resultIds('night-trader', 'sleep')).toEqual(['trader-refuse']);
    expect(['spyglass', 'flashlight', 'flareGun', 'shotgun', 'medicalKit', 'fishingNet', 'bucket', 'ductTape', 'energyBar', 'anchor', 'chest']
      .every((choiceId) => resultIds('handyman', choiceId).every((resultId) => resultId === 'handyman-reward'))).toBe(true);
    expect(event('handyman').choices.find(({ id }) => id === 'chest')).toMatchObject({
      requiredChestState: 'closed',
      outcomes: [{ effects: { chest: 'destroy', items: [{ kind: 'gain', itemId: 'anchor', quantity: 1, fallbackFood: 1 }] } }],
    });
    expect(resultIds('handyman', 'touch')).toEqual(['handyman-touch']);
    expect(resultIds('handyman', 'sleep')).toEqual(['handyman-sleep']);
    expect(resultIds('other-people', 'flareGun')).toEqual(['people-rescue']);
    expect(resultIds('other-people', 'flashlight')).toEqual(['people-rescue', 'people-missed']);
    expect(resultIds('other-people', 'sleep')).toEqual(['people-pass']);
    expect(event('other-people').choices.map(({ id }) => id)).not.toContain('pass');
  });

  it('keeps Scuba Gear and Bottled Paper out of event choices', () => {
    const itemChoices = SURVIVAL_EVENTS.flatMap(({ choices }) => (
      choices.flatMap(({ itemId }) => itemId === undefined ? [] : [itemId])
    ));

    expect(itemChoices).not.toContain('scubaSet');
    expect(itemChoices).not.toContain('bottledPaper');
  });

  it('sets supernatural event pressure bounds and effects', () => {
    const byId = Object.fromEntries(SURVIVAL_EVENTS.map((event) => [event.id, event]));
    const manInTheFog = byId['man-in-the-fog'];

    expect(byId['man-in-the-fog']?.minimumPressure).toBe(1);
    expect(byId.ghosts?.minimumPressure).toBe(1);
    expect(byId['eerie-melody']?.minimumPressure).toBe(2);
    expect(byId['face-on-the-moon']?.minimumPressure).toBe(3);

    for (const eventId of ['man-in-the-fog', 'face-on-the-moon'] as const) {
      const serialized = JSON.stringify(byId[eventId]?.choices);
      expect(serialized).not.toContain('rescueProgress');
    }

    const outcomeResources = (choiceId: string) => manInTheFog?.choices
      .find(({ id }) => id === choiceId)?.outcomes.map(({ effects }) => effects.resources ?? []);
    expect(outcomeResources('spyglass')).toEqual([[add('pressure', 1)]]);
    expect(outcomeResources('flashlight')).toEqual([
      [add('pressure', 2), subtract('health', 20)],
      [add('pressure', 2)],
    ]);
    expect(outcomeResources('sleep')).toEqual([
      [add('pressure', 1), subtract('hull', { min: 10, max: 30 })],
      [add('pressure', 1), subtract('health', 20)],
    ]);
    expect(manInTheFog?.choices.find(({ id }) => id === 'flashlight')?.outcomes[0]?.effects)
      .toMatchObject({ nextDawnEnergy: 1 });
    expect(manInTheFog?.choices.find(({ id }) => id === 'sleep')?.outcomes[1]?.effects)
      .toMatchObject({ nextDawnEnergy: 2 });

    expect(manInTheFog?.choices.find(({ id }) => id === 'compass')?.outcomes).toEqual([{
      weight: 1,
      message: 'The compass keeps the boat on a steady bearing.',
      effects: { resources: [subtract('pressure', 1)] },
    }]);
    expect(byId.ghosts?.choices.find(({ id }) => id === 'flareGun')?.outcomes).toEqual([{
      weight: 1,
      message: 'The flare drives the pale shapes into the dark.',
      effects: {
        resources: [subtract('pressure', 1)],
        items: [{ kind: 'consume', itemId: 'flareGun', quantity: 1 }],
      },
    }]);
    expect(byId['eerie-melody']?.choices.find(({ id }) => id === 'ductTape')?.outcomes).toEqual([{
      weight: 1,
      message: 'The tape blocks the melody until it fades.',
      effects: {
        resources: [subtract('pressure', 1)],
        items: [{ kind: 'consume', itemId: 'ductTape', quantity: 1 }],
      },
    }]);
  });

  it('charges one energy to recover the Drifting Bottle without an item', () => {
    const bottle = SURVIVAL_EVENTS.find(({ id }) => id === 'drifting-bottle');

    expect(bottle?.choices.map(({ id, itemId }) => ({ id, itemId }))).toEqual([
      { id: 'retrieve', itemId: undefined },
      { id: 'sleep', itemId: undefined },
    ]);
    const retrieve = bottle?.choices.find(({ id }) => id === 'retrieve');
    expect(retrieve?.requirements).toEqual([{ resource: 'energy', minimum: 1 }]);
    expect(retrieve?.outcomes[0]?.effects).toMatchObject({
      resources: [{ resource: 'energy', operation: 'subtract', value: 1 }],
      items: [{ kind: 'gain', itemId: 'bottledPaper', quantity: 1 }],
    });
  });

  it('encodes the authored Drifting Cargo cost, Handyman response, and fallback labels', () => {
    const event = (id: string) => SURVIVAL_EVENTS.find((candidate) => candidate.id === id)!;
    const retrieve = event('drifting-barrel').choices.find(({ id }) => id === 'retrieve')!;
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
      ['midnight-tour', 'Sail On'],
      ['night-trader', 'Refuse'],
    ].map(([eventId, label]) => (
      event(eventId!).choices.find(({ id }) => id === 'sleep')?.label === label
    ))).toEqual([true, true]);
    expect(event('check-the-back').choices.map(({ id, label }) => [id, label]))
      .toEqual([['check', 'Yes'], ['sleep', 'No']]);
  });

  it.each(['drifting-barrel', 'drifting-chest'] as const)(
    'keeps %s in the catalog as a dawn-only reward event',
    (eventId) => {
    const loot = SURVIVAL_EVENTS.find(({ id }) => id === eventId);

    expect(loot).toMatchObject({
      phase: 'day',
      earliestDay: 3,
      cooldownDays: 3,
    });
    const retrieve = loot?.choices.find(({ id }) => id === 'retrieve');
    expect(retrieve?.label).toBe('Retrieve It');
    expect(retrieve?.requirements).toEqual([{ resource: 'energy', minimum: 3 }]);
    expect(retrieve?.outcomes.map(({ weight }) => weight)).toEqual([45, 25, 20, 10]);
    },
  );

  it('encodes the exact rules and presentation keys for featured events', () => {
    const event = (id: string) => SURVIVAL_EVENTS.find((candidate) => candidate.id === id)!;

    expect(event('drifting-barrel')).toMatchObject({ phase: 'day', weight: 1, earliestDay: 3 });
    expect(event('drifting-chest')).toMatchObject({ phase: 'day', weight: 1, earliestDay: 3 });
    expect(event('drifting-bottle')).toMatchObject({
      phase: 'day',
      weight: 3,
      earliestDay: 2,
      absentItemIds: ['bottledPaper'],
    });
    expect(event('drifting-bottle').maximumAppearances).toBeUndefined();
    expect(event('check-the-back').choices[0]?.outcomes).toMatchObject([
      { weight: 500, presentationKey: 'check-the-back.fish' },
      { weight: 50, presentationKey: 'check-the-back.empty' },
    ]);
    expect(event('check-the-back').choices[0]?.outcomes.map(({ presentationKey }) => presentationKey))
      .toEqual(['check-the-back.fish', 'check-the-back.empty']);
    expect(event('flowers')).toMatchObject({
      weight: 1,
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
    const bottleBase = { ...base, phase: 'day' as const };
    expect(eligibleEvents(SURVIVAL_EVENTS, {
      ...bottleBase,
      inventoryItemIds: new Set(['bottledPaper']),
    }).some(({ id }) => id === 'drifting-bottle')).toBe(false);
    expect(eligibleEvents(SURVIVAL_EVENTS, {
      ...base,
      rescueProgress: 14,
    }).some(({ id }) => id === 'other-people')).toBe(false);
    expect(eligibleEvents(SURVIVAL_EVENTS, {
      ...bottleBase,
      appearanceCounts: new Map([['drifting-bottle', 1]]),
    }).some(({ id }) => id === 'drifting-bottle')).toBe(true);
    expect(eligibleEvents(SURVIVAL_EVENTS, {
      ...base,
      rescueProgress: 15,
      appearanceCounts: new Map([['other-people', 2]]),
    }).some(({ id }) => id === 'other-people')).toBe(false);
    expect(eligibleEvents(SURVIVAL_EVENTS, {
      ...base,
      rescueProgress: 15,
      appearanceCounts: new Map([['other-people', 1]]),
    }).some(({ id }) => id === 'other-people')).toBe(true);
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
      weight: 2,
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

  it('excludes Tentacle Attack from the draw pool without a canonical target', () => {
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
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].resultId = ' '; }, /result ID.*blank/i);
    rejects((catalog) => { catalog[0].weight = 0; }, /event.*weight/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].weight = 0; }, /outcome.*weight/i);
    rejects((catalog) => { catalog[0].choices[0].itemId = 'telescope'; }, /unknown item/i);
    rejects((catalog) => { catalog[0].choices[0].itemId = 'scubaSet'; }, /day-action-only item/i);
    rejects((catalog) => { catalog[0].choices[0].itemId = 'bottledPaper'; }, /day-action-only item/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects.resources = [add('danger', 1)]; }, /unknown resource/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects.resources = [subtract('hull', { min: 4, max: 3 })]; }, /invalid range/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects = null; }, /effects/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects.resources = {}; }, /resources/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects.items = [item('consume', 'telescope')]; }, /unknown item/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects.items = [item('consume', 'ductTape', 1.5)]; }, /quantity/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects.items = [item('break', 'flashlight')]; }, /not breakable/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects.items = [{ kind: 'gainChest', quantity: 1, fallbackFood: 2 }]; }, /fallback food/i);
    rejects((catalog) => { catalog[0].choices[0].requiredChestState = 'open'; }, /required chest state/i);
    rejects((catalog) => { catalog[0].latestDay = 1; }, /day bounds/i);
    rejects((catalog) => { catalog[0].requiresLivingCompanion = 'yes'; }, /living companion.*boolean/i);
    rejects((catalog) => { catalog[0].requiresLivingCompanion = undefined; }, /living companion.*boolean/i);
    rejects((catalog) => { catalog[0].choices[0].companionAction = 'swim'; }, /companion action/i);
    rejects((catalog) => { catalog[0].choices[0].companionAction = undefined; }, /companion action/i);
    rejects((catalog) => {
      catalog[0].choices[0].outcomes[0].effects.companion = [
        { kind: 'sickness', operation: 'subtract', value: 1 },
      ];
    }, /companion sickness operation/i);
    rejects((catalog) => {
      catalog[0].choices[0].outcomes[0].effects.companion = [
        { kind: 'sickness', operation: 'add', value: 1.5 },
      ];
    }, /companion sickness value/i);
  });

  it.each([
    ['missing', undefined],
    ['unknown', 'fatal'],
  ])('rejects %s event danger', (_case, danger) => {
    const catalog = structuredClone(SURVIVAL_EVENTS) as any[];
    if (danger === undefined) delete catalog[0].danger;
    else catalog[0].danger = danger;

    expect(() => validateSurvivalEventCatalog(catalog)).toThrow(/danger.*invalid/i);
  });

  it('rejects an immediate energy change in a night outcome', () => {
    const catalog = structuredClone(SURVIVAL_EVENTS) as any[];
    catalog[0].choices[0].outcomes[0].effects.resources = [subtract('energy', 1)];

    expect(() => validateSurvivalEventCatalog(catalog))
      .toThrow(/immediate energy.*night event/i);
  });

  it.each([-1, 1.5, 4])(
    'rejects next dawn energy outside zero through three: %s',
    (nextDawnEnergy) => {
      const catalog = structuredClone(SURVIVAL_EVENTS) as any[];
      catalog[0].choices[0].outcomes[0].effects.nextDawnEnergy = nextDawnEnergy;

      expect(() => validateSurvivalEventCatalog(catalog))
        .toThrow(/nextDawnEnergy.*integer.*zero through three/i);
    },
  );

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

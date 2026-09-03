// Importance: 10/10 (scaled from 5/5). Protects event eligibility and schema rules.
import { describe, expect, it } from 'vitest';
import type { ItemId } from '../src/game/ItemState';
import {
  SURVIVAL_EVENTS,
  survivalEventById,
} from '../src/survival/eventCatalog';
import { validateSurvivalEventCatalog } from '../src/survival/eventCatalogValidation';
import { drawWeightedEvent, eligibleEvents } from '../src/survival/eventSelection';
import { sequenceRandom } from './helpers/random';
import type {
  IntegerValue,
  SurvivalEventDefinition,
  WeightedEventOutcome,
} from '../src/survival/survivalTypes';



const resource = (resourceName: string, operation: string, value: unknown) => ({
  resource: resourceName, operation, value,
});
const add = (name: string, value: unknown) => resource(name, 'add', value);
const subtract = (name: string, value: unknown) => resource(name, 'subtract', value);
const item = (kind: string, itemId: string, quantity = 1) => ({ kind, itemId, quantity });

function maximumValue(value: IntegerValue): number {
  return typeof value === 'number' ? value : value.max;
}

function maximumLoss(
  outcome: WeightedEventOutcome,
  resourceName: 'health' | 'hull',
): number {
  return (outcome.effects.resources ?? [])
    .filter((effect) => (
      effect.resource === resourceName && effect.operation === 'subtract'
    ))
    .reduce((sum, effect) => sum + maximumValue(effect.value), 0);
}



const weightedTestEvent = (
  id: string,
  danger: SurvivalEventDefinition['danger'],
): SurvivalEventDefinition => ({
  id,
  phase: 'night',
  title: id,
  revealText: id,
  prompt: 'Choose.',
  danger,
  earliestDay: 1,
  weight: 1,
  cooldownDays: 0,
  choices: [{
    id: 'sleep',
    label: 'Sleep',
    outcomes: [{ weight: 1, message: 'Done.', effects: {} }],
  }],
  cue: 'none',
});

describe('survival events', () => {
  it('caps ordinary outcome damage at sixty per meter', () => {
    for (const eventEntry of SURVIVAL_EVENTS) {
      for (const choice of eventEntry.choices) {
        for (const result of choice.outcomes) {
          expect(
            maximumLoss(result, 'health'),
            `${eventEntry.id}.${choice.id} Health`,
          ).toBeLessThanOrEqual(60);
          expect(
            maximumLoss(result, 'hull'),
            `${eventEntry.id}.${choice.id} Hull`,
          ).toBeLessThanOrEqual(60);
        }
      }
    }
  });

  it('uses the reduced Eerie Melody damage ranges', () => {
    const melody = survivalEventById('eerie-melody')!;
    const spyglass = melody.choices.find(({ id }) => id === 'spyglass')!.outcomes[0]!;
    const umbrella = melody.choices.find(({ id }) => id === 'umbrella')!.outcomes[1]!;
    const sleep = melody.choices.find(({ id }) => id === 'sleep')!.outcomes[1]!;

    expect(spyglass.effects.resources).toEqual([
      subtract('hull', { min: 30, max: 40 }),
      subtract('health', 20),
    ]);
    expect(umbrella.effects.resources).toEqual([
      subtract('hull', { min: 25, max: 35 }),
    ]);
    expect(sleep.effects.resources).toEqual([
      subtract('hull', { min: 30, max: 40 }),
      subtract('health', 20),
    ]);
  });

  it('keeps one no-item response on every event', () => {
    for (const eventEntry of SURVIVAL_EVENTS) {
      expect(
        eventEntry.choices.some(({ itemId }) => itemId === undefined),
        eventEntry.id,
      ).toBe(true);
    }
  });

  it('limits random item loss to one', () => {
    for (const eventEntry of SURVIVAL_EVENTS) {
      for (const choice of eventEntry.choices) {
        for (const result of choice.outcomes) {
          const randomLoss = (result.effects.items ?? [])
            .filter(({ kind }) => kind === 'loseRandom')
            .reduce((sum, mutation) => sum + mutation.quantity, 0);
          expect(randomLoss, `${eventEntry.id}.${choice.id}`).toBeLessThanOrEqual(1);
        }
      }
    }
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
    expect(survivalEventById('sick-companion')).toBeUndefined();
    expect(survivalEventById('shadow-figure')).toMatchObject({
      earliestDay: 20, minimumPressure: 3, weight: 1, cooldownDays: 30,
      requiresLivingCompanion: true,
    });
    expect(survivalEventById('guarded-sleep')).toMatchObject({
      earliestDay: 7, weight: 4, cooldownDays: 4, requiresLivingCompanion: true,
    });
    expect(survivalEventById('swarm-of-sharks')?.requiresLivingCompanion).toBeUndefined();

    const criteria = {
      phase: 'night' as const,
      day: 30,
      weather: 'calm' as const,
      lastEventId: null,
      lastSeenDay: new Map<string, number>(),
      targetableItemIds: new Set<ItemId>(),
      appearanceCounts: new Map<string, number>(),
      inventoryItemIds: new Set<ItemId>(),
      rescueLead: 0,
      pressure: 4,
    };
    const companionEvents = ['shadow-figure', 'guarded-sleep'];
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






  it.each(['drifting-supplies', 'drifting-chest'] as const)(
    'keeps %s in the catalog as a dawn-only cargo event',
    (eventId) => {
    const loot = SURVIVAL_EVENTS.find(({ id }) => id === eventId);

    expect(loot).toMatchObject({
      phase: 'day',
      earliestDay: 3,
      cooldownDays: 3,
    });
    const retrieve = loot?.choices.find(({ id }) => id === 'retrieve');
    expect(retrieve?.label).toBe(
      eventId === 'drifting-supplies' ? 'Retrieve Supplies' : 'Retrieve It',
    );
    expect(retrieve?.requirements).toEqual([{ resource: 'energy', minimum: 3 }]);
    expect(retrieve?.outcomes).toHaveLength(eventId === 'drifting-supplies' ? 10 : 1);
    },
  );

  it('blocks one-time, absent-item, and rescue-lead events', () => {
    const base = {
      phase: 'night' as const, day: 20, weather: 'calm' as const, lastEventId: null,
      lastSeenDay: new Map<string, number>(), targetableItemIds: new Set<ItemId>(),
      appearanceCounts: new Map<string, number>(), inventoryItemIds: new Set<ItemId>(), rescueLead: 0,
    };
    expect(eligibleEvents(SURVIVAL_EVENTS, {
      ...base,
      rescueLead: 1,
    }).some(({ id }) => id === 'other-people')).toBe(false);
    expect(eligibleEvents(SURVIVAL_EVENTS, {
      ...base,
      rescueLead: 2,
      appearanceCounts: new Map([['other-people', 2]]),
    }).some(({ id }) => id === 'other-people')).toBe(false);
    expect(eligibleEvents(SURVIVAL_EVENTS, {
      ...base,
      rescueLead: 2,
      appearanceCounts: new Map([['other-people', 1]]),
    }).some(({ id }) => id === 'other-people')).toBe(true);
  });

  it('allows Check the Back only when no chest occupies the stern', () => {
    const eligible = (chestState: 'none' | 'closed' | 'mimic') => eligibleEvents(
      SURVIVAL_EVENTS,
      {
        phase: 'night', day: 20, weather: 'calm', lastEventId: null,
        lastSeenDay: new Map(), targetableItemIds: new Set(),
        appearanceCounts: new Map(), inventoryItemIds: new Set(), rescueLead: 0,
        chestState,
      },
    ).some(({ id }) => id === 'check-the-back');

    expect(eligible('none')).toBe(true);
    expect(eligible('closed')).toBe(false);
    expect(eligible('mimic')).toBe(false);
  });

  it('filters by phase, day bounds, immediate repeat, and cooldown', () => {
    const events = eligibleEvents(SURVIVAL_EVENTS, {
      phase: 'night', day: 9, weather: 'calm', lastEventId: 'school-of-fish',
      lastSeenDay: new Map([['death-stare', 8], ['leak', 8]]),
      targetableItemIds: new Set(['anchor']),
      appearanceCounts: new Map(), inventoryItemIds: new Set(), rescueLead: 0,
    });
    expect(events.every((event) => event.phase === 'night' && event.earliestDay <= 9)).toBe(true);
    expect(events.map((event) => event.id)).not.toContain('school-of-fish');
    expect(events.map((event) => event.id)).not.toContain('death-stare');
    expect(events.map((event) => event.id)).toContain('leak');
    expect(eligibleEvents(SURVIVAL_EVENTS, {
      phase: 'night', day: 9, weather: 'calm', lastEventId: null,
      lastSeenDay: new Map(), targetableItemIds: new Set(['anchor']),
      appearanceCounts: new Map(), inventoryItemIds: new Set(), rescueLead: 0,
      excludedIds: new Set(['leak']),
    }).map((event) => event.id)).not.toContain('leak');
    expect(eligibleEvents(SURVIVAL_EVENTS, {
      phase: 'night', day: 31, weather: 'calm', lastEventId: null, lastSeenDay: new Map(),
      targetableItemIds: new Set(['anchor']),
      appearanceCounts: new Map(), inventoryItemIds: new Set(), rescueLead: 0,
    }).map((event) => event.id)).not.toContain('dangerous-waters');
  });

  it('limits Dangerous Waters to one appearance per run', () => {
    expect(eligibleEvents(SURVIVAL_EVENTS, {
      phase: 'night', day: 12, weather: 'calm', lastEventId: null,
      lastSeenDay: new Map(), targetableItemIds: new Set(),
      appearanceCounts: new Map([['dangerous-waters', 1]]),
      inventoryItemIds: new Set(), rescueLead: 0,
    }).map(({ id }) => id)).not.toContain('dangerous-waters');
  });

  it('excludes Tentacle Attack from the draw pool without a canonical target', () => {
    const eligible = (targetableItemIds: ReadonlySet<ItemId>) => eligibleEvents(SURVIVAL_EVENTS, {
      phase: 'night', day: 8, weather: 'calm', lastEventId: null, lastSeenDay: new Map(),
      targetableItemIds,
      appearanceCounts: new Map(), inventoryItemIds: new Set(), rescueLead: 0,
    });

    expect(eligible(new Set()).map(({ id }) => id)).not.toContain('snatcher');
    expect(eligible(new Set(['baitTin', 'fishingNet'])).map(({ id }) => id)).not.toContain('snatcher');
    expect(eligible(new Set(['cannedFood'])).map(({ id }) => id)).toContain('snatcher');
  });

  it('limits Tentacle Attack responses to weapons and sleep', () => {
    const event = SURVIVAL_EVENTS.find(({ id }) => id === 'snatcher');

    expect(event?.choices.map(({ id }) => id)).toEqual([
      'knife', 'shotgun', 'flareGun', 'sleep',
    ]);
  });

  it('limits Chest Attack outcomes to its automatic attack and Knife mitigation', () => {
    const event = SURVIVAL_EVENTS.find(({ id }) => id === 'chest-attack');

    expect(event?.choices.map(({ id }) => id)).toEqual(['knife', 'attack']);
  });

  it('draws by stable weighted boundaries and returns a quiet fallback for an empty pool', () => {
    const pool = SURVIVAL_EVENTS.filter((event) => event.phase === 'night').slice(0, 2);
    const eligibility = (phase: 'day' | 'night') => ({
      phase,
      day: 10,
      weather: 'calm' as const,
      lastEventId: null,
      lastSeenDay: new Map<string, number>(),
      targetableItemIds: new Set<ItemId>(),
      appearanceCounts: new Map<string, number>(),
      inventoryItemIds: new Set<ItemId>(),
      rescueLead: 0,
    });
    expect(drawWeightedEvent(sequenceRandom([0]), pool, eligibility('night')).id).toBe(pool[0]!.id);
    expect(drawWeightedEvent(
      sequenceRandom([pool[0]!.weight / (pool[0]!.weight + pool[1]!.weight)]),
      pool,
      eligibility('night'),
    ).id).toBe(pool[1]!.id);
    expect(drawWeightedEvent(sequenceRandom([0]), [], eligibility('day')).id)
      .toBe('day-calm-fallback');
    expect(drawWeightedEvent(sequenceRandom([0]), [], eligibility('night')).id)
      .toBe('night-calm-fallback');
  });

  it('uses pressure-adjusted dangerous weights', () => {
    const safe = weightedTestEvent('safe-test', 'safe');
    const dangerous = weightedTestEvent('danger-test', 'dangerous');
    const eligibility = (pressure: number) => ({
      phase: 'night' as const,
      day: 10,
      weather: 'calm' as const,
      lastEventId: null,
      lastSeenDay: new Map<string, number>(),
      targetableItemIds: new Set<ItemId>(),
      appearanceCounts: new Map<string, number>(),
      inventoryItemIds: new Set<ItemId>(),
      rescueLead: 0,
      pressure,
    });
    expect(drawWeightedEvent(sequenceRandom([0.4]), [safe, dangerous], eligibility(0)).id)
      .toBe('safe-test');
    expect(drawWeightedEvent(sequenceRandom([0.4]), [safe, dangerous], eligibility(4)).id)
      .toBe('danger-test');
  });

  it('rejects malformed event IDs, choice IDs, weights, effects, mutations, and day bounds', () => {
    const rejects = (mutate: (catalog: any[]) => void, expected: RegExp) => {
      const catalog = structuredClone(SURVIVAL_EVENTS) as any[];
      mutate(catalog);
      expect(() => validateSurvivalEventCatalog(catalog)).toThrow(expected);
    };

    expect(() => validateSurvivalEventCatalog(SURVIVAL_EVENTS)).not.toThrow();
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
    rejects((catalog) => { catalog[0].choices[0].itemId = 'radio'; }, /event-choice-excluded item/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects.resources = [add('danger', 1)]; }, /unknown resource/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects.resources = [subtract('hull', { min: 4, max: 3 })]; }, /invalid range/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects = null; }, /effects/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects.resources = {}; }, /resources/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects.items = [item('consume', 'telescope')]; }, /unknown item/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects.items = [item('consume', 'ductTape', 1.5)]; }, /quantity/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects.items = [{ kind: 'loseRandom', quantity: 2 }]; }, /loseRandom.*one/i);
    rejects((catalog) => {
      catalog[0].choices[0].outcomes[0].effects.items = [
        { kind: 'loseRandom', quantity: 1 },
        { kind: 'loseRandom', quantity: 1 },
      ];
    }, /loseRandom.*one/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects.items = [item('break', 'radio')]; }, /not breakable/i);
    rejects((catalog) => { catalog[0].choices[0].outcomes[0].effects.items = [{ kind: 'gainChest', quantity: 1, fallbackFood: 2 }]; }, /fallback food/i);
    rejects((catalog) => { catalog[0].choices[0].requiredChestState = 'open'; }, /required chest state/i);
    rejects((catalog) => { catalog[0].latestDay = 1; }, /day bounds/i);
    rejects((catalog) => { catalog[0].requiresLivingCompanion = 'yes'; }, /living companion.*boolean/i);
    rejects((catalog) => { catalog[0].requiresLivingCompanion = undefined; }, /living companion.*boolean/i);
    rejects((catalog) => { catalog[0].choices[0].companionAction = 'swim'; }, /companion action/i);
    rejects((catalog) => { catalog[0].choices[0].companionAction = undefined; }, /companion action/i);
    rejects((catalog) => {
      catalog[0].choices[0].companionAction = { id: 'swim', energyCost: 3 };
    }, /companion action.*invalid/i);
    rejects((catalog) => {
      catalog[0].choices[0].companionAction = { id: 'delegateCarlitos', energyCost: 0 };
    }, /companion action.*energy cost/i);
    rejects((catalog) => { catalog[0].choices.at(-1).itemId = 'bucket'; }, /no-item response/i);
    rejects((catalog) => {
      catalog[0].choices[0].outcomes[0].effects.resources = [
        subtract('hull', 40),
        subtract('hull', { min: 10, max: 21 }),
      ];
    }, /more than 60 hull/i);
    rejects((catalog) => {
      catalog[0].choices[0].outcomes[0].effects.resources = [subtract('health', 61)];
    }, /more than 60 health/i);
    rejects((catalog) => {
      catalog[0].choices[0].outcomes[0].effects.companion = [];
    }, /unsupported effect key companion/i);
  });

  it('allows scuba gear in events and keeps radio excluded', () => {
    const scubaCatalog = structuredClone(SURVIVAL_EVENTS) as any[];
    scubaCatalog[0].choices[0].itemId = 'scubaSet';
    expect(() => validateSurvivalEventCatalog(scubaCatalog)).not.toThrow();

    const radioCatalog = structuredClone(SURVIVAL_EVENTS) as any[];
    radioCatalog[0].choices[0].itemId = 'radio';
    expect(() => validateSurvivalEventCatalog(radioCatalog))
      .toThrow(/event-choice-excluded item/i);
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

  it.each([-1, 1.5, 5])(
    'rejects next dawn energy outside zero through four: %s',
    (nextDawnEnergy) => {
      const catalog = structuredClone(SURVIVAL_EVENTS) as any[];
      catalog[0].choices[0].outcomes[0].effects.nextDawnEnergy = nextDawnEnergy;

      expect(() => validateSurvivalEventCatalog(catalog))
      .toThrow(/nextDawnEnergy.*integer.*zero through four/i);
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
    rejectsEffects({ rescue: undefined }, /unsupported effect key rescue/i);
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
    rejectsResource({ resource: 'rescueLead', operation: 'set', value: 1 }, /rescue lead.*add/i);
    rejectsResource({ resource: 'rescueLead', operation: 'add', value: 0 }, /invalid resource value/i);
    rejectsResource({ resource: 'rescueLead', operation: 'add', value: 9 }, /rescue lead.*one through eight/i);
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

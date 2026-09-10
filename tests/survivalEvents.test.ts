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
  SurvivalEventDefinition,
} from '../src/survival/survivalTypes';



const resource = (resourceName: string, operation: string, value: unknown) => ({
  resource: resourceName, operation, value,
});
const add = (name: string, value: unknown) => resource(name, 'add', value);
const subtract = (name: string, value: unknown) => resource(name, 'subtract', value);
const item = (kind: string, itemId: string, quantity = 1) => ({ kind, itemId, quantity });



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

  it('defines Carlitos event gates and living-companion eligibility', () => {
    expect(survivalEventById('sick-companion')).toBeUndefined();
    expect(survivalEventById('shadow-figure')).toMatchObject({
      earliestDay: 20, minimumPressure: 3, weight: 1, cooldownDays: 3,
      requiresCompanion: true,
    });
    expect(survivalEventById('guarded-sleep')).toMatchObject({
      earliestDay: 7, weight: 4, cooldownDays: 0, requiresCompanion: true,
      maximumAppearances: 1,
    });
    expect(survivalEventById('swarm-of-sharks')?.requiresCompanion).toBeUndefined();

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
      hasCompanion: false,
    }).map(({ id }) => id);
    expect(companionEvents.every((id) => !absent.includes(id))).toBe(true);

    const living = eligibleEvents(SURVIVAL_EVENTS, {
      ...criteria,
      hasCompanion: true,
    }).map(({ id }) => id);
    expect(companionEvents.every((id) => living.includes(id))).toBe(true);
  });

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

  it('draws by stable weighted boundaries and rejects an empty night pool', () => {
    const pool = SURVIVAL_EVENTS.filter((event) => ['dangerous-waters', 'leak'].includes(event.id));
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
    expect(() => drawWeightedEvent(sequenceRandom([0]), [], eligibility('night')))
      .toThrow('No eligible night event on day 10.');
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
    rejects((catalog) => { catalog[0].requiresCompanion = 'yes'; }, /companion.*boolean/i);
    rejects((catalog) => { catalog[0].requiresCompanion = undefined; }, /companion.*boolean/i);
    rejects((catalog) => { catalog[0].choices[0].companionAction = 'swim'; }, /companion action/i);
    rejects((catalog) => { catalog[0].choices[0].companionAction = undefined; }, /companion action/i);
    rejects((catalog) => {
      catalog[0].choices[0].companionAction = { id: 'swim' };
    }, /companion action.*invalid/i);
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

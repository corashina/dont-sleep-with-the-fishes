// Importance: 10/10. Protects exhaustive event adapter routing and family delegation.
import { Group } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import type { EventPresentationAdapter } from '../src/survival/EventPresentationAdapter';
import {
  EventPresentationRegistry,
  type EventPresentationAdapterFactory,
} from '../src/survival/EventPresentationRegistry';
import {
  SURVIVAL_EVENT_IDS,
  type SurvivalEventId,
} from '../src/survival/eventCatalog';
import {
  EVENT_PRESENTATION_ROUTES,
  type EventPresentationRoute,
} from '../src/survival/eventPresentationRoutes';
import type { EventPresentationAdapterDependencies } from '../src/survival/eventPresentationAdapters';
import type {
  EventPresentationContext,
  EventPresentationReaction,
} from '../src/survival/eventPresentationTypes';
import type {
  EventChoicePresentation,
  FocusedEventInteractionTarget,
} from '../src/survival/FocusedEventPresentation';

const constructors = vi.hoisted(() => ({
  layer: vi.fn(),
  coordinator: vi.fn(),
  featured: vi.fn(),
  weather: vi.fn(),
  supernatural: vi.fn(),
  moon: vi.fn(),
  leak: vi.fn(),
  schoolOfFish: vi.fn(),
  snatcher: vi.fn(),
  deathStare: vi.fn(),
  sharks: vi.fn(),
  tornado: vi.fn(),
  carlitos: vi.fn(),
  wreckage: vi.fn(),
}));

vi.mock('../src/survival/EventPresentationLayer', () => ({
  EventPresentationLayer: constructors.layer,
}));
vi.mock('../src/survival/EventPresentationCoordinator', () => ({
  EventPresentationCoordinator: constructors.coordinator,
}));
vi.mock('../src/survival/FeaturedEventPresentations', () => ({
  FeaturedEventPresentations: constructors.featured,
}));
vi.mock('../src/survival/WeatherEventAnimator', () => ({
  WeatherEventAnimator: constructors.weather,
}));
vi.mock('../src/survival/SupernaturalEventAnimator', () => ({
  SupernaturalEventAnimator: constructors.supernatural,
}));
vi.mock('../src/survival/MoonEventPresentation', () => ({
  MoonEventPresentation: constructors.moon,
}));
vi.mock('../src/survival/events/LeakPresentation', () => ({
  LeakPresentation: constructors.leak,
}));
vi.mock('../src/survival/events/SchoolOfFishPresentation', () => ({
  SchoolOfFishPresentation: constructors.schoolOfFish,
}));
vi.mock('../src/survival/events/SnatcherPresentation', () => ({
  SnatcherPresentation: constructors.snatcher,
}));
vi.mock('../src/survival/events/DeathStarePresentation', () => ({
  DeathStarePresentation: constructors.deathStare,
}));
vi.mock('../src/survival/events/SharkSwarmPresentation', () => ({
  SharkSwarmPresentation: constructors.sharks,
}));
vi.mock('../src/survival/events/TornadoPresentation', () => ({
  TornadoPresentation: constructors.tornado,
}));
vi.mock('../src/survival/events/CarlitosEventPresentation', () => ({
  CarlitosEventPresentation: constructors.carlitos,
}));
vi.mock('../src/survival/events/WreckagePresentation', () => ({
  WreckagePresentation: constructors.wreckage,
}));

function asyncVoid() {
  return vi.fn(async () => undefined);
}

function createLayer() {
  return {
    root: new Group(),
    stage: vi.fn(),
    reveal: asyncVoid(),
    playChoice: asyncVoid(),
    playDangerousWatersItemUse: vi.fn(async () => true),
    itemAimTarget: vi.fn(() => null),
    interactionTargets: vi.fn((): readonly FocusedEventInteractionTarget[] => []),
    interactionRoot: vi.fn(() => null),
    react: asyncVoid(),
    copyDangerousWatersBoatReaction: vi.fn(() => false),
    update: vi.fn(),
    settleForVisibilityChange: vi.fn(),
    setRescueCue: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  };
}

function createCoordinator() {
  return {
    worldRoot: new Group(),
    boatRoot: new Group(),
    stage: vi.fn(() => true),
    reveal: asyncVoid(),
    playChoice: asyncVoid(),
    playItemUse: vi.fn(async () => true),
    itemAimTarget: vi.fn(() => null),
    interactionTargets: vi.fn((): readonly FocusedEventInteractionTarget[] => []),
    interactionRoot: vi.fn((_id: string): Group | null => null),
    react: asyncVoid(),
    update: vi.fn(),
    settleForVisibilityChange: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  };
}

function createFeatured() {
  return {
    root: new Group(),
    stage: vi.fn(),
    reveal: asyncVoid(),
    react: asyncVoid(),
    interactionRoot: vi.fn(() => null),
    itemAimTarget: vi.fn(() => null),
    resultRoot: vi.fn(() => null),
    update: vi.fn(),
    settleForVisibilityChange: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  };
}

function createWeather() {
  return {
    worldRoot: new Group(),
    boatRoot: new Group(),
    stage: vi.fn(),
    supportsItemUse: vi.fn(() => true),
    reveal: asyncVoid(),
    playItemUse: vi.fn(async () => true),
    itemAimTarget: vi.fn(() => null),
    react: asyncVoid(),
    update: vi.fn(),
    settleForVisibilityChange: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  };
}

function createSupernatural() {
  return {
    worldRoot: new Group(),
    stage: vi.fn(),
    supportsItemUse: vi.fn(() => true),
    reveal: asyncVoid(),
    playItemUse: vi.fn(async () => true),
    itemAimTarget: vi.fn(() => null),
    react: asyncVoid(),
    update: vi.fn(),
    settleForVisibilityChange: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  };
}

function createMoon() {
  return {
    itemAimTarget: new Group(),
    stage: vi.fn(),
    reveal: asyncVoid(),
    react: asyncVoid(),
    update: vi.fn(),
    settleForVisibilityChange: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  };
}

function createDedicatedPresentation() {
  return {
    eventId: 'leak',
    worldRoot: new Group(),
    boatRoot: new Group(),
    dispose: vi.fn(),
  };
}

let layer = createLayer();
let coordinator = createCoordinator();
let featured = createFeatured();
let weather = createWeather();
let supernatural = createSupernatural();
let moon = createMoon();

function createDependencies() {
  return {
    dependencies: {
      worldParent: new Group(),
      boatParent: new Group(),
      dedicatedEnvironment: {
        eventModels: {
          create: vi.fn(() => ({
            root: new Group(),
            dispose: vi.fn(),
          })),
          animations: vi.fn(() => []),
          dispose: vi.fn(),
        },
        featuredModels: {},
        dive: {
          play: asyncVoid(),
          clear: vi.fn(),
          settleForVisibilityChange: vi.fn(),
        },
        delegateCarlitos: async (retrieve: () => Promise<void>) => retrieve(),
      },
      focusedDependencies: {
        camera: new Group(),
        cameraRig: new Group(),
        supplyDisplay: {},
      },
      focusedFactories: {},
      featuredModels: {},
      featuredTargets: {
        driftingCargoStern: new Group(),
        flowersDeck: new Group(),
        checkBackStern: new Group(),
      },
      driftingWater: {},
      moon: {},
      registerRescueCueCallback: vi.fn(),
      applyDangerousWatersReaction: vi.fn(),
    } as unknown as EventPresentationAdapterDependencies,
  };
}

function calledFamilyConstructors(): string[] {
  return Object.entries(constructors)
    .filter(([, constructor]) => constructor.mock.calls.length > 0)
    .map(([name]) => name)
    .sort();
}

const context = {
  eventId: 'leak',
  targetInstanceId: null,
  variantSeed: 17,
} as EventPresentationContext;
const choice = {
  choiceId: 'choice',
  instanceId: null,
  condition: null,
} as EventChoicePresentation;
const reaction = {
  outcome: {
    accepted: true,
    deltas: {},
    eventPresentationKey: 'flowers.keep',
  },
  physicalResponse: { choiceId: 'choice', actors: [] },
  result: {
    selectedInstanceId: null,
  },
  choice,
} as unknown as EventPresentationReaction;

beforeEach(() => {
  vi.clearAllMocks();
  layer = createLayer();
  coordinator = createCoordinator();
  featured = createFeatured();
  weather = createWeather();
  supernatural = createSupernatural();
  moon = createMoon();
  constructors.layer.mockImplementation(() => layer);
  constructors.coordinator.mockImplementation(() => coordinator);
  constructors.featured.mockImplementation(() => featured);
  constructors.weather.mockImplementation(() => weather);
  constructors.supernatural.mockImplementation(() => supernatural);
  constructors.moon.mockImplementation(() => moon);
  const presentation = createDedicatedPresentation();
  constructors.leak.mockImplementation(() => presentation);
  constructors.schoolOfFish.mockImplementation(() => presentation);
  constructors.snatcher.mockImplementation(() => presentation);
  constructors.deathStare.mockImplementation(() => presentation);
  constructors.sharks.mockImplementation(() => presentation);
  constructors.tornado.mockImplementation(() => presentation);
  constructors.carlitos.mockImplementation(() => presentation);
  constructors.wreckage.mockImplementation(() => ({
    ...presentation,
    eventId: 'wreckage',
  }));
});

function createAdapter(eventId: SurvivalEventId): EventPresentationAdapter {
  return {
    eventId,
    roots: [],
    stage: vi.fn(),
    reveal: vi.fn(async () => undefined),
    playChoice: vi.fn(async () => undefined),
    playItemUse: vi.fn(async () => false),
    itemAimTarget: vi.fn(() => null),
    interactionTargets: vi.fn(() => []),
    interactionRoot: vi.fn(() => null),
    resultRoot: vi.fn(() => null),
    react: vi.fn(async () => undefined),
    update: vi.fn(),
    settleForVisibilityChange: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('EventPresentationRegistry', () => {
  it('creates every event through its exact route factory', () => {
    const calls = new Map<EventPresentationRoute, SurvivalEventId[]>();
    const factory = (route: EventPresentationRoute): EventPresentationAdapterFactory => (
      eventId,
    ) => {
      const eventIds = calls.get(route) ?? [];
      eventIds.push(eventId);
      calls.set(route, eventIds);
      return createAdapter(eventId);
    };
    const registry = new EventPresentationRegistry({
      dangerousWaters: factory('dangerousWaters'),
      dedicated: factory('dedicated'),
      focused: factory('focused'),
      featured: factory('featured'),
      weather: factory('weather'),
      supernatural: factory('supernatural'),
      moon: factory('moon'),
    });
    const dependencies = {} as EventPresentationAdapterDependencies;

    for (const eventId of SURVIVAL_EVENT_IDS) {
      const adapter = registry.create(eventId, dependencies);
      expect(adapter.eventId).toBe(eventId);
      adapter.dispose();
    }

    for (const eventId of SURVIVAL_EVENT_IDS) {
      expect(calls.get(EVENT_PRESENTATION_ROUTES[eventId])).toContain(eventId);
    }
    expect(() => registry.create('missing' as SurvivalEventId, dependencies))
      .toThrow('Missing event presentation factory: missing');
  });

  it('creates and disposes a default adapter for every event', () => {
    const registry = new EventPresentationRegistry();
    const { dependencies } = createDependencies();
    for (const eventId of SURVIVAL_EVENT_IDS) {
      const adapter = registry.create(eventId, dependencies);
      expect(adapter.eventId).toBe(eventId);
      adapter.dispose();
    }
  });

  it('passes owned model results through the borrowed library', () => {
    const containerShip = {
      root: new Group(),
      dispose: vi.fn(),
    };
    const create = vi.fn(() => containerShip);
    const { dependencies: defaults } = createDependencies();
    const dependencies = {
      ...defaults,
      dedicatedEnvironment: {
        ...defaults.dedicatedEnvironment,
        eventModels: {
          create,
          animations: vi.fn(() => []),
          dispose: vi.fn(),
        },
      },
    } as unknown as EventPresentationAdapterDependencies;

    const adapter = new EventPresentationRegistry().create('wreckage', dependencies);

    const environment = constructors.wreckage.mock.calls[0]![0];
    const forwarded = environment.eventModels.create('containerShip');
    expect(forwarded).toBe(containerShip);
    forwarded.dispose();
    expect(create).toHaveBeenCalledWith('containerShip');
    expect(containerShip.dispose).toHaveBeenCalledOnce();
    adapter.dispose();
  });

  it('delegates the dangerous-waters lifecycle to its layer', async () => {
    const { dependencies } = createDependencies();
    const adapter = new EventPresentationRegistry().create('dangerous-waters', dependencies);
    const routeContext: EventPresentationContext = {
      ...context,
      eventId: 'dangerous-waters',
    };
    adapter.stage(routeContext);
    await adapter.reveal();
    await adapter.playChoice(choice);
    await adapter.playItemUse('choice', 'map-1' as ItemInstanceId);
    await adapter.react(reaction);
    adapter.clear();
    adapter.dispose();
    expect(layer.stage).toHaveBeenCalledWith('dangerous-waters', 17);
    expect(layer.reveal).toHaveBeenCalledWith('dangerous-waters');
    expect(layer.playChoice).toHaveBeenCalledWith('dangerous-waters', 'choice');
    expect(layer.playDangerousWatersItemUse).toHaveBeenCalledWith('choice', 'map-1');
    expect(layer.react).toHaveBeenCalledWith('dangerous-waters', reaction.outcome);
    expect(layer.clear).toHaveBeenCalledOnce();
    expect(layer.dispose).toHaveBeenCalledOnce();
  });

  it('does not replay a dangerous-waters item choice after its item motion', async () => {
    const { dependencies } = createDependencies();
    const adapter = new EventPresentationRegistry().create('dangerous-waters', dependencies);
    const itemChoice = {
      choiceId: 'map',
      instanceId: 'map-1' as ItemInstanceId,
      condition: 'usable',
    } as const;

    await adapter.playItemUse(itemChoice.choiceId, itemChoice.instanceId);
    await adapter.playChoice(itemChoice);

    expect(layer.playDangerousWatersItemUse).toHaveBeenCalledOnce();
    expect(layer.playChoice).not.toHaveBeenCalled();
  });

  it('delegates the dedicated lifecycle to its coordinator', async () => {
    const { dependencies } = createDependencies();
    const adapter = new EventPresentationRegistry().create('leak', dependencies);
    adapter.stage(context);
    await adapter.reveal();
    await adapter.playChoice(choice);
    await adapter.playItemUse('choice', 'bucket-1' as ItemInstanceId);
    await adapter.react(reaction);
    adapter.clear();
    adapter.dispose();
    expect(coordinator.stage).toHaveBeenCalledWith(context);
    expect(coordinator.reveal).toHaveBeenCalledOnce();
    expect(coordinator.playChoice).toHaveBeenCalledWith('choice');
    expect(coordinator.playItemUse).toHaveBeenCalledWith('choice', 'bucket-1');
    expect(coordinator.react).toHaveBeenCalledWith(reaction.result);
    expect(coordinator.clear).toHaveBeenCalledOnce();
    expect(coordinator.dispose).toHaveBeenCalledOnce();
  });

  it('delegates the focused lifecycle to its layer', async () => {
    const { dependencies } = createDependencies();
    const targets = [{
      id: 'custom:focused',
      label: 'FOCUSED',
      description: 'Focused target.',
      choiceId: 'focus',
      root: new Group(),
    }];
    layer.interactionTargets.mockReturnValue(targets);
    const adapter = new EventPresentationRegistry().create('chest-attack', dependencies);
    expect(adapter.interactionTargets()).toBe(targets);
    adapter.stage({ ...context, eventId: 'chest-attack' });
    await adapter.reveal();
    await adapter.playChoice(choice);
    await adapter.playItemUse('choice', 'shotgun-1' as ItemInstanceId);
    await adapter.react(reaction);
    adapter.clear();
    adapter.dispose();
    expect(layer.stage).toHaveBeenCalledWith('chest-attack', 17);
    expect(layer.interactionTargets).toHaveBeenCalledWith('chest-attack');
    expect(layer.reveal).toHaveBeenCalledWith('chest-attack');
    expect(layer.playChoice).toHaveBeenCalledWith('chest-attack', choice);
    expect(layer.react).toHaveBeenCalledWith('chest-attack', reaction.outcome);
    expect(layer.clear).toHaveBeenCalledOnce();
    expect(layer.dispose).toHaveBeenCalledOnce();
  });

  it('delegates the featured lifecycle to its family', async () => {
    const { dependencies } = createDependencies();
    const adapter = new EventPresentationRegistry().create('drifting-supplies', dependencies);
    adapter.stage({ ...context, eventId: 'drifting-supplies' });
    await adapter.reveal();
    await adapter.playChoice(choice);
    await adapter.playItemUse('choice', 'map-1' as ItemInstanceId);
    await adapter.react(reaction);
    adapter.clear();
    adapter.dispose();
    expect(featured.stage).toHaveBeenCalledWith('drifting-supplies', 17);
    expect(featured.reveal).toHaveBeenCalledWith('drifting-supplies');
    expect(featured.react).toHaveBeenCalledWith(
      'drifting-supplies',
      reaction.outcome.eventPresentationKey,
    );
    expect(featured.clear).toHaveBeenCalledOnce();
    expect(featured.dispose).toHaveBeenCalledOnce();
  });

  it('delegates weather to its layer and animator in existing order', async () => {
    const calls: string[] = [];
    layer.clear.mockImplementation(() => calls.push('layer.clear'));
    weather.clear.mockImplementation(() => calls.push('weather.clear'));
    layer.dispose.mockImplementation(() => calls.push('layer.dispose'));
    weather.dispose.mockImplementation(() => calls.push('weather.dispose'));
    const { dependencies } = createDependencies();
    const adapter = new EventPresentationRegistry().create('shower-night', dependencies);
    adapter.stage({ ...context, eventId: 'shower-night' });
    await adapter.reveal();
    await adapter.playChoice(choice);
    await adapter.playItemUse('umbrella', 'umbrella-1' as ItemInstanceId);
    await adapter.react(reaction);
    adapter.clear();
    adapter.dispose();
    expect(layer.stage).toHaveBeenCalledWith('shower-night', 17);
    expect(weather.stage).toHaveBeenCalledWith('shower-night', 17);
    expect(layer.reveal).toHaveBeenCalledWith('shower-night');
    expect(weather.reveal).toHaveBeenCalledWith('shower-night');
    expect(weather.playItemUse).toHaveBeenCalledWith(
      'shower-night',
      'umbrella',
      'umbrella-1',
    );
    expect(layer.react).toHaveBeenCalledWith('shower-night', reaction.outcome);
    expect(weather.react).toHaveBeenCalledWith(
      'shower-night',
      reaction.outcome,
      reaction.physicalResponse,
      null,
    );
    expect(calls).toEqual([
      'layer.clear',
      'weather.clear',
      'layer.dispose',
      'weather.dispose',
    ]);
  });

  it('delegates supernatural to its layer and animator', async () => {
    const { dependencies } = createDependencies();
    const adapter = new EventPresentationRegistry().create('ghosts', dependencies);
    adapter.stage({ ...context, eventId: 'ghosts' });
    await adapter.reveal();
    await adapter.playChoice(choice);
    await adapter.playItemUse('flareGun', 'flareGun-1' as ItemInstanceId);
    await adapter.react(reaction);
    adapter.clear();
    adapter.dispose();
    expect(layer.stage).toHaveBeenCalledWith('ghosts', 17);
    expect(supernatural.stage).toHaveBeenCalledWith('ghosts');
    expect(layer.reveal).toHaveBeenCalledWith('ghosts');
    expect(supernatural.reveal).toHaveBeenCalledWith('ghosts');
    expect(supernatural.playItemUse).toHaveBeenCalledWith(
      'ghosts',
      'flareGun',
      'flareGun-1',
    );
    expect(layer.react).toHaveBeenCalledWith('ghosts', reaction.outcome);
    expect(supernatural.react).toHaveBeenCalledWith(
      'ghosts',
      reaction.outcome,
      reaction.physicalResponse,
      null,
    );
    expect(layer.clear).toHaveBeenCalledOnce();
    expect(supernatural.clear).toHaveBeenCalledOnce();
    expect(layer.dispose).toHaveBeenCalledOnce();
    expect(supernatural.dispose).toHaveBeenCalledOnce();
  });

  it('keeps unsupported animator item use on the shared fallback path', async () => {
    weather.supportsItemUse.mockReturnValue(false);
    supernatural.supportsItemUse.mockReturnValue(false);
    const { dependencies } = createDependencies();
    const weatherAdapter = new EventPresentationRegistry().create(
      'shower-night',
      dependencies,
    );
    const supernaturalAdapter = new EventPresentationRegistry().create(
      'ghosts',
      dependencies,
    );
    await expect(weatherAdapter.playItemUse('sleep', 'map-1' as ItemInstanceId))
      .resolves.toBe(false);
    await expect(supernaturalAdapter.playItemUse('sleep', 'map-1' as ItemInstanceId))
      .resolves.toBe(false);
    expect(weather.playItemUse).not.toHaveBeenCalled();
    expect(supernatural.playItemUse).not.toHaveBeenCalled();
  });

  it('owns one moon presenter and delegates its normalized lifecycle directly', async () => {
    const { dependencies } = createDependencies();
    const adapter = new EventPresentationRegistry().create('face-on-the-moon', dependencies);
    const moonContext = { ...context, eventId: 'face-on-the-moon' } as const;
    adapter.stage(moonContext);
    await adapter.reveal();
    await adapter.playChoice(choice);
    await adapter.playItemUse('umbrella', 'umbrella-1' as ItemInstanceId);
    await adapter.react(reaction);
    adapter.update(9, 0.25);
    adapter.settleForVisibilityChange();
    adapter.clear();
    adapter.dispose();
    expect(constructors.moon).toHaveBeenCalledOnce();
    expect(constructors.moon).toHaveBeenCalledWith(dependencies.moon);
    expect(moon.stage).toHaveBeenCalledWith(moonContext);
    expect(moon.reveal).toHaveBeenCalledWith();
    expect(moon.react).toHaveBeenCalledWith(reaction.result, reaction.outcome);
    expect(moon.update).toHaveBeenCalledWith(9, 0.25);
    expect(moon.settleForVisibilityChange).toHaveBeenCalledOnce();
    expect(moon.clear).toHaveBeenCalledOnce();
    expect(moon.dispose).toHaveBeenCalledOnce();
    expect(calledFamilyConstructors()).toEqual(['moon']);
  });

  it('preserves a construction error while rollback cleanup continues', () => {
    const constructionError = new Error('weather construction');
    const cleanupError = new Error('layer cleanup');
    layer.dispose.mockImplementation(() => {
      throw cleanupError;
    });
    constructors.weather.mockImplementationOnce(() => {
      throw constructionError;
    });
    const { dependencies } = createDependencies();
    expect(() => new EventPresentationRegistry().create('shower-night', dependencies))
      .toThrow(constructionError);
    expect(layer.dispose).toHaveBeenCalledOnce();
  });

  it('continues adapter cleanup after the first family error', () => {
    const cleanupError = new Error('layer cleanup');
    layer.dispose.mockImplementation(() => {
      throw cleanupError;
    });
    const { dependencies } = createDependencies();
    const adapter = new EventPresentationRegistry().create('shower-night', dependencies);
    expect(() => adapter.dispose()).toThrow(cleanupError);
    expect(weather.dispose).toHaveBeenCalledOnce();
    adapter.dispose();
    expect(weather.dispose).toHaveBeenCalledOnce();
  });
});

// Importance: 10/10. Protects exhaustive event adapter routing and family delegation.
import { Group } from 'three';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import {
  EventPresentationRegistry
} from '../src/survival/EventPresentationRegistry';
import {
  SURVIVAL_EVENT_IDS
} from '../src/survival/eventCatalog';
import type { EventPresentationAdapterDependencies } from '../src/survival/eventPresentationAdapters';
import type {
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
        setBloodOceanIntensity: vi.fn(),
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
        checkBackChest: new Group(),
        checkBackFishBench: new Group(),
      },
      driftingWater: {},
      moon: {},
      applyDangerousWatersReaction: vi.fn(),
    } as unknown as EventPresentationAdapterDependencies,
  };
}

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
    eventId: 'drifting-supplies',
  }));
});

describe('EventPresentationRegistry', () => {

  it('creates and disposes a default adapter for every event', () => {
    const registry = new EventPresentationRegistry();
    const { dependencies } = createDependencies();
    for (const eventId of SURVIVAL_EVENT_IDS) {
      if (eventId === 'quiet-night') continue;
      const adapter = registry.create(eventId, dependencies);
      expect(adapter.eventId).toBe(eventId);
      adapter.dispose();
    }
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
});

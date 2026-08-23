// Importance: 8/10 (scaled from 4/5). Protects stable event targeting across moving and competing entities.
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BoatWorld } from '../src/survival/BoatWorld';
import { createInactiveVortexWaveState } from '../src/ocean/WaveField';
import { EventPresentationLayer } from '../src/survival/EventPresentationLayer';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
import { EventPresentationCoordinator } from '../src/survival/EventPresentationCoordinator';
import type {
  DedicatedEventEnvironment,
  DedicatedEventPresentation,
  EventSceneContext,
} from '../src/survival/eventPresentationTypes';
import { AnglerfishSwarmPresentation } from '../src/survival/events/AnglerfishSwarmPresentation';
import { DeathStarePresentation } from '../src/survival/events/DeathStarePresentation';
import { SchoolOfFishPresentation } from '../src/survival/events/SchoolOfFishPresentation';
import { SnatcherPresentation } from '../src/survival/events/SnatcherPresentation';
import { TornadoPresentation } from '../src/survival/events/TornadoPresentation';
import { SupernaturalEventAnimator } from '../src/survival/SupernaturalEventAnimator';
import { WeatherEventAnimator } from '../src/survival/WeatherEventAnimator';
import { eventItemMotionProfile } from '../src/survival/eventItemMotionProfile';
import { SURVIVAL_EVENTS } from '../src/survival/eventCatalog';
import { createTestPropModels } from './helpers/propModels';
import { createTestMoonTexture } from './helpers/skyAssets';

function createEventModels(): EventModelLibrary {
  return {
    create: () => {
      const geometry = new BoxGeometry(1, 1, 1);
      const material = new MeshStandardMaterial();
      const root = new Group();
      root.add(new Mesh(geometry, material));
      return { root, dispose: () => {
        geometry.dispose();
        material.dispose();
      } };
    },
    animations: () => [],
    dispose: () => undefined,
  } as unknown as EventModelLibrary;
}

function createWorldEventModels(): EventModelLibrary {
  return {
    create: () => new Group(),
    animations: () => [],
    dispose: () => undefined,
  } as unknown as EventModelLibrary;
}

function createDedicatedEnvironment(): DedicatedEventEnvironment {
  return {
    eventModels: createEventModels(),
    supplies: {
      borrowEventActor: () => null,
      itemType: () => null,
    } as unknown as DedicatedEventEnvironment['supplies'],
    carlitos: {} as DedicatedEventEnvironment['carlitos'],
    vortexWave: createInactiveVortexWaveState(),
    sampleWorldWaveInto: (output, time) => {
      output.height = time * 0.1;
      output.displacementX = time * 0.08;
      output.displacementZ = -time * 0.06;
      output.normal.x = 0;
      output.normal.y = 1;
      output.normal.z = 0;
    },
    readWorldWaveAmplitudeScale: () => 1,
  };
}

function context(eventId: EventSceneContext['eventId']): EventSceneContext {
  return { eventId, targetInstanceId: null, variantSeed: 23 };
}

function worldPosition(target: Object3D): Vector3 {
  target.updateWorldMatrix(true, false);
  return target.getWorldPosition(new Vector3());
}

function resolveBoatWorldTarget(world: BoatWorld, eventId: string): Object3D | null {
  return (
    world as unknown as {
      eventItemAimTarget(id: string): Object3D | null;
    }
  ).eventItemAimTarget(eventId);
}

describe('event item aim targets', () => {
  it('keeps dedicated directional targets stable while their event entities move', () => {
    const environment = createDedicatedEnvironment();
    const presentations: readonly DedicatedEventPresentation[] = [
      new SchoolOfFishPresentation(environment),
      new SnatcherPresentation(environment),
      new DeathStarePresentation(environment),
      new AnglerfishSwarmPresentation(environment),
      new TornadoPresentation(environment),
    ];
    const coordinator = new EventPresentationCoordinator(presentations);
    const scene = new Scene();
    scene.add(coordinator.worldRoot, coordinator.boatRoot);

    for (const presentation of presentations) {
      coordinator.stage(context(presentation.eventId));
      const target = coordinator.itemAimTarget();
      expect(target).toBe(presentation.itemAimTarget);
      scene.updateMatrixWorld(true);
      const before = worldPosition(target!);
      presentation.reveal();
      coordinator.update(1, 0.5);
      scene.updateMatrixWorld(true);
      expect(coordinator.itemAimTarget()).toBe(target);
      expect(worldPosition(target!).distanceTo(before)).toBeGreaterThan(0.001);
    }

    coordinator.dispose();
  });

  it('returns stable weather, supernatural, and generic event targets', () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const cameraRig = new Group();
    const supplies = {
      clearEventMotion: () => undefined,
      clearEventPose: () => undefined,
      resetEventPoseForFrame: () => undefined,
    };
    const weather = new WeatherEventAnimator(
      cameraRig,
      supplies as never,
      createWorldEventModels(),
      camera,
    );
    const supernatural = new SupernaturalEventAnimator(
      cameraRig,
      supplies as never,
      createWorldEventModels(),
      camera,
    );
    const otherPeopleRoot = new Group();
    const focusedFactory = (root: Group) => () => ({
      root,
      stage: () => undefined,
      reveal: () => Promise.resolve(),
      playChoice: () => Promise.resolve(),
      react: () => Promise.resolve(),
      clear: () => undefined,
      update: () => undefined,
      settleForVisibilityChange: () => undefined,
      dispose: () => undefined,
    });
    const layer = new EventPresentationLayer(
      {
        propModels: {} as never,
        waves: [],
        cameraRig,
        camera,
        supplyDisplay: supplies as never,
        chestDisplay: {} as never,
        emitCue: () => undefined,
      },
      {
        'chest-attack': focusedFactory(new Group()),
        'midnight-tour': focusedFactory(new Group()),
        'night-trader': focusedFactory(new Group()),
        handyman: focusedFactory(new Group()),
        'other-people': focusedFactory(otherPeopleRoot),
      },
    );
    scene.add(weather.worldRoot, weather.boatRoot, supernatural.worldRoot, layer.root);

    weather.stage('man-in-the-fog');
    const fogTarget = weather.itemAimTarget('man-in-the-fog');
    expect(fogTarget).not.toBeNull();
    expect(weather.itemAimTarget('man-in-the-fog')).toBe(fogTarget);

    supernatural.stage('ghosts');
    const ghostTarget = supernatural.itemAimTarget('ghosts');
    expect(ghostTarget).not.toBeNull();
    supernatural.reveal('ghosts');
    supernatural.update(2, 2);
    scene.updateMatrixWorld(true);
    const before = worldPosition(ghostTarget! as Group);
    supernatural.update(4, 2);
    scene.updateMatrixWorld(true);
    expect(supernatural.itemAimTarget('ghosts')).toBe(ghostTarget);
    expect(worldPosition(ghostTarget! as Group).distanceTo(before)).toBeGreaterThan(0.001);

    layer.stage('other-people');
    const otherPeopleTarget = layer.itemAimTarget('other-people');
    expect(otherPeopleTarget).toBe(otherPeopleRoot);
    expect(layer.itemAimTarget('other-people')).toBe(otherPeopleTarget);

    layer.dispose();
    weather.dispose();
    supernatural.dispose();
  });

  it('keeps the dangerous-waters target in the rock passage', () => {
    const camera = new PerspectiveCamera();
    const focusedFactory = () => () => ({
      root: new Group(),
      stage: () => undefined,
      reveal: () => Promise.resolve(),
      playChoice: () => Promise.resolve(),
      react: () => Promise.resolve(),
      clear: () => undefined,
      update: () => undefined,
      settleForVisibilityChange: () => undefined,
      dispose: () => undefined,
    });
    const layer = new EventPresentationLayer({
      propModels: {} as never,
      waves: [],
      cameraRig: new Group(),
      camera,
      supplyDisplay: {
        borrowEventActor: () => null,
        itemType: () => null,
      } as never,
      chestDisplay: {} as never,
      emitCue: () => undefined,
    }, {
      'chest-attack': focusedFactory(),
      'midnight-tour': focusedFactory(),
      'night-trader': focusedFactory(),
      handyman: focusedFactory(),
      'other-people': focusedFactory(),
    });
    const scene = new Scene();
    scene.add(layer.root);

    layer.stage('dangerous-waters');
    const target = layer.itemAimTarget('dangerous-waters');
    expect(target).not.toBeNull();
    expect(target!.parent?.name).toBe('dangerous-waters-passage');
    scene.updateMatrixWorld(true);
    const before = worldPosition(target!);

    layer.reveal('dangerous-waters');
    layer.update(1.4, 1.4);
    scene.updateMatrixWorld(true);

    expect(layer.itemAimTarget('dangerous-waters')).toBe(target);
    expect(worldPosition(target!)).toEqual(before);
    layer.dispose();
  });

  it('delegates active event targets to the interaction projector', () => {
    const target = new Group();
    const eventItemAimTarget = vi.fn(() => target as Object3D | null);
    const resolver = (
      BoatWorld.prototype as unknown as {
        eventItemAimTarget(eventId: string): Object3D | null;
      }
    ).eventItemAimTarget;
    const world = {
      interactionProjector: { eventItemAimTarget },
    };

    expect(resolver.call(world, 'dangerous-waters')).toBe(target);
    expect(eventItemAimTarget).toHaveBeenCalledWith('dangerous-waters');
  });

  it('keeps featured and chest targets on their visible receiving entities', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [],
      undefined,
      undefined,
      'low',
      createWorldEventModels(),
    );

    world.stageEvent('drifting-bottle', 9);
    const bottle = resolveBoatWorldTarget(world, 'drifting-bottle');
    expect(bottle?.name).toBe('event-prop:drifting-bottle');
    expect(bottle?.visible).toBe(true);
    expect(world.scene.getObjectById(bottle!.id)).toBe(bottle);
    const bottleBefore = worldPosition(bottle!);
    world.update(1.3, 0.4);
    expect(resolveBoatWorldTarget(world, 'drifting-bottle')).toBe(bottle);
    expect(worldPosition(bottle!).distanceTo(bottleBefore)).toBeGreaterThan(0.001);

    world.stageEvent('flowers', 9);
    const flowers = resolveBoatWorldTarget(world, 'flowers');
    expect(flowers?.name).toBe('flowers:pad:0');
    expect(flowers?.visible).toBe(true);
    expect(world.scene.getObjectById(flowers!.id)).toBe(flowers);
    const flowersBefore = worldPosition(flowers!);
    world.update(2.1, 0.4);
    expect(resolveBoatWorldTarget(world, 'flowers')).toBe(flowers);
    expect(worldPosition(flowers!).distanceTo(flowersBefore)).toBeGreaterThan(0.001);

    world.stageEvent('chest-attack');
    const chest = resolveBoatWorldTarget(world, 'chest-attack');
    expect(chest?.name).toBe('persistent-chest');
    expect(chest?.visible).toBe(true);
    expect(world.scene.getObjectById(chest!.id)).toBe(chest);
    world.update(2.5, 0.4);
    expect(resolveBoatWorldTarget(world, 'chest-attack')).toBe(chest);

    world.dispose();
    propModels.dispose();
  });

  it('stages a target for every directional catalog choice', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [],
      undefined,
      undefined,
      'low',
      createWorldEventModels(),
    );
    const directionalChoices = SURVIVAL_EVENTS.flatMap((event) => (
      event.choices.flatMap((choice) => (
        choice.itemId !== undefined
        && eventItemMotionProfile(choice.itemId).aim !== 'none'
          ? [{ eventId: event.id, choiceId: choice.id }]
          : []
      ))
    ));

    expect(directionalChoices).toEqual(expect.arrayContaining([
      { eventId: 'snatcher', choiceId: 'shotgun' },
      { eventId: 'man-in-the-fog', choiceId: 'flashlight' },
    ]));
    for (const { eventId, choiceId } of directionalChoices) {
      world.stageEvent(eventId);
      expect(
        resolveBoatWorldTarget(world, eventId),
        `${eventId} / ${choiceId}`,
      ).not.toBeNull();
    }

    world.dispose();
    propModels.dispose();
  });
});

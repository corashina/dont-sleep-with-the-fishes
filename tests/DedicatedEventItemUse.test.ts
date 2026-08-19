// Importance: 8/10 (scaled from 4/5). Protects dedicated event item routing and integrated use flows.
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  TubeGeometry,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ItemId, ItemInstanceId } from '../src/game/ItemState';
import { createInactiveVortexWaveState, createWaveSample } from '../src/ocean/WaveField';
import type {
  BorrowedSupplyActor,
  SupplyAdditivePose,
} from '../src/survival/BoatSupplyDisplay';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { EventItemUseAdapter } from '../src/survival/EventItemUseAdapter';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
import {
  resolveEventItemUseContext,
} from '../src/survival/eventItemUseChoreography';
import type {
  DedicatedEventEnvironment,
  DedicatedEventPresentation,
} from '../src/survival/eventPresentationTypes';
import { FishingBiteParticles } from '../src/survival/FishingBiteParticles';
import { AnglerfishSwarmPresentation } from '../src/survival/events/AnglerfishSwarmPresentation';
import { DeathStarePresentation } from '../src/survival/events/DeathStarePresentation';
import { LeakPresentation } from '../src/survival/events/LeakPresentation';
import { SchoolOfFishPresentation } from '../src/survival/events/SchoolOfFishPresentation';
import { SnatcherPresentation } from '../src/survival/events/SnatcherPresentation';
import { TornadoPresentation } from '../src/survival/events/TornadoPresentation';
import { swarmItemDuration } from '../src/survival/events/anglerfishSwarmChoreography';
import { deathStareItemDuration } from '../src/survival/events/deathStareChoreography';
import { LEAK_ITEM_DURATION } from '../src/survival/events/leakChoreography';
import { schoolItemDuration } from '../src/survival/events/schoolOfFishChoreography';
import { snatcherItemDuration } from '../src/survival/events/snatcherChoreography';
import { TORNADO_ITEM_DURATION } from '../src/survival/events/tornadoChoreography';

const choices = {
  leak: ['ductTape', 'bucket', 'map'],
  'school-of-fish': ['fishingNet', 'bucket', 'spyglass'],
  snatcher: ['spyglass', 'swimRing', 'fishingNet', 'shotgun'],
  'death-stare': ['flashlight', 'umbrella', 'food', 'shotgun', 'fishingNet'],
  'swarm-of-anglerfish': ['fishingNet', 'shotgun', 'flashlight', 'bait'],
  tornado: ['anchor', 'swimRing'],
} as const;
type ItemAnimationEventId = keyof typeof choices;

const itemTypes = {
  ductTape: 'ductTape',
  bucket: 'bucket',
  map: 'map',
  fishingNet: 'fishingNet',
  spyglass: 'spyglass',
  swimRing: 'swimRing',
  shotgun: 'shotgun',
  flashlight: 'flashlight',
  umbrella: 'umbrella',
  food: 'cannedFood',
  bait: 'baitTin',
  anchor: 'anchor',
} as const satisfies Readonly<Record<string, ItemId>>;

const eventProbeNames: Readonly<Record<ItemAnimationEventId, string>> = {
  leak: 'leak-hole-1',
  'school-of-fish': 'school-fish-1',
  snatcher: 'tentacle-attack-model',
  'death-stare': 'death-stare-angler',
  'swarm-of-anglerfish': 'swarm-angler-1',
  tornado: 'tornado-model',
};

const itemDurations: Readonly<Record<ItemAnimationEventId, (choiceId: string) => number>> = {
  leak: () => LEAK_ITEM_DURATION,
  'school-of-fish': schoolItemDuration,
  snatcher: snatcherItemDuration,
  'death-stare': deathStareItemDuration,
  'swarm-of-anglerfish': swarmItemDuration,
  tornado: () => TORNADO_ITEM_DURATION,
};

const factories: Readonly<Record<
  ItemAnimationEventId,
  (environment: DedicatedEventEnvironment) => DedicatedEventPresentation
>> = {
  leak: (environment) => new LeakPresentation(environment),
  'school-of-fish': (environment) => new SchoolOfFishPresentation(environment),
  snatcher: (environment) => new SnatcherPresentation(environment),
  'death-stare': (environment) => new DeathStarePresentation(environment),
  'swarm-of-anglerfish': (environment) => new AnglerfishSwarmPresentation(environment),
  tornado: (environment) => new TornadoPresentation(environment),
};

const cases = Object.entries(choices).flatMap(([eventId, eventChoices]) => (
  eventChoices.map((choiceId) => [eventId, choiceId] as const)
)) as readonly (readonly [ItemAnimationEventId, keyof typeof itemTypes])[];

function createEventModels(): EventModelLibrary {
  return {
    create: () => {
      const geometry = new BoxGeometry(1, 1, 1);
      const material = new MeshStandardMaterial();
      const root = new Group();
      root.add(new Mesh(geometry, material));
      return {
        root,
        dispose: () => {
          geometry.dispose();
          material.dispose();
        },
      };
    },
    animations: () => [],
    dispose: () => undefined,
  } as unknown as EventModelLibrary;
}

function createActor(parent: Group, instanceId: ItemInstanceId): BorrowedSupplyActor {
  const root = new Group();
  const basePosition = new Vector3(1.45, 0.34, -0.2);
  root.position.copy(basePosition);
  parent.add(root);
  return {
    instanceId,
    root,
    applyPose: (pose: SupplyAdditivePose) => {
      root.position.set(
        basePosition.x + pose.x,
        basePosition.y + pose.y,
        basePosition.z + pose.z,
      );
      root.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
      root.scale.set(pose.scaleX, pose.scaleY, pose.scaleZ);
    },
    releaseOnNextSync: vi.fn(),
    release: vi.fn(),
  };
}

describe('dedicated event item use', () => {
  it('pours Leak arcs from each spray point into the interior puddle', async () => {
    const environment: DedicatedEventEnvironment = {
      eventModels: createEventModels(),
      supplies: {} as DedicatedEventEnvironment['supplies'],
      carlitos: {} as DedicatedEventEnvironment['carlitos'],
      vortexWave: createInactiveVortexWaveState(),
      sampleWorldWaveInto: (output) => Object.assign(output, createWaveSample()),
      readWorldWaveAmplitudeScale: () => 1,
    };
    const presentation = new LeakPresentation(environment);
    presentation.stage({ eventId: 'leak', targetInstanceId: null, variantSeed: 41 });
    const reveal = presentation.reveal();
    const arcs = presentation.boatRoot.children.filter(({ name }) => (
      name.startsWith('leak-pour-arc-')
    )) as Mesh[];
    expect(arcs).toHaveLength(6);
    expect(arcs.every(({ geometry }) => geometry.drawRange.count === 0)).toBe(true);

    presentation.update(0.35, 0.35);
    expect(arcs.every(({ geometry }) => geometry.drawRange.count > 0)).toBe(true);

    presentation.update(1.4, 1.05);
    expect(arcs.every(({ visible }) => visible)).toBe(true);
    const radii = new Set<number>();
    arcs.forEach((arc) => {
      expect(Math.abs(arc.position.x)).toBeCloseTo(1.61);
      arc.geometry.computeBoundingBox();
      const bounds = arc.geometry.boundingBox!;
      const innerX = arc.position.x + (
        arc.position.x < 0 ? bounds.max.x : bounds.min.x
      );
      expect(Math.abs(innerX)).toBeGreaterThan(1.14);
      expect(Math.abs(innerX)).toBeLessThan(Math.abs(arc.position.x));
      expect(arc.position.y + bounds.min.y).toBeLessThan(-0.2);
      const geometry = arc.geometry as TubeGeometry;
      radii.add(geometry.parameters.radius);
      expect(geometry.parameters.radius).toBeGreaterThan(0.01);
      expect(geometry.parameters.radius).toBeLessThan(0.018);
      expect(geometry.drawRange.count).toBeGreaterThan(0);
      expect(geometry.drawRange.count).toBeLessThan(geometry.index!.count);
    });
    expect(radii.size).toBeGreaterThan(3);

    presentation.settleForVisibilityChange();
    expect(arcs.every(({ geometry }) => (
      geometry.drawRange.count === geometry.index!.count
    ))).toBe(true);
    await reveal;
    presentation.dispose();
  });

  it('applies the terminal Leak item transition once after spray update', async () => {
    const emit = vi.spyOn(FishingBiteParticles.prototype, 'emit');
    const camera = new PerspectiveCamera(62, 1.6, 0.1, 100);
    const sampleWorldWaveInto = vi.fn((output) => {
      Object.assign(output, createWaveSample());
    });
    const environment: DedicatedEventEnvironment = {
      eventModels: createEventModels(),
      supplies: {
        borrowEventActor: vi.fn(() => null),
        itemType: () => 'ductTape',
      } as unknown as DedicatedEventEnvironment['supplies'],
      carlitos: {} as DedicatedEventEnvironment['carlitos'],
      vortexWave: createInactiveVortexWaveState(),
      sampleWorldWaveInto,
      readWorldWaveAmplitudeScale: () => 1,
      camera,
    };
    const presentation = new LeakPresentation(environment);
    presentation.stage({ eventId: 'leak', targetInstanceId: null, variantSeed: 41 });

    const itemUse = presentation.playItemUse('ductTape', 'ductTape-1');
    presentation.update(1, LEAK_ITEM_DURATION);

    await expect(itemUse).resolves.toBe(true);
    expect(emit).not.toHaveBeenCalled();
    const completedWaveSamples = sampleWorldWaveInto.mock.calls.length;

    presentation.update(2, 0);
    presentation.update(3, 0);
    presentation.settleForVisibilityChange();

    expect(sampleWorldWaveInto).toHaveBeenCalledTimes(completedWaveSamples + 2);
    presentation.dispose();
    emit.mockRestore();
  });

  it.each(cases)(
    'uses shared %s %s choreography without replacing its event scene',
    async (eventId, choiceId) => {
      const itemId = itemTypes[choiceId];
      const instanceId = `${itemId}-1` as ItemInstanceId;
      const scene = new Scene();
      const camera = new PerspectiveCamera(62, 1.6, 0.1, 100);
      camera.position.set(0, 1.35, 2.65);
      camera.lookAt(0, 0.72, -0.4);
      scene.add(camera);
      const supplyRoot = new Group();
      scene.add(supplyRoot);
      const actor = createActor(supplyRoot, instanceId);
      const borrowEventActor = vi.fn(() => actor);
      const effects = new EventItemEffects();
      const disposeEffects = vi.spyOn(effects, 'dispose');
      const adapter = new EventItemUseAdapter(camera, effects);
      const applySharedPose = vi.spyOn(adapter, 'apply');
      const environment: DedicatedEventEnvironment = {
        eventModels: createEventModels(),
        supplies: {
          borrowEventActor,
          itemType: (requestedId: ItemInstanceId) => (
            requestedId === instanceId ? itemId : null
          ),
        } as unknown as DedicatedEventEnvironment['supplies'],
        carlitos: {} as DedicatedEventEnvironment['carlitos'],
        vortexWave: createInactiveVortexWaveState(),
        sampleWorldWaveInto: (output) => Object.assign(output, createWaveSample()),
        readWorldWaveAmplitudeScale: () => 1,
        camera,
      };
      const presentation = factories[eventId](environment);
      scene.add(presentation.worldRoot, presentation.boatRoot, effects.root);
      presentation.stage({ eventId, targetInstanceId: null, variantSeed: 41 });
      scene.updateMatrixWorld(true);
      const itemUse = presentation.playItemUse(choiceId, instanceId);
      const resolved = vi.fn();
      void itemUse.then(resolved);
      const duration = itemDurations[eventId](choiceId);
      const eventProbe = presentation.worldRoot.getObjectByName(eventProbeNames[eventId])
        ?? presentation.boatRoot.getObjectByName(eventProbeNames[eventId]);
      expect(eventProbe).toBeDefined();

      presentation.update(0.1, duration * 0.1);
      expect(applySharedPose).not.toHaveBeenCalled();
      expect(eventProbe!.visible).toBe(true);

      presentation.update(0.3, duration * 0.2);
      expect(eventProbe!.visible).toBe(true);
      presentation.update(0.65, duration * 0.35);
      expect(eventProbe!.visible).toBe(true);
      expect(resolved).not.toHaveBeenCalled();
      const elapsed = duration * 0.1 + duration * 0.2 + duration * 0.35;
      presentation.update(1, duration - elapsed);
      await expect(itemUse).resolves.toBe(true);
      expect(eventProbe!.visible).toBe(true);
      expect(resolved).toHaveBeenCalledTimes(1);
      presentation.update(1.2, 0.2);
      expect(resolved).toHaveBeenCalledTimes(1);
      expect(borrowEventActor).not.toHaveBeenCalled();

      presentation.dispose();
      expect(disposeEffects).not.toHaveBeenCalled();
      adapter.dispose();
      expect(disposeEffects).toHaveBeenCalledTimes(1);
    },
  );
});

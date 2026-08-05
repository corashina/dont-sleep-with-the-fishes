// Importance: 4/5. Protects dedicated event item routing and integrated use flows.
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
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
import { AnglerfishSwarmPresentation } from '../src/survival/events/AnglerfishSwarmPresentation';
import { DeathStarePresentation } from '../src/survival/events/DeathStarePresentation';
import { LeakPresentation } from '../src/survival/events/LeakPresentation';
import { SchoolOfFishPresentation } from '../src/survival/events/SchoolOfFishPresentation';
import { SnatcherPresentation } from '../src/survival/events/SnatcherPresentation';
import { WhirlpoolPresentation } from '../src/survival/events/WhirlpoolPresentation';
import { SWARM_ITEM_DURATION } from '../src/survival/events/anglerfishSwarmChoreography';
import { DEATH_STARE_ITEM_DURATION } from '../src/survival/events/deathStareChoreography';
import { LEAK_ITEM_DURATION } from '../src/survival/events/leakChoreography';
import { SCHOOL_ITEM_DURATION } from '../src/survival/events/schoolOfFishChoreography';
import { SNATCHER_ITEM_DURATION } from '../src/survival/events/snatcherChoreography';
import { WHIRLPOOL_ITEM_DURATION } from '../src/survival/events/whirlpoolChoreography';

const choices = {
  leak: ['ductTape', 'bucket', 'map'],
  'school-of-fish': ['fishingNet', 'bucket', 'spyglass'],
  snatcher: ['spyglass', 'swimRing', 'fishingNet', 'shotgun'],
  'death-stare': ['flashlight', 'umbrella', 'food', 'shotgun', 'fishingNet'],
  'swarm-of-anglerfish': ['fishingNet', 'shotgun', 'flashlight', 'bait'],
  whirlpool: ['anchor', 'swimRing'],
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
  whirlpool: 'whirlpool-dark-funnel',
};

const itemDurations: Readonly<Record<ItemAnimationEventId, number>> = {
  leak: LEAK_ITEM_DURATION,
  'school-of-fish': SCHOOL_ITEM_DURATION,
  snatcher: SNATCHER_ITEM_DURATION,
  'death-stare': DEATH_STARE_ITEM_DURATION,
  'swarm-of-anglerfish': SWARM_ITEM_DURATION,
  whirlpool: WHIRLPOOL_ITEM_DURATION,
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
  whirlpool: (environment) => new WhirlpoolPresentation(environment),
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

function createActor(
  parent: Group,
  instanceId: ItemInstanceId,
): { actor: BorrowedSupplyActor; release: ReturnType<typeof vi.fn> } {
  const root = new Group();
  const basePosition = new Vector3(1.45, 0.34, -0.2);
  root.position.copy(basePosition);
  parent.add(root);
  const release = vi.fn();
  return {
    actor: {
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
      release,
    },
    release,
  };
}

describe('dedicated event item use', () => {
  it.each(Object.entries(choices) as readonly (readonly [
    ItemAnimationEventId,
    readonly string[],
  ])[])(
    'runs a %s scene without borrowing the selected actor',
    async (eventId, eventChoices) => {
      const choiceId = eventChoices[0]!;
      const instanceId = 'compass-1' as ItemInstanceId;
      const scene = new Scene();
      const camera = new PerspectiveCamera(62, 1.6, 0.1, 100);
      const supplyRoot = new Group();
      scene.add(camera, supplyRoot);
      const { actor, release } = createActor(supplyRoot, instanceId);
      const borrowEventActor = vi.fn(() => actor);
      const effects = new EventItemEffects();
      const adapter = new EventItemUseAdapter(camera, effects);
      const environment: DedicatedEventEnvironment = {
        eventModels: createEventModels(),
        supplies: {
          borrowEventActor,
          itemType: () => 'compass',
        } as unknown as DedicatedEventEnvironment['supplies'],
        captainWhiskers: {} as DedicatedEventEnvironment['captainWhiskers'],
        vortexWave: createInactiveVortexWaveState(),
        sampleWorldWaveInto: (output) => Object.assign(output, createWaveSample()),
        readWorldWaveAmplitudeScale: () => 1,
        camera,
      };
      const presentation = factories[eventId](environment);
      presentation.stage({ eventId, targetInstanceId: null, variantSeed: 41 });

      const itemUse = presentation.playItemUse(choiceId, instanceId);
      presentation.update(1, itemDurations[eventId]);
      await expect(itemUse).resolves.toBe(true);
      expect(borrowEventActor).not.toHaveBeenCalled();
      expect(release).not.toHaveBeenCalled();

      presentation.dispose();
      adapter.dispose();
    },
  );

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
      const { actor } = createActor(supplyRoot, instanceId);
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
        captainWhiskers: {} as DedicatedEventEnvironment['captainWhiskers'],
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
      const duration = itemDurations[eventId];
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

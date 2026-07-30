// Importance: 5/5. Protects the Leak scene pools, exact item IDs, and resource lifecycle.
import {
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import type {
  BorrowedSupplyActor,
  BoatSupplyDisplay,
  SupplyAdditivePose,
} from '../src/survival/BoatSupplyDisplay';
import type {
  EventModelInstance,
  EventModelLibrary,
} from '../src/survival/EventModelLibrary';
import { LeakPresentation } from '../src/survival/events/LeakPresentation';
import type {
  DedicatedEventEnvironment,
  EventOutcomePresentation,
} from '../src/survival/eventPresentationTypes';

interface TestActor extends BorrowedSupplyActor {
  readonly applyPose: ReturnType<typeof vi.fn<(pose: SupplyAdditivePose) => void>>;
  readonly releaseOnNextSync: ReturnType<typeof vi.fn<() => void>>;
  readonly release: ReturnType<typeof vi.fn<() => void>>;
}

function actor(instanceId: ItemInstanceId): TestActor {
  return {
    instanceId,
    root: new Group(),
    applyPose: vi.fn<(pose: SupplyAdditivePose) => void>(),
    releaseOnNextSync: vi.fn<() => void>(),
    release: vi.fn<() => void>(),
  };
}

function outcome(
  options: {
    hull?: number;
    selected?: ItemInstanceId | null;
    broken?: readonly ItemInstanceId[];
    lost?: readonly ItemInstanceId[];
    consumed?: readonly ItemInstanceId[];
  } = {},
): EventOutcomePresentation {
  return {
    outcome: {
      accepted: true,
      code: 'event-resolved',
      message: 'Resolved.',
      deltas: options.hull === undefined ? {} : { hull: options.hull },
      cue: 'impact',
    },
    resourceDeltas: options.hull === undefined ? {} : { hull: options.hull },
    brokenInstanceIds: options.broken ?? [],
    lostInstanceIds: options.lost ?? [],
    consumedInstanceIds: options.consumed ?? [],
    selectedInstanceId: options.selected ?? null,
    selectedCondition: null,
    targetInstanceId: null,
  };
}

function setup(actorIds: readonly ItemInstanceId[] = []) {
  const modelRoot = new Group();
  const modelMesh = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshStandardMaterial({ color: 0x765239 }),
  );
  modelRoot.add(modelMesh);
  const modelDispose = vi.fn();
  const modelInstance = {
    root: modelRoot,
    dispose: modelDispose,
  } satisfies EventModelInstance;
  const create = vi.fn(() => modelInstance);
  const actors = new Map(actorIds.map((id) => [id, actor(id)]));
  const borrowEventActor = vi.fn((id: ItemInstanceId) => actors.get(id) ?? null);
  const sampleWorldWaveInto = vi.fn((sample: {
    height: number;
    displacementX: number;
    displacementZ: number;
    normal: { x: number; y: number; z: number };
  }) => {
    sample.height = 0.3;
    sample.displacementX = 0;
    sample.displacementZ = 0;
    sample.normal.x = 0.1;
    sample.normal.y = 0.98;
    sample.normal.z = -0.08;
  });
  const vortexWave = {
    centerX: 2,
    centerZ: -3,
    radius: 8,
    depression: 1,
    tangentStrength: 0.7,
    phase: 0.2,
    strength: 0.5,
  };
  const environment = {
    eventModels: { create } as unknown as EventModelLibrary,
    supplies: { borrowEventActor } as unknown as BoatSupplyDisplay,
    vortexWave,
    sampleWorldWaveInto,
  } satisfies DedicatedEventEnvironment;

  return {
    actors,
    borrowEventActor,
    create,
    environment,
    modelDispose,
    modelMesh,
    sampleWorldWaveInto,
    vortexBefore: { ...vortexWave },
  };
}

function stage(presentation: LeakPresentation): void {
  presentation.stage({
    eventId: 'leak',
    targetInstanceId: null,
    variantSeed: 42,
  });
}

describe('LeakPresentation', () => {
  it('builds one fixed, authored pool below the boat root', () => {
    const fixture = setup();
    const presentation = new LeakPresentation(fixture.environment);
    const root = presentation.boatRoot;

    expect(fixture.create).toHaveBeenCalledExactlyOnceWith('leakPlanks');
    expect(root.getObjectByName('leak-water-jet')).toBeDefined();
    expect(root.getObjectByName('leak-interior-water')).toBeDefined();
    expect(root.getObjectByName('leak-seam')).toBeDefined();
    expect(root.getObjectByName('leak-wet-band')).toBeDefined();
    expect(root.children.filter(({ name }) => name.startsWith('leak-drip-'))).toHaveLength(8);
    expect(root.children.filter(({ name }) => name.startsWith('leak-splash-'))).toHaveLength(6);
    expect(fixture.modelMesh.material.flatShading).toBe(true);
  });

  it('holds the visible leak after reveal and clears all water', async () => {
    const fixture = setup();
    const presentation = new LeakPresentation(fixture.environment);
    stage(presentation);
    const jet = presentation.boatRoot.getObjectByName('leak-water-jet') as Mesh;
    const jetMaterial = jet.material as MeshStandardMaterial;
    const interiorWater = presentation.boatRoot.getObjectByName(
      'leak-interior-water',
    ) as Mesh;

    const reveal = presentation.reveal();
    presentation.update(12, 2.4);
    await reveal;

    expect(jetMaterial.opacity).toBeGreaterThan(0.5);
    expect(interiorWater.visible).toBe(true);
    expect(fixture.sampleWorldWaveInto).toHaveBeenCalled();
    expect(fixture.environment.vortexWave).toEqual(fixture.vortexBefore);

    presentation.clear();
    expect(jetMaterial.opacity).toBe(0);
    expect(interiorWater.visible).toBe(false);
  });

  it('borrows the exact selected actor and restores its item-use pose', async () => {
    const bucketId = 'bucket-7' as ItemInstanceId;
    const fixture = setup([bucketId]);
    const presentation = new LeakPresentation(fixture.environment);
    stage(presentation);

    const use = presentation.playItemUse('bucket', bucketId);
    presentation.update(2, 0.7);
    expect(fixture.borrowEventActor).toHaveBeenCalledExactlyOnceWith(bucketId);
    expect(fixture.actors.get(bucketId)!.applyPose.mock.lastCall![0].pitch).not.toBe(0);

    presentation.update(2.4, 0.4);
    await expect(use).resolves.toBe(true);
    expect(fixture.actors.get(bucketId)!.applyPose.mock.lastCall![0]).toMatchObject({
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
    });
    expect(fixture.actors.get(bucketId)!.release).not.toHaveBeenCalled();
  });

  it('maps safe and damaged outcomes without approximate item matching', async () => {
    const bucketId = 'bucket-3' as ItemInstanceId;
    const otherBucketId = 'bucket-4' as ItemInstanceId;
    const fixture = setup([bucketId, otherBucketId]);
    const presentation = new LeakPresentation(fixture.environment);
    stage(presentation);

    const use = presentation.playItemUse('bucket', bucketId);
    presentation.update(0, 1.1);
    await use;
    const reaction = presentation.react(outcome({
      hull: -8,
      selected: bucketId,
      broken: [otherBucketId],
    }));
    presentation.update(0.4, 0.4);

    expect(presentation.boatRoot.position.x).not.toBe(0);
    expect(fixture.actors.get(bucketId)!.applyPose.mock.lastCall![0].scaleY).toBe(1);

    presentation.update(1, 0.6);
    await reaction;
    expect(presentation.boatRoot.position.x).toBe(0);
  });

  it('borrows and holds the exact lost actor over starboard', async () => {
    const mapId = 'map-9' as ItemInstanceId;
    const fixture = setup([mapId]);
    const presentation = new LeakPresentation(fixture.environment);
    stage(presentation);

    const reaction = presentation.react(outcome({ lost: [mapId] }));
    presentation.update(1, 1);
    await reaction;

    expect(fixture.borrowEventActor).toHaveBeenCalledExactlyOnceWith(mapId);
    expect(fixture.actors.get(mapId)!.applyPose.mock.lastCall![0].x).toBeGreaterThan(2);
    expect(fixture.actors.get(mapId)!.release).not.toHaveBeenCalled();

    presentation.clear();
    expect(fixture.actors.get(mapId)!.release).toHaveBeenCalledOnce();
  });

  it('holds a broken selected actor and turns a safe jet into drips', async () => {
    const mapId = 'map-2' as ItemInstanceId;
    const fixture = setup([mapId]);
    const presentation = new LeakPresentation(fixture.environment);
    stage(presentation);

    const use = presentation.playItemUse('map', mapId);
    presentation.update(0, 1.1);
    await use;
    const brokenReaction = presentation.react(outcome({
      selected: mapId,
      broken: [mapId],
    }));
    presentation.update(1, 1);
    await brokenReaction;
    expect(fixture.actors.get(mapId)!.applyPose.mock.lastCall![0].scaleY).toBeLessThan(0.8);

    presentation.clear();
    stage(presentation);
    const safeReaction = presentation.react(outcome());
    presentation.update(2, 1);
    await safeReaction;
    const jet = presentation.boatRoot.getObjectByName('leak-water-jet') as Mesh;
    const drips = presentation.boatRoot.children.filter(
      ({ name }) => name.startsWith('leak-drip-'),
    );
    expect((jet.material as MeshStandardMaterial).opacity).toBeLessThan(0.2);
    expect(drips.some(({ visible }) => visible)).toBe(true);
  });

  it('disposes its model, geometry, and material once', () => {
    const fixture = setup();
    const presentation = new LeakPresentation(fixture.environment);
    const seam = presentation.boatRoot.getObjectByName('leak-seam') as Mesh;
    const geometryDispose = vi.spyOn(seam.geometry, 'dispose');
    const materialDispose = vi.spyOn(seam.material as MeshStandardMaterial, 'dispose');

    presentation.dispose();
    presentation.dispose();

    expect(fixture.modelDispose).toHaveBeenCalledOnce();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(presentation.boatRoot.parent).toBeNull();
    expect(presentation.boatRoot.children).toHaveLength(0);
  });
});

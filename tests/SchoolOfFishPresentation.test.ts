// Importance: 5/5. Protects the fixed fish pool, shared waves, exact catches, and cleanup.
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
import { SchoolOfFishPresentation } from '../src/survival/events/SchoolOfFishPresentation';
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
  food: number,
  selected: ItemInstanceId | null = null,
  broken: readonly ItemInstanceId[] = [],
): EventOutcomePresentation {
  return {
    outcome: {
      accepted: true,
      code: 'event-resolved',
      message: 'Resolved.',
      deltas: food === 0 ? {} : { food },
      cue: 'fish',
    },
    resourceDeltas: food === 0 ? {} : { food },
    brokenInstanceIds: broken,
    lostInstanceIds: [],
    consumedInstanceIds: [],
    selectedInstanceId: selected,
    selectedCondition: null,
    targetInstanceId: null,
  };
}

function setup(actorIds: readonly ItemInstanceId[] = []) {
  const modelDisposes: Array<ReturnType<typeof vi.fn>> = [];
  const modelMeshes: Mesh[] = [];
  const modelRoots: Group[] = [];
  const create = vi.fn(() => {
    const root = new Group();
    const mesh = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshStandardMaterial({ color: 0x82979d }),
    );
    const dispose = vi.fn(() => {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
    });
    root.add(mesh);
    modelMeshes.push(mesh);
    modelRoots.push(root);
    modelDisposes.push(dispose);
    return { root, dispose } satisfies EventModelInstance;
  });
  const actors = new Map(actorIds.map((id) => [id, actor(id)]));
  const borrowEventActor = vi.fn((id: ItemInstanceId) => actors.get(id) ?? null);
  const sampleWorldWaveInto = vi.fn((sample: {
    height: number;
    displacementX: number;
    displacementZ: number;
    normal: { x: number; y: number; z: number };
  }) => {
    sample.height = 0.24;
    sample.displacementX = 0.02;
    sample.displacementZ = -0.01;
    sample.normal.x = 0.08;
    sample.normal.y = 0.99;
    sample.normal.z = -0.06;
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
    modelDisposes,
    modelMeshes,
    modelRoots,
    sampleWorldWaveInto,
    vortexBefore: { ...vortexWave },
  };
}

function stage(presentation: SchoolOfFishPresentation, variantSeed = 19): void {
  presentation.stage({
    eventId: 'school-of-fish',
    targetInstanceId: null,
    variantSeed,
  });
}

describe('SchoolOfFishPresentation', () => {
  it('constructs one fixed scene pool before stage', () => {
    const fixture = setup();
    const presentation = new SchoolOfFishPresentation(fixture.environment);
    const fishRoots = presentation.worldRoot.children.filter(
      ({ name }) => name.startsWith('school-fish-'),
    );

    expect(fixture.create).toHaveBeenCalledTimes(25);
    expect(fixture.create).toHaveBeenCalledWith('schoolFish');
    expect(fishRoots).toHaveLength(24);
    expect(presentation.worldRoot.children.filter(
      ({ name }) => name.startsWith('school-surface-flash-'),
    )).toHaveLength(8);
    expect(presentation.worldRoot.children.filter(
      ({ name }) => name.startsWith('school-splash-'),
    )).toHaveLength(6);
    expect(presentation.boatRoot.getObjectByName('school-catch-actor')).toBe(
      fixture.modelRoots[24],
    );
    expect(fixture.create.mock.calls[24]).toEqual(['schoolFish']);
    expect(fixture.modelMeshes.every(
      ({ material }) => (material as MeshStandardMaterial).flatShading,
    )).toBe(true);
  });

  it('samples each preallocated fish without creating objects during update', () => {
    const fixture = setup();
    const presentation = new SchoolOfFishPresentation(fixture.environment);
    stage(presentation);
    fixture.sampleWorldWaveInto.mockClear();
    fixture.create.mockClear();

    presentation.update(3, 1 / 60);
    expect(fixture.sampleWorldWaveInto).toHaveBeenCalledTimes(24);
    presentation.update(3.016, 1 / 60);
    expect(fixture.create).not.toHaveBeenCalled();
    expect(fixture.environment.vortexWave).toEqual(fixture.vortexBefore);
  });

  it('forms the school before item use and borrows the exact actor', async () => {
    const netId = 'fishingNet-4' as ItemInstanceId;
    const fixture = setup([netId]);
    const presentation = new SchoolOfFishPresentation(fixture.environment);
    stage(presentation);

    const reveal = presentation.reveal();
    presentation.update(3, 2.6);
    await reveal;
    const visibleFish = presentation.worldRoot.children.filter(
      ({ name, visible }) => name.startsWith('school-fish-') && visible,
    );
    expect(visibleFish.length).toBeGreaterThanOrEqual(18);
    expect(visibleFish.length).toBeLessThanOrEqual(24);
    expect(visibleFish.every(({ scale }) => scale.x >= 0.72)).toBe(true);

    const use = presentation.playItemUse('fishingNet', netId);
    presentation.update(3.5, 0.72);
    expect(fixture.borrowEventActor).toHaveBeenCalledExactlyOnceWith(netId);
    expect(fixture.actors.get(netId)!.applyPose.mock.lastCall![0].x).toBeGreaterThan(2);
    presentation.update(4, 0.53);
    await expect(use).resolves.toBe(true);
  });

  it('shows the exact food delta and scatters after the result', async () => {
    const bucketId = 'bucket-6' as ItemInstanceId;
    const fixture = setup([bucketId]);
    const presentation = new SchoolOfFishPresentation(fixture.environment);
    stage(presentation, 6);
    const reaction = presentation.react(outcome(2, bucketId, [bucketId]));
    presentation.update(5, 1.1);
    await reaction;

    const catchActor = presentation.boatRoot.getObjectByName('school-catch-actor')!;
    expect(presentation.worldRoot.userData.foodDelta).toBe(2);
    expect(catchActor.userData.foodDelta).toBe(2);
    expect(catchActor.userData.catchModelId).toBe('schoolFish');
    expect(catchActor.visible).toBe(true);
    expect(presentation.worldRoot.children.filter(
      ({ name, visible }) => name.startsWith('school-fish-') && visible,
    )).toHaveLength(23);
    expect(fixture.actors.get(bucketId)!.applyPose.mock.lastCall![0].scaleY).toBeLessThan(0.7);

    presentation.clear();
    expect(catchActor.visible).toBe(false);
    expect(fixture.actors.get(bucketId)!.release).toHaveBeenCalledOnce();
  });

  it('disposes every model and each authored resource once', () => {
    const fixture = setup();
    const presentation = new SchoolOfFishPresentation(fixture.environment);
    const flash = presentation.worldRoot.getObjectByName('school-surface-flash-1') as Mesh;
    const splash = presentation.worldRoot.getObjectByName('school-splash-1') as Mesh;
    const catchMesh = fixture.modelMeshes[24]!;
    const flashGeometryDispose = vi.spyOn(flash.geometry, 'dispose');
    const flashMaterialDispose = vi.spyOn(
      flash.material as MeshStandardMaterial,
      'dispose',
    );
    const splashGeometryDispose = vi.spyOn(splash.geometry, 'dispose');
    const splashMaterialDispose = vi.spyOn(
      splash.material as MeshStandardMaterial,
      'dispose',
    );
    const catchGeometryDispose = vi.spyOn(catchMesh.geometry, 'dispose');
    const catchMaterialDispose = vi.spyOn(
      catchMesh.material as MeshStandardMaterial,
      'dispose',
    );

    presentation.dispose();
    presentation.dispose();

    expect(fixture.modelDisposes).toHaveLength(25);
    expect(fixture.modelDisposes.every((dispose) => dispose.mock.calls.length === 1)).toBe(true);
    expect(flashGeometryDispose).toHaveBeenCalledOnce();
    expect(flashMaterialDispose).toHaveBeenCalledOnce();
    expect(splashGeometryDispose).toHaveBeenCalledOnce();
    expect(splashMaterialDispose).toHaveBeenCalledOnce();
    expect(fixture.modelDisposes[24]).toHaveBeenCalledOnce();
    expect(catchGeometryDispose).toHaveBeenCalledOnce();
    expect(catchMaterialDispose).toHaveBeenCalledOnce();
    expect(presentation.worldRoot.children).toHaveLength(0);
    expect(presentation.boatRoot.children).toHaveLength(0);
  });
});

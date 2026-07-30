// Importance: 5/5. Protects the fixed face, exact losses, pose reset, effects, and cleanup.
import {
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
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
import { DeathStarePresentation } from '../src/survival/events/DeathStarePresentation';
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

function outcome(options: {
  hull?: number;
  health?: number;
  selected?: ItemInstanceId | null;
  lost?: readonly ItemInstanceId[];
} = {}): EventOutcomePresentation {
  const deltas = {
    ...(options.hull === undefined ? {} : { hull: options.hull }),
    ...(options.health === undefined ? {} : { health: options.health }),
  };
  return {
    outcome: {
      accepted: true,
      code: 'event-resolved',
      message: 'Resolved.',
      deltas,
      cue: 'impact',
    },
    resourceDeltas: deltas,
    brokenInstanceIds: [],
    lostInstanceIds: options.lost ?? [],
    consumedInstanceIds: [],
    selectedInstanceId: options.selected ?? null,
    selectedCondition: null,
    targetInstanceId: null,
  };
}

function setup(actorIds: readonly ItemInstanceId[] = []) {
  const modelRoot = new Group();
  const modelMesh = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshStandardMaterial({ color: 0x182f31 }),
  );
  modelRoot.add(modelMesh);
  const modelDispose = vi.fn(() => {
    modelMesh.geometry.dispose();
    (modelMesh.material as MeshStandardMaterial).dispose();
  });
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
    sample.height = 0.2;
    sample.displacementX = 0.01;
    sample.displacementZ = -0.02;
    sample.normal.x = 0.06;
    sample.normal.y = 0.99;
    sample.normal.z = -0.04;
  });
  const cameraBase = new Group();
  const cameraEffectsRoot = new Group();
  cameraBase.rotation.set(0.24, -0.18, 0.07);
  cameraBase.add(cameraEffectsRoot);
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
    cameraEffectsRoot,
  } satisfies DedicatedEventEnvironment;
  return {
    actors,
    borrowEventActor,
    cameraBase,
    cameraEffectsRoot,
    create,
    environment,
    modelDispose,
    modelMesh,
    sampleWorldWaveInto,
    vortexBefore: { ...vortexWave },
  };
}

function stage(presentation: DeathStarePresentation): void {
  presentation.stage({
    eventId: 'death-stare',
    targetInstanceId: null,
    variantSeed: 8,
  });
}

describe('DeathStarePresentation', () => {
  it('preallocates one authored giant face and twelve water strands', () => {
    const fixture = setup();
    const presentation = new DeathStarePresentation(fixture.environment);
    const root = presentation.worldRoot;
    const angler = root.getObjectByName('death-stare-angler')!;
    const drainStrands = root.children.filter(
      ({ name }) => name.startsWith('death-stare-water-strand-'),
    );

    expect(fixture.create).toHaveBeenCalledExactlyOnceWith('anglerFish');
    expect(angler).toBeDefined();
    expect(angler.userData.faceLongestDimension).toBe(5.6);
    expect(root.getObjectByName('death-stare-dominant-eye')).toBeDefined();
    expect(root.getObjectByName('death-stare-recessed-eye')).toBeDefined();
    expect(root.getObjectByName('death-stare-jaw-interior')).toBeDefined();
    expect(root.getObjectByName('death-stare-lure')).toBeDefined();
    expect(angler.children.filter(
      ({ name }) => name.startsWith('death-stare-tooth-'),
    ).length).toBeGreaterThan(8);
    expect(drainStrands).toHaveLength(12);
  });

  it('holds the visible gaze and samples each fixed water strand', async () => {
    const fixture = setup();
    const presentation = new DeathStarePresentation(fixture.environment);
    stage(presentation);
    fixture.sampleWorldWaveInto.mockClear();
    fixture.create.mockClear();

    const reveal = presentation.reveal();
    presentation.update(2.3, 2.3);
    const heldPosition = presentation.worldRoot
      .getObjectByName('death-stare-angler')!.position.toArray();
    presentation.update(2.82, 0.52);
    expect(presentation.worldRoot
      .getObjectByName('death-stare-angler')!.position.toArray()).toEqual(heldPosition);
    presentation.update(3.2, 0.38);
    await reveal;

    expect(fixture.sampleWorldWaveInto).toHaveBeenCalledTimes(48);
    expect(fixture.create).not.toHaveBeenCalled();
    expect(fixture.environment.vortexWave).toEqual(fixture.vortexBefore);
  });

  it('resets a used supply before the reaction sample', async () => {
    const umbrellaId = 'umbrella-7' as ItemInstanceId;
    const fixture = setup([umbrellaId]);
    const presentation = new DeathStarePresentation(fixture.environment);
    stage(presentation);

    const use = presentation.playItemUse('umbrella', umbrellaId);
    presentation.update(0, 0.7);
    expect(fixture.actors.get(umbrellaId)!.applyPose.mock.lastCall![0].roll).not.toBe(0);
    presentation.update(0, 0.55);
    await use;
    fixture.actors.get(umbrellaId)!.applyPose.mockClear();

    const reaction = presentation.react(outcome({ selected: umbrellaId }));
    expect(fixture.actors.get(umbrellaId)!.applyPose.mock.calls[0]![0]).toMatchObject({
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
    presentation.update(1.25, 1.25);
    await reaction;
  });

  it('uses the exact lost ID and pulls only that supply into the mouth', async () => {
    const selectedId = 'flashlight-2' as ItemInstanceId;
    const lostId = 'flashlight-3' as ItemInstanceId;
    const fixture = setup([selectedId, lostId]);
    const presentation = new DeathStarePresentation(fixture.environment);
    const lostActor = fixture.actors.get(lostId)!;
    const actorParent = new Group();
    actorParent.add(lostActor.root);
    lostActor.root.position.set(3.4, 0.36, 0.72);
    stage(presentation);

    const use = presentation.playItemUse('flashlight', selectedId);
    presentation.update(0, 1.25);
    await use;
    const mouthWorld = presentation.worldRoot
      .getObjectByName('death-stare-mouth-target')!
      .getWorldPosition(new Vector3());
    const reaction = presentation.react(outcome({
      selected: selectedId,
      lost: [lostId],
    }));
    presentation.update(0.8, 0.8);

    expect(fixture.borrowEventActor).toHaveBeenCalledWith(lostId);
    expect(lostActor.applyPose.mock.lastCall![0].x).toBeLessThan(0);
    expect(fixture.actors.get(selectedId)!.release).toHaveBeenCalledOnce();
    presentation.update(1.25, 0.45);
    await reaction;
    const finalPose = lostActor.applyPose.mock.lastCall![0];
    expect(lostActor.root.position.x + finalPose.x).toBeCloseTo(mouthWorld.x);
    expect(lostActor.root.position.y + finalPose.y).toBeCloseTo(mouthWorld.y);
    expect(lostActor.root.position.z + finalPose.z).toBeCloseTo(mouthWorld.z);
    expect(lostActor.releaseOnNextSync).toHaveBeenCalledOnce();
  });

  it('uses an additive camera root without changing the camera base', async () => {
    const fixture = setup();
    const presentation = new DeathStarePresentation(fixture.environment);
    const baseRotation = fixture.cameraBase.rotation.toArray();
    stage(presentation);
    const reaction = presentation.react(outcome({ hull: -44, health: -60 }));
    presentation.update(0.7, 0.7);

    expect(fixture.cameraEffectsRoot.rotation.x).not.toBe(0);
    expect(fixture.cameraBase.rotation.toArray()).toEqual(baseRotation);
    expect(presentation.boatRoot.rotation.z).not.toBe(0);

    presentation.update(1.25, 0.55);
    await reaction;
    expect(fixture.cameraEffectsRoot.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(fixture.cameraBase.rotation.toArray()).toEqual(baseRotation);
    expect(presentation.boatRoot.rotation.z).toBe(0);
  });

  it('tracks the live pitched mouth during an attack and loss', async () => {
    const lostId = 'flashlight-8' as ItemInstanceId;
    const fixture = setup([lostId]);
    const presentation = new DeathStarePresentation(fixture.environment);
    const lostActor = fixture.actors.get(lostId)!;
    const actorParent = new Group();
    actorParent.position.set(1.1, -0.2, 0.7);
    actorParent.rotation.set(0.08, -0.31, 0.04);
    actorParent.add(lostActor.root);
    lostActor.root.position.set(2.8, 0.48, -0.36);
    stage(presentation);

    const reaction = presentation.react(outcome({
      hull: -44,
      health: -60,
      lost: [lostId],
    }));
    presentation.update(1, 1);

    const angler = presentation.worldRoot.getObjectByName('death-stare-angler')!;
    const mouthInActorParent = presentation.worldRoot
      .getObjectByName('death-stare-mouth-target')!
      .getWorldPosition(new Vector3());
    actorParent.worldToLocal(mouthInActorParent);
    const heldPose = lostActor.applyPose.mock.lastCall![0];

    expect(angler.rotation.x).not.toBe(0);
    expect(lostActor.root.position.x + heldPose.x).toBeCloseTo(mouthInActorParent.x);
    expect(lostActor.root.position.y + heldPose.y).toBeCloseTo(mouthInActorParent.y);
    expect(lostActor.root.position.z + heldPose.z).toBeCloseTo(mouthInActorParent.z);

    presentation.update(1.25, 0.25);
    await reaction;
  });

  it('disposes its model and authored resources once', () => {
    const fixture = setup();
    const presentation = new DeathStarePresentation(fixture.environment);
    const tooth = presentation.worldRoot.getObjectByName('death-stare-tooth-1') as Mesh;
    const strand = presentation.worldRoot.getObjectByName(
      'death-stare-water-strand-1',
    ) as Mesh;
    const toothGeometryDispose = vi.spyOn(tooth.geometry, 'dispose');
    const toothMaterialDispose = vi.spyOn(
      tooth.material as MeshStandardMaterial,
      'dispose',
    );
    const strandGeometryDispose = vi.spyOn(strand.geometry, 'dispose');
    const strandMaterialDispose = vi.spyOn(
      strand.material as MeshStandardMaterial,
      'dispose',
    );

    presentation.dispose();
    presentation.dispose();

    expect(fixture.modelDispose).toHaveBeenCalledOnce();
    expect(toothGeometryDispose).toHaveBeenCalledOnce();
    expect(toothMaterialDispose).toHaveBeenCalledOnce();
    expect(strandGeometryDispose).toHaveBeenCalledOnce();
    expect(strandMaterialDispose).toHaveBeenCalledOnce();
    expect(presentation.worldRoot.children).toHaveLength(0);
    expect(presentation.boatRoot.children).toHaveLength(0);
  });
});

// Importance: 5/5. Protects shared vortex state, fixed pools, exact losses, bridges, and cleanup.
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
import { WhirlpoolPresentation } from '../src/survival/events/WhirlpoolPresentation';
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
  selected?: ItemInstanceId | null;
  broken?: readonly ItemInstanceId[];
  lost?: readonly ItemInstanceId[];
} = {}): EventOutcomePresentation {
  const deltas = options.hull === undefined ? {} : { hull: options.hull };
  return {
    outcome: {
      accepted: true,
      code: 'event-resolved',
      message: 'Resolved.',
      deltas,
      cue: 'impact',
    },
    resourceDeltas: deltas,
    brokenInstanceIds: options.broken ?? [],
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
    new MeshStandardMaterial({ color: 0x173238 }),
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
    sample.height = 0.18;
    sample.displacementX = 0.02;
    sample.displacementZ = -0.03;
    sample.normal.x = 0.04;
    sample.normal.y = 0.99;
    sample.normal.z = -0.05;
  });
  const cameraBase = new Group();
  const cameraEffectsRoot = new Group();
  cameraBase.rotation.set(0.16, -0.22, 0.04);
  cameraBase.add(cameraEffectsRoot);
  const boatBase = new Group();
  const boatEffectsRoot = new Group();
  boatBase.rotation.set(-0.08, 0.12, -0.03);
  boatBase.add(boatEffectsRoot);
  const vortexWave = {
    centerX: 4,
    centerZ: -2,
    radius: 5,
    depression: 0.4,
    tangentStrength: 0.3,
    phase: 0.2,
    strength: 0.5,
  };
  const environment = {
    eventModels: { create } as unknown as EventModelLibrary,
    supplies: { borrowEventActor } as unknown as BoatSupplyDisplay,
    vortexWave,
    sampleWorldWaveInto,
    cameraEffectsRoot,
    boatEffectsRoot,
  } satisfies DedicatedEventEnvironment;
  return {
    actors,
    boatBase,
    boatEffectsRoot,
    borrowEventActor,
    cameraBase,
    cameraEffectsRoot,
    create,
    environment,
    modelDispose,
    modelMesh,
    sampleWorldWaveInto,
    vortexWave,
  };
}

function stage(presentation: WhirlpoolPresentation): void {
  presentation.stage({
    eventId: 'whirlpool',
    targetInstanceId: null,
    variantSeed: 13,
  });
}

describe('WhirlpoolPresentation', () => {
  it('preallocates the core, fourteen ribbons, twelve debris objects, ten links, and Ring shell', () => {
    const fixture = setup();
    const presentation = new WhirlpoolPresentation(fixture.environment);

    expect(fixture.create).toHaveBeenCalledExactlyOnceWith('whirlpoolCore');
    expect(presentation.worldRoot.getObjectByName('whirlpool-core')?.userData).toMatchObject({
      visualOnly: true,
      sourceModel: 'Tornado',
    });
    expect(
      presentation.worldRoot.getObjectByName('whirlpool-core')!.position.y,
    ).toBeGreaterThan(0);
    expect(
      presentation.worldRoot.getObjectByName('whirlpool-core')!.position.z,
    ).toBeLessThan(-5);
    expect(
      presentation.worldRoot.getObjectByName('whirlpool-core')!.scale.x,
    ).toBeLessThan(0.35);
    expect(presentation.worldRoot.children.filter(
      ({ name }) => name.startsWith('whirlpool-foam-ribbon-'),
    )).toHaveLength(14);
    expect(presentation.worldRoot.children.filter(
      ({ name }) => name.startsWith('whirlpool-debris-'),
    )).toHaveLength(12);
    expect(presentation.boatRoot.children.filter(
      ({ name }) => name.startsWith('whirlpool-chain-link-'),
    )).toHaveLength(10);
    expect(presentation.boatRoot.getObjectByName('whirlpool-ring-shell')).toBeDefined();
    expect(presentation.worldRoot.getObjectByName('whirlpool-core')!.scale.y).toBe(0.08);
  });

  it('mutates the shared vortex and samples every surface actor', async () => {
    const fixture = setup();
    const presentation = new WhirlpoolPresentation(fixture.environment);
    const sharedVortex = fixture.environment.vortexWave;
    stage(presentation);
    const reveal = presentation.reveal();
    fixture.sampleWorldWaveInto.mockClear();

    presentation.update(3, 3);
    await reveal;

    expect(fixture.environment.vortexWave).toBe(sharedVortex);
    expect(fixture.vortexWave).toMatchObject({
      centerX: 0.6,
      centerZ: -5.6,
      radius: 8.2,
      strength: 1,
    });
    const foam = presentation.worldRoot.children.filter(
      ({ name, visible }) => name.startsWith('whirlpool-foam-ribbon-') && visible,
    );
    expect(foam).toHaveLength(14);
    expect(foam.every(({ position, rotation, scale }) => (
      position.z < -5
        && position.y > 0.8
        && rotation.x > 0.8
        && rotation.x < 1.3
        && scale.x <= 2.2
    ))).toBe(true);
    expect(fixture.vortexWave.depression).toBeGreaterThan(1);
    expect(fixture.vortexWave.tangentStrength).toBeGreaterThan(0.8);
    expect(fixture.sampleWorldWaveInto).toHaveBeenCalledTimes(26);
  });

  it('shows the Anchor catch and broken chain without changing base transforms', async () => {
    const anchorId = 'anchor-4' as ItemInstanceId;
    const fixture = setup([anchorId]);
    const cameraBase = fixture.cameraBase.rotation.toArray();
    const boatBase = fixture.boatBase.rotation.toArray();
    const presentation = new WhirlpoolPresentation(fixture.environment);
    stage(presentation);

    const use = presentation.playItemUse('anchor', anchorId);
    presentation.update(0.62, 0.62);
    expect(presentation.boatRoot.children.filter(
      ({ name, visible }) => name.startsWith('whirlpool-chain-link-') && visible,
    )).toHaveLength(10);
    expect(fixture.actors.get(anchorId)!.applyPose.mock.lastCall![0].y).toBeLessThan(-0.5);
    presentation.update(1.25, 0.63);
    await use;

    const reaction = presentation.react(outcome({
      hull: -8,
      selected: anchorId,
      broken: [anchorId],
    }));
    presentation.update(0.59, 0.59);
    expect(fixture.boatEffectsRoot.rotation.y).toBeLessThan(-0.2);
    expect(fixture.cameraEffectsRoot.rotation.z).not.toBe(0);
    expect(fixture.cameraBase.rotation.toArray()).toEqual(cameraBase);
    expect(fixture.boatBase.rotation.toArray()).toEqual(boatBase);
    presentation.update(1.4, 0.81);
    await reaction;
  });

  it('compresses the Ring shell and the exact selected Ring actor', async () => {
    const ringId = 'swimRing-6' as ItemInstanceId;
    const fixture = setup([ringId]);
    const presentation = new WhirlpoolPresentation(fixture.environment);
    stage(presentation);

    const use = presentation.playItemUse('swimRing', ringId);
    presentation.update(0.62, 0.62);
    const shell = presentation.boatRoot.getObjectByName('whirlpool-ring-shell')!;

    expect(shell.visible).toBe(true);
    expect(shell.scale.y).toBeLessThan(0.4);
    expect(fixture.borrowEventActor).toHaveBeenCalledExactlyOnceWith(ringId);
    expect(fixture.actors.get(ringId)!.applyPose.mock.lastCall![0].scaleY).toBeLessThan(0.5);
    presentation.update(1.25, 0.63);
    await use;
  });

  it('uses the two exact lost IDs during one severe roll', async () => {
    const nearbyId = 'bucket-1' as ItemInstanceId;
    const firstLostId = 'map-3' as ItemInstanceId;
    const secondLostId = 'map-8' as ItemInstanceId;
    const fixture = setup([nearbyId, firstLostId, secondLostId]);
    const presentation = new WhirlpoolPresentation(fixture.environment);
    stage(presentation);

    const reaction = presentation.react(outcome({
      hull: -72,
      lost: [firstLostId, secondLostId],
    }));
    presentation.update(0.7, 0.7);

    expect(fixture.borrowEventActor).toHaveBeenCalledTimes(2);
    expect(fixture.borrowEventActor).toHaveBeenNthCalledWith(1, firstLostId);
    expect(fixture.borrowEventActor).toHaveBeenNthCalledWith(2, secondLostId);
    expect(fixture.borrowEventActor).not.toHaveBeenCalledWith(nearbyId);
    expect(fixture.actors.get(firstLostId)!.applyPose.mock.lastCall![0].x).toBeGreaterThan(0);
    expect(fixture.actors.get(secondLostId)!.applyPose.mock.lastCall![0].x).toBeLessThan(0);
    expect(Math.abs(fixture.boatEffectsRoot.rotation.z)).toBeGreaterThan(0.35);

    presentation.update(1.4, 0.7);
    await reaction;
    expect(fixture.actors.get(firstLostId)!.releaseOnNextSync).toHaveBeenCalledOnce();
    expect(fixture.actors.get(secondLostId)!.releaseOnNextSync).toHaveBeenCalledOnce();
    presentation.clear();
    presentation.dispose();
    expect(fixture.actors.get(firstLostId)!.release).not.toHaveBeenCalled();
    expect(fixture.actors.get(secondLostId)!.release).not.toHaveBeenCalled();
  });

  it('compacts successful lost actors when an exact actor is unavailable', async () => {
    const unavailableId = 'map-3' as ItemInstanceId;
    const availableId = 'map-8' as ItemInstanceId;
    const fixture = setup([availableId]);
    const presentation = new WhirlpoolPresentation(fixture.environment);
    stage(presentation);

    const reaction = presentation.react(outcome({
      hull: -72,
      lost: [unavailableId, availableId],
    }));
    presentation.update(0.7, 0.7);

    expect(fixture.borrowEventActor).toHaveBeenNthCalledWith(1, unavailableId);
    expect(fixture.borrowEventActor).toHaveBeenNthCalledWith(2, availableId);
    expect(fixture.actors.get(availableId)!.applyPose.mock.lastCall![0].x)
      .toBeGreaterThan(0);

    presentation.update(1.4, 0.7);
    await reaction;
    expect(fixture.actors.get(availableId)!.releaseOnNextSync).toHaveBeenCalledOnce();
    expect(fixture.actors.get(availableId)!.release).not.toHaveBeenCalled();
  });

  it('settles handles, visuals, effects, and vortex to a stable identity', async () => {
    const firstLostId = 'map-3' as ItemInstanceId;
    const secondLostId = 'map-8' as ItemInstanceId;
    const fixture = setup([firstLostId, secondLostId]);
    const presentation = new WhirlpoolPresentation(fixture.environment);
    stage(presentation);
    const reaction = presentation.react(outcome({
      hull: -72,
      lost: [firstLostId, secondLostId],
    }));
    presentation.update(0.7, 0.7);

    expect(fixture.vortexWave.strength).toBeGreaterThan(0);
    expect(fixture.boatEffectsRoot.rotation.y).not.toBe(0);
    presentation.settleForVisibilityChange();
    await reaction;

    expect(fixture.actors.get(firstLostId)!.release).toHaveBeenCalledOnce();
    expect(fixture.actors.get(secondLostId)!.release).toHaveBeenCalledOnce();
    expect(fixture.actors.get(firstLostId)!.releaseOnNextSync).not.toHaveBeenCalled();
    expect(fixture.actors.get(secondLostId)!.releaseOnNextSync).not.toHaveBeenCalled();
    expect(presentation.worldRoot.visible).toBe(false);
    expect(presentation.boatRoot.visible).toBe(false);
    expect(fixture.cameraEffectsRoot.position.toArray()).toEqual([0, 0, 0]);
    expect(fixture.cameraEffectsRoot.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(fixture.cameraEffectsRoot.scale.toArray()).toEqual([1, 1, 1]);
    expect(fixture.boatEffectsRoot.position.toArray()).toEqual([0, 0, 0]);
    expect(fixture.boatEffectsRoot.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(fixture.boatEffectsRoot.scale.toArray()).toEqual([1, 1, 1]);
    expect(fixture.vortexWave).toEqual({
      centerX: 0,
      centerZ: 0,
      radius: 0,
      depression: 0,
      tangentStrength: 0,
      phase: 0,
      strength: 0,
    });

    presentation.update(4, 1);
    expect(fixture.cameraEffectsRoot.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(fixture.boatEffectsRoot.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(fixture.vortexWave.strength).toBe(0);
    expect(presentation.worldRoot.visible).toBe(false);
    expect(presentation.boatRoot.visible).toBe(false);
  });

  it('disposes active actors, the model, and authored resources once', async () => {
    const firstLostId = 'flashlight-3' as ItemInstanceId;
    const secondLostId = 'bucket-8' as ItemInstanceId;
    const fixture = setup([firstLostId, secondLostId]);
    const presentation = new WhirlpoolPresentation(fixture.environment);
    const foam = presentation.worldRoot.getObjectByName('whirlpool-foam-ribbon-1') as Mesh;
    const chain = presentation.boatRoot.getObjectByName('whirlpool-chain-link-1') as Mesh;
    const foamGeometryDispose = vi.spyOn(foam.geometry, 'dispose');
    const foamMaterialDispose = vi.spyOn(
      foam.material as MeshStandardMaterial,
      'dispose',
    );
    const chainGeometryDispose = vi.spyOn(chain.geometry, 'dispose');
    const chainMaterialDispose = vi.spyOn(
      chain.material as MeshStandardMaterial,
      'dispose',
    );
    stage(presentation);
    const reaction = presentation.react(outcome({
      hull: -72,
      lost: [firstLostId, secondLostId],
    }));
    presentation.update(0.4, 0.4);

    presentation.dispose();
    presentation.dispose();
    await reaction;

    expect(fixture.modelDispose).toHaveBeenCalledOnce();
    expect(foamGeometryDispose).toHaveBeenCalledOnce();
    expect(foamMaterialDispose).toHaveBeenCalledOnce();
    expect(chainGeometryDispose).toHaveBeenCalledOnce();
    expect(chainMaterialDispose).toHaveBeenCalledOnce();
    expect(presentation.worldRoot.children).toHaveLength(0);
    expect(presentation.boatRoot.children).toHaveLength(0);
    expect(fixture.actors.get(firstLostId)!.release).toHaveBeenCalledOnce();
    expect(fixture.actors.get(secondLostId)!.release).toHaveBeenCalledOnce();
    expect(fixture.actors.get(firstLostId)!.releaseOnNextSync).not.toHaveBeenCalled();
    expect(fixture.actors.get(secondLostId)!.releaseOnNextSync).not.toHaveBeenCalled();
    expect(fixture.vortexWave.strength).toBe(0);
  });
});

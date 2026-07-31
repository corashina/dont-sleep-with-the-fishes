// Importance: 5/5. Protects the distant water hole, fixed view, exact losses, and cleanup.
import {
  BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import type {
  BorrowedSupplyActor,
  BoatSupplyDisplay,
  SupplyAdditivePose,
} from '../src/survival/BoatSupplyDisplay';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
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
  const create = vi.fn(() => {
    throw new Error('Whirlpool must not create a model');
  });
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
  const cameraEffectsRoot = new Group();
  cameraEffectsRoot.position.set(0.2, -0.1, 0.3);
  cameraEffectsRoot.rotation.set(0.16, -0.22, 0.04);
  cameraEffectsRoot.scale.set(1.01, 0.99, 1.02);
  const boatEffectsRoot = new Group();
  boatEffectsRoot.position.set(-0.3, 0.2, -0.1);
  boatEffectsRoot.rotation.set(-0.08, 0.12, -0.03);
  boatEffectsRoot.scale.set(0.98, 1.02, 1.01);
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
    boatEffectsRoot,
    borrowEventActor,
    cameraEffectsRoot,
    create,
    environment,
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

function transforms(root: Group): number[] {
  return [
    ...root.position.toArray(),
    root.rotation.x,
    root.rotation.y,
    root.rotation.z,
    ...root.scale.toArray(),
  ];
}

describe('WhirlpoolPresentation', () => {
  it('builds only six shared spiral water streams outside the boat', () => {
    const fixture = setup();
    const presentation = new WhirlpoolPresentation(fixture.environment);
    const streams = presentation.worldRoot.children.filter(
      ({ name }) => name.startsWith('whirlpool-water-stream-'),
    ) as Mesh[];

    expect(fixture.create).not.toHaveBeenCalled();
    expect(streams).toHaveLength(6);
    expect(presentation.worldRoot.getObjectByName('whirlpool-core')).toBeUndefined();
    expect(presentation.worldRoot.children.some(
      ({ name }) => name.includes('debris') || name.includes('foam'),
    )).toBe(false);
    expect(presentation.boatRoot.children).toHaveLength(0);
    expect(new Set(streams.map(({ geometry }) => geometry))).toHaveLength(1);
    expect(new Set(streams.map(({ material }) => material))).toHaveLength(1);
    expect(presentation.worldRoot.userData.distanceFromBoat).toBeGreaterThanOrEqual(7);
    expect(presentation.worldRoot.userData.distanceFromBoat).toBeLessThanOrEqual(9);
    expect(presentation.worldRoot.userData.vortexRadius)
      .toBeLessThan(presentation.worldRoot.userData.distanceFromBoat);

    const positions = streams[0]!.geometry.getAttribute('position') as BufferAttribute;
    let lowest = 0;
    for (let index = 0; index < positions.count; index += 1) {
      lowest = Math.min(lowest, positions.getY(index));
    }
    expect(lowest).toBeLessThan(-2.7);
  });

  it('opens the shared water depression without moving the camera or boat', async () => {
    const fixture = setup();
    const cameraBefore = transforms(fixture.cameraEffectsRoot);
    const boatBefore = transforms(fixture.boatEffectsRoot);
    const presentation = new WhirlpoolPresentation(fixture.environment);
    const sharedVortex = fixture.environment.vortexWave;
    stage(presentation);
    const reveal = presentation.reveal();
    fixture.sampleWorldWaveInto.mockClear();

    presentation.update(3, 3);
    await reveal;

    expect(fixture.environment.vortexWave).toBe(sharedVortex);
    expect(fixture.vortexWave).toMatchObject({
      centerX: 4.6,
      centerZ: -6.8,
      radius: 2.35,
      depression: 1.55,
      strength: 1,
    });
    expect(Math.hypot(fixture.vortexWave.centerX, fixture.vortexWave.centerZ))
      .toBeGreaterThan(fixture.vortexWave.radius);
    expect(fixture.sampleWorldWaveInto).toHaveBeenCalledOnce();
    expect(presentation.worldRoot.children.every(({ visible }) => visible)).toBe(true);
    expect(transforms(fixture.cameraEffectsRoot)).toEqual(cameraBefore);
    expect(transforms(fixture.boatEffectsRoot)).toEqual(boatBefore);
  });

  it('uses minimal item poses and never moves the camera or boat', async () => {
    const anchorId = 'anchor-4' as ItemInstanceId;
    const ringId = 'swimRing-6' as ItemInstanceId;
    const fixture = setup([anchorId, ringId]);
    const cameraBefore = transforms(fixture.cameraEffectsRoot);
    const boatBefore = transforms(fixture.boatEffectsRoot);
    const presentation = new WhirlpoolPresentation(fixture.environment);
    stage(presentation);

    const anchorUse = presentation.playItemUse('anchor', anchorId);
    presentation.update(0.62, 0.62);
    expect(fixture.actors.get(anchorId)!.applyPose.mock.lastCall![0]).toMatchObject({
      x: expect.any(Number),
      z: expect.any(Number),
    });
    expect(fixture.actors.get(anchorId)!.applyPose.mock.lastCall![0].x).toBeGreaterThan(0.5);
    expect(fixture.actors.get(anchorId)!.applyPose.mock.lastCall![0].z).toBeLessThan(-0.5);
    presentation.update(1.25, 0.63);
    await anchorUse;

    const ringUse = presentation.playItemUse('swimRing', ringId);
    presentation.update(1.87, 0.62);
    expect(fixture.actors.get(ringId)!.applyPose.mock.lastCall![0].scaleY)
      .toBeGreaterThan(0.85);
    presentation.update(2.5, 0.63);
    await ringUse;
    expect(transforms(fixture.cameraEffectsRoot)).toEqual(cameraBefore);
    expect(transforms(fixture.boatEffectsRoot)).toEqual(boatBefore);
  });

  it('uses the two exact lost IDs and pulls both toward starboard', async () => {
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
    expect(fixture.actors.get(secondLostId)!.applyPose.mock.lastCall![0].x).toBeGreaterThan(0);

    presentation.update(1.4, 0.7);
    await reaction;
    expect(fixture.actors.get(firstLostId)!.releaseOnNextSync).toHaveBeenCalledOnce();
    expect(fixture.actors.get(secondLostId)!.releaseOnNextSync).toHaveBeenCalledOnce();
  });

  it('settles and clears without changing either effect root', async () => {
    const fixture = setup();
    const cameraBefore = transforms(fixture.cameraEffectsRoot);
    const boatBefore = transforms(fixture.boatEffectsRoot);
    const presentation = new WhirlpoolPresentation(fixture.environment);
    stage(presentation);
    const reveal = presentation.reveal();
    presentation.update(0.4, 0.4);

    presentation.settleForVisibilityChange();
    await reveal;
    expect(fixture.vortexWave.strength).toBeGreaterThan(0);
    expect(transforms(fixture.cameraEffectsRoot)).toEqual(cameraBefore);
    expect(transforms(fixture.boatEffectsRoot)).toEqual(boatBefore);

    presentation.clear();
    expect(presentation.worldRoot.visible).toBe(false);
    expect(presentation.boatRoot.visible).toBe(false);
    expect(fixture.vortexWave).toEqual({
      centerX: 0,
      centerZ: 0,
      radius: 0,
      depression: 0,
      tangentStrength: 0,
      phase: 0,
      strength: 0,
    });
    expect(transforms(fixture.cameraEffectsRoot)).toEqual(cameraBefore);
    expect(transforms(fixture.boatEffectsRoot)).toEqual(boatBefore);
  });

  it('disposes active actors and shared stream resources once', async () => {
    const firstLostId = 'flashlight-3' as ItemInstanceId;
    const secondLostId = 'bucket-8' as ItemInstanceId;
    const fixture = setup([firstLostId, secondLostId]);
    const presentation = new WhirlpoolPresentation(fixture.environment);
    const firstStream = presentation.worldRoot.getObjectByName(
      'whirlpool-water-stream-1',
    ) as Mesh;
    const geometryDispose = vi.spyOn(firstStream.geometry, 'dispose');
    const materialDispose = vi.spyOn(
      firstStream.material as MeshStandardMaterial,
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

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(presentation.worldRoot.children).toHaveLength(0);
    expect(presentation.boatRoot.children).toHaveLength(0);
    expect(fixture.actors.get(firstLostId)!.release).toHaveBeenCalledOnce();
    expect(fixture.actors.get(secondLostId)!.release).toHaveBeenCalledOnce();
    expect(fixture.vortexWave.strength).toBe(0);
  });
});

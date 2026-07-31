// Importance: 5/5. Protects sparse swarm scale, shared assets, catches, and cleanup.
import {
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
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
import { AnglerfishSwarmPresentation } from '../src/survival/events/AnglerfishSwarmPresentation';
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
  food?: number;
  bait?: number;
  hull?: number;
  health?: number;
  selected?: ItemInstanceId | null;
  broken?: readonly ItemInstanceId[];
} = {}): EventOutcomePresentation {
  const deltas = {
    ...(options.food === undefined ? {} : { food: options.food }),
    ...(options.bait === undefined ? {} : { bait: options.bait }),
    ...(options.hull === undefined ? {} : { hull: options.hull }),
    ...(options.health === undefined ? {} : { health: options.health }),
  };
  return {
    outcome: {
      accepted: true,
      code: 'event-resolved',
      message: 'Resolved.',
      deltas,
      cue: 'fish',
    },
    resourceDeltas: deltas,
    brokenInstanceIds: options.broken ?? [],
    lostInstanceIds: [],
    consumedInstanceIds: [],
    selectedInstanceId: options.selected ?? null,
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
      new MeshStandardMaterial({ color: 0x54727a, roughness: 0.4 }),
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
    sample.height = 0.22;
    sample.displacementX = 0.02;
    sample.displacementZ = -0.015;
    sample.normal.x = 0.07;
    sample.normal.y = 0.99;
    sample.normal.z = -0.05;
  });
  const cameraBase = new Group();
  const cameraEffectsRoot = new Group();
  cameraBase.rotation.set(0.18, -0.22, 0.06);
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
    modelDisposes,
    modelMeshes,
    modelRoots,
    sampleWorldWaveInto,
    vortexBefore: { ...vortexWave },
  };
}

function stage(presentation: AnglerfishSwarmPresentation, variantSeed = 27): void {
  presentation.stage({
    eventId: 'swarm-of-anglerfish',
    targetInstanceId: null,
    variantSeed,
  });
}

describe('AnglerfishSwarmPresentation', () => {
  it('preallocates six anglers, two cold lights, two catches, and two splashes', () => {
    const fixture = setup();
    const presentation = new AnglerfishSwarmPresentation(fixture.environment);
    stage(presentation);
    const anglerRoots = presentation.worldRoot.children.filter(
      ({ name }) => name.startsWith('swarm-angler-'),
    );
    const lureLights = presentation.worldRoot.children.filter(
      ({ name }) => name.startsWith('swarm-lure-light-'),
    );
    const lureMarkers = presentation.worldRoot.children.filter(
      ({ name }) => name.startsWith('swarm-lure-marker-'),
    );

    expect(fixture.create).toHaveBeenCalledOnce();
    expect(fixture.create).toHaveBeenCalledWith('anglerFish');
    expect(anglerRoots).toHaveLength(6);
    expect(new Set(anglerRoots.map(({ scale }) => scale.x)).size).toBe(6);
    expect(anglerRoots.every(({ scale }) => scale.x < 1)).toBe(true);
    expect(lureLights).toHaveLength(2);
    expect(lureLights.every((light) => light instanceof PointLight)).toBe(true);
    expect(lureMarkers).toHaveLength(6);
    expect(lureMarkers.every((marker) => marker instanceof Mesh)).toBe(true);
    const catches = presentation.boatRoot.children.filter(
      ({ name }) => name.startsWith('swarm-catch-actor-'),
    );
    expect(catches).toHaveLength(2);
    expect(catches.every(({ children }) => children.length === 4)).toBe(true);
    expect(catches.every(
      ({ userData }) => userData.catchSource === 'authored-low-poly',
    )).toBe(true);
    expect(presentation.worldRoot.children.filter(
      ({ name }) => name.startsWith('swarm-splash-'),
    )).toHaveLength(2);
    expect(anglerRoots.slice(1).every((root) => (
      (root.children[0] as Mesh).geometry === (anglerRoots[0]!.children[0] as Mesh).geometry
    ))).toBe(true);
    expect(anglerRoots.slice(1).every((root) => (
      (root.children[0] as Mesh).material === (anglerRoots[0]!.children[0] as Mesh).material
    ))).toBe(true);
    expect(fixture.modelMeshes.every(
      ({ material }) => (material as MeshStandardMaterial).flatShading,
    )).toBe(true);
  });

  it('shows two lure lights before the bodies and samples every fish without setup', async () => {
    const fixture = setup();
    const presentation = new AnglerfishSwarmPresentation(fixture.environment);
    stage(presentation);
    fixture.sampleWorldWaveInto.mockClear();
    fixture.create.mockClear();

    const reveal = presentation.reveal();
    presentation.update(0.522, 0.522);
    const firstWaveSamples = fixture.sampleWorldWaveInto.mock.calls
      .slice(0, 6)
      .map(([sample]) => sample);
    const secondWaveSamples = fixture.sampleWorldWaveInto.mock.calls
      .slice(6, 12)
      .map(([sample]) => sample);
    expect(presentation.worldRoot.children.filter(
      ({ name, visible }) => name.startsWith('swarm-lure-light-') && visible,
    )).toHaveLength(2);
    expect(presentation.worldRoot.children.filter(
      ({ name, visible }) => name.startsWith('swarm-lure-marker-') && visible,
    )).toHaveLength(2);
    expect(presentation.worldRoot.children.filter(
      ({ name, visible }) => name.startsWith('swarm-angler-') && visible,
    )).toHaveLength(0);
    expect(fixture.sampleWorldWaveInto).toHaveBeenCalledTimes(12);
    expect(secondWaveSamples).toEqual(firstWaveSamples);

    presentation.update(1.798, 1.276);
    expect(fixture.cameraEffectsRoot.rotation.y).toBe(0);
    presentation.update(2.9, 1.102);
    await reveal;
    expect(presentation.worldRoot.children.filter(
      ({ name, visible, position }) => (
        name.startsWith('swarm-angler-') && visible && position.y > 0.9
      ),
    )).toHaveLength(6);
    expect(presentation.worldRoot.children.filter(
      ({ name, visible, scale }) => (
        name.startsWith('swarm-angler-') && visible && scale.x > 0.65
      ),
    )).toHaveLength(6);
    const heldAnglers = presentation.worldRoot.children.filter(
      ({ name, visible }) => name.startsWith('swarm-angler-') && visible,
    );
    const heldLures = presentation.worldRoot.children.filter(
      ({ name, visible }) => name.startsWith('swarm-lure-marker-') && visible,
    );
    expect(heldAnglers.filter(({ position }) => position.z < -3).length)
      .toBe(2);
    expect(heldAnglers.some(({ position }) => position.z > 2.5)).toBe(true);
    expect(heldAnglers.some(({ position }) => position.x < -1.7)).toBe(true);
    expect(heldAnglers.some(({ position }) => position.x > 1.7)).toBe(true);
    expect(heldLures).toHaveLength(6);
    expect(heldLures.every(({ position }) => position.y > 1.1)).toBe(true);
    expect(heldLures.filter(({ position }) => position.z < -3).length)
      .toBe(2);
    expect(fixture.create).not.toHaveBeenCalled();
    expect(fixture.environment.vortexWave).toEqual(fixture.vortexBefore);
    expect(fixture.cameraEffectsRoot.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
  });

  it('uses exact actors, shows two catches, and keeps the camera fixed', async () => {
    const harpoonId = 'harpoonGun-4' as ItemInstanceId;
    const fixture = setup([harpoonId]);
    const baseRotation = fixture.cameraBase.rotation.toArray();
    const presentation = new AnglerfishSwarmPresentation(fixture.environment);
    stage(presentation);

    const use = presentation.playItemUse('harpoonGun', harpoonId);
    presentation.update(0.68, 0.68);
    expect(fixture.borrowEventActor).toHaveBeenCalledExactlyOnceWith(harpoonId);
    expect(fixture.actors.get(harpoonId)!.applyPose.mock.lastCall![0].pitch).not.toBe(0);
    presentation.update(1.2, 0.52);
    await expect(use).resolves.toBe(true);

    const reaction = presentation.react(outcome({ food: 2, selected: harpoonId }));
    presentation.update(2.35, 1.15);
    await reaction;
    expect(presentation.worldRoot.userData.foodDelta).toBe(2);
    expect(presentation.boatRoot.children.filter(
      ({ name, visible }) => name.startsWith('swarm-catch-actor-') && visible,
    )).toHaveLength(2);
    const remainingAnglers = presentation.worldRoot.children.filter(
      ({ name, visible }) => name.startsWith('swarm-angler-') && visible,
    );
    expect(remainingAnglers).toHaveLength(4);
    expect(remainingAnglers.filter(({ position }) => position.z < -3).length)
      .toBeGreaterThanOrEqual(1);
    expect(fixture.cameraBase.rotation.toArray()).toEqual(baseRotation);
    expect(fixture.cameraEffectsRoot.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
  });

  it('keeps the camera fixed during an attack', async () => {
    const fixture = setup();
    const baseRotation = fixture.cameraBase.rotation.toArray();
    const presentation = new AnglerfishSwarmPresentation(fixture.environment);
    stage(presentation);

    const reaction = presentation.react(outcome({ hull: -30, health: -50 }));
    presentation.update(0.55, 0.55);
    expect(fixture.cameraEffectsRoot.rotation.y).toBe(0);
    expect(fixture.cameraEffectsRoot.rotation.x).toBe(0);
    expect(fixture.cameraEffectsRoot.rotation.z).toBe(0);
    expect(fixture.cameraBase.rotation.toArray()).toEqual(baseRotation);
    expect(presentation.boatRoot.rotation.z).not.toBe(0);

    presentation.update(1.15, 0.6);
    await reaction;
    expect(fixture.cameraEffectsRoot.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(fixture.cameraBase.rotation.toArray()).toEqual(baseRotation);
    expect(presentation.boatRoot.rotation.z).toBe(0);
  });

  it('disposes every model and shared authored effect once', () => {
    const fixture = setup();
    const presentation = new AnglerfishSwarmPresentation(fixture.environment);
    const splash = presentation.worldRoot.getObjectByName('swarm-splash-1') as Mesh;
    const splashGeometryDispose = vi.spyOn(splash.geometry, 'dispose');
    const splashMaterialDispose = vi.spyOn(
      splash.material as MeshStandardMaterial,
      'dispose',
    );
    const catchBody = presentation.boatRoot.getObjectByName(
      'swarm-catch-actor-1-body',
    ) as Mesh;
    const catchGeometryDispose = vi.spyOn(catchBody.geometry, 'dispose');
    const catchMaterialDispose = vi.spyOn(
      catchBody.material as MeshStandardMaterial,
      'dispose',
    );

    presentation.dispose();
    presentation.dispose();

    expect(fixture.modelDisposes).toHaveLength(1);
    expect(fixture.modelDisposes.every((dispose) => dispose.mock.calls.length === 1)).toBe(true);
    expect(splashGeometryDispose).toHaveBeenCalledOnce();
    expect(splashMaterialDispose).toHaveBeenCalledOnce();
    expect(catchGeometryDispose).toHaveBeenCalledOnce();
    expect(catchMaterialDispose).toHaveBeenCalledOnce();
    expect(presentation.worldRoot.children).toHaveLength(0);
    expect(presentation.boatRoot.children).toHaveLength(0);
  });
});

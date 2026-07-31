// Importance: 5/5. Protects the exact threatened actor and Snatcher scene ownership.
import {
  BoxGeometry,
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
import { SnatcherPresentation } from '../src/survival/events/SnatcherPresentation';
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
  targetInstanceId: ItemInstanceId,
  lost: readonly ItemInstanceId[],
): EventOutcomePresentation {
  return {
    outcome: {
      accepted: true,
      code: 'event-resolved',
      message: 'Resolved.',
      deltas: {},
      cue: 'impact',
    },
    resourceDeltas: {},
    brokenInstanceIds: [],
    lostInstanceIds: lost,
    consumedInstanceIds: [],
    selectedInstanceId: null,
    selectedCondition: null,
    targetInstanceId,
  };
}

function setup(actorIds: readonly ItemInstanceId[]) {
  const modelRoot = new Group();
  const modelMesh = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshStandardMaterial({ color: 0x243431 }),
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
    sampleWorldWaveInto: vi.fn(),
  } satisfies DedicatedEventEnvironment;

  return {
    actors,
    borrowEventActor,
    create,
    environment,
    modelDispose,
    modelMesh,
    vortexBefore: { ...vortexWave },
  };
}

describe('Tentacle Attack presentation', () => {
  it('builds one authored tentacle from the approved model', () => {
    const targetId = 'map-1' as ItemInstanceId;
    const fixture = setup([targetId]);
    const presentation = new SnatcherPresentation(fixture.environment);

    expect(fixture.create).toHaveBeenCalledExactlyOnceWith('snatcher');
    expect(presentation.boatRoot.getObjectByName('tentacle-attack-tentacle')).toBeDefined();
    expect(presentation.boatRoot.getObjectByName('tentacle-attack-model')).toBeDefined();
    expect(presentation.boatRoot.getObjectByName('snatcher-finger-left')).toBeUndefined();
    expect(presentation.targetOutline.objectForTest().getObjectByName(
      'snatcher-warning-cage',
    )).toBeDefined();
    expect(fixture.modelMesh.material.flatShading).toBe(true);
  });

  it('borrows and outlines only the exact threatened actor during stage', () => {
    const targetId = 'map-1' as ItemInstanceId;
    const nearbyId = 'map-2' as ItemInstanceId;
    const fixture = setup([targetId, nearbyId]);
    const presentation = new SnatcherPresentation(fixture.environment);

    presentation.stage({
      eventId: 'snatcher',
      targetInstanceId: targetId,
      variantSeed: 7,
    });

    expect(fixture.borrowEventActor).toHaveBeenCalledExactlyOnceWith(targetId);
    expect(fixture.borrowEventActor).not.toHaveBeenCalledWith(nearbyId);
    expect(presentation.targetOutline.targetIdForTest()).toBe(targetId);
    expect(presentation.targetOutline.visibleForTest()).toBe(true);
  });

  it('fits the warning cage to the exact threatened actor', () => {
    const targetId = 'map-1' as ItemInstanceId;
    const fixture = setup([targetId]);
    const target = fixture.actors.get(targetId)!.root;
    const targetMesh = new Mesh(
      new BoxGeometry(0.28, 0.18, 0.08),
      new MeshStandardMaterial(),
    );
    targetMesh.position.set(0.14, 0.09, 0.04);
    target.add(targetMesh);
    const hiddenSibling = new Mesh(
      new BoxGeometry(4, 4, 4),
      new MeshStandardMaterial(),
    );
    hiddenSibling.position.set(8, 8, 8);
    hiddenSibling.visible = false;
    target.add(hiddenSibling);
    target.updateMatrixWorld(true);
    const presentation = new SnatcherPresentation(fixture.environment);

    presentation.stage({
      eventId: 'snatcher',
      targetInstanceId: targetId,
      variantSeed: 7,
    });

    const warning = presentation.targetOutline.objectForTest();
    expect(warning.position.x).toBeCloseTo(0.14);
    expect(warning.position.y).toBeCloseTo(0.09);
    expect(warning.position.z).toBeCloseTo(0.04);
    expect(warning.scale.x).toBeLessThan(0.4);
    expect(warning.scale.y).toBeLessThan(0.3);
    expect(warning.scale.z).toBeLessThan(0.2);

    presentation.dispose();
    targetMesh.geometry.dispose();
    targetMesh.material.dispose();
    hiddenSibling.geometry.dispose();
    hiddenSibling.material.dispose();
  });

  it('keeps the raised tentacle and target warning visible after reveal', async () => {
    const targetId = 'map-1' as ItemInstanceId;
    const fixture = setup([targetId]);
    const presentation = new SnatcherPresentation(fixture.environment);
    presentation.stage({
      eventId: 'snatcher',
      targetInstanceId: targetId,
      variantSeed: 7,
    });

    const reveal = presentation.reveal();
    presentation.update(0, 2.5);
    await reveal;

    expect(presentation.boatRoot.visible).toBe(true);
    const tentacle = presentation.boatRoot.getObjectByName('tentacle-attack-tentacle')!;
    expect(tentacle.visible).toBe(true);
    expect(tentacle.position.x).toBeLessThan(1.6);
    expect(tentacle.position.y).toBeLessThan(0);
    expect(tentacle.scale.y).toBeGreaterThan(0.9);
    expect(tentacle.rotation.y).toBeLessThan(0);
    expect(presentation.targetOutline.visibleForTest()).toBe(true);
    expect(fixture.environment.vortexWave).toEqual(fixture.vortexBefore);
  });

  it('raises the tentacle from below the rail during reveal', async () => {
    const targetId = 'map-1' as ItemInstanceId;
    const fixture = setup([targetId]);
    const presentation = new SnatcherPresentation(fixture.environment);
    presentation.stage({
      eventId: 'snatcher',
      targetInstanceId: targetId,
      variantSeed: 7,
    });
    const model = presentation.boatRoot.getObjectByName('tentacle-attack-model')!;
    const tentacle = presentation.boatRoot.getObjectByName('tentacle-attack-tentacle')!;

    const reveal = presentation.reveal();
    presentation.update(0, 0.5);

    expect(tentacle.visible).toBe(true);
    expect(model.visible).toBe(true);
    expect(tentacle.scale.y).toBeLessThan(0.9);

    presentation.update(0, 0.95);
    expect(tentacle.scale.y).toBeGreaterThan(0.8);
    presentation.update(0, 1.05);
    await reveal;
  });

  it('transfers the exact stolen target to next-sync release ownership', async () => {
    const targetId = 'map-1' as ItemInstanceId;
    const nearbyId = 'map-2' as ItemInstanceId;
    const fixture = setup([targetId, nearbyId]);
    const presentation = new SnatcherPresentation(fixture.environment);
    presentation.stage({
      eventId: 'snatcher',
      targetInstanceId: targetId,
      variantSeed: 7,
    });

    const reaction = presentation.react(outcome(targetId, [targetId]));
    presentation.update(0, 1.2);
    await reaction;

    expect(fixture.actors.get(targetId)!.releaseOnNextSync).toHaveBeenCalledOnce();
    expect(fixture.actors.get(nearbyId)!.releaseOnNextSync).not.toHaveBeenCalled();

    presentation.clear();
    expect(fixture.actors.get(targetId)!.release).not.toHaveBeenCalled();
  });

  it('does not steal a nearby item when the exact target remains', async () => {
    const targetId = 'map-1' as ItemInstanceId;
    const nearbyId = 'map-2' as ItemInstanceId;
    const fixture = setup([targetId, nearbyId]);
    const presentation = new SnatcherPresentation(fixture.environment);
    presentation.stage({
      eventId: 'snatcher',
      targetInstanceId: targetId,
      variantSeed: 7,
    });

    const reaction = presentation.react(outcome(targetId, [nearbyId]));
    presentation.update(0, 1.2);
    await reaction;

    expect(fixture.actors.get(targetId)!.releaseOnNextSync).not.toHaveBeenCalled();
    expect(fixture.borrowEventActor).not.toHaveBeenCalledWith(nearbyId);
  });

  it('disposes each model and owned warning resource once', () => {
    const targetId = 'map-1' as ItemInstanceId;
    const fixture = setup([targetId]);
    const presentation = new SnatcherPresentation(fixture.environment);
    const warning = presentation.targetOutline.objectForTest().getObjectByName(
      'snatcher-warning-cage',
    ) as Mesh;
    const geometryDispose = vi.spyOn(warning.geometry, 'dispose');
    const materialDispose = vi.spyOn(warning.material as MeshStandardMaterial, 'dispose');

    presentation.dispose();
    presentation.dispose();

    expect(fixture.modelDispose).toHaveBeenCalledOnce();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(presentation.boatRoot.children).toHaveLength(0);
  });
});

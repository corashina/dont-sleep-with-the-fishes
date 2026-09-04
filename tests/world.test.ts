// Importance: 10/10 (scaled from 5/5). Protects world integration and resource ownership.
import { describe, expect, it, vi } from 'vitest';
import {
  BufferGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Points,
  PointsMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  ShaderMaterial,
  Texture,
  Vector3,
  Vector4,
} from 'three';
import { createItemInstances, ITEM_IDS, type ItemInstance } from '../src/game/ItemState';
import { getSinkingState } from '../src/game/sinking';
import { BoatBuoyancy, smoothBoatPose } from '../src/ocean/BoatBuoyancy';
import { OceanRenderer } from '../src/ocean/OceanRenderer';
import { resolveLocalMovement } from '../src/player/collisions';
import {
  ScavengePhysics,
} from '../src/physics/ScavengePhysics';
import { pointInWaterExclusion } from './helpers/waterExclusion';
import { DEFAULT_WAVES, sampleWaveField } from '../src/ocean/WaveField';
import { presentationWeatherProfile } from '../src/weather/presentationWeather';
import { boatStorageTransform } from '../src/world/BoatStorage';
import { SUN_DIRECTION } from '../src/world/celestialLight';
import { Environment } from '../src/world/Environment';
import { createLifeboat } from '../src/world/Lifeboat';
import { createTestLifeboatAssets } from './helpers/lifeboatAssets';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import { createProp } from '../src/world/PropFactory';
import { SCAVENGE_PICKUP_TARGET_NAME } from '../src/world/ScavengePickupTarget';
import { SCAVENGE_PHYSICS_OBJECT_SPECS } from '../src/world/ScavengePhysicsObjectCatalog';
import { createShipFurniture } from '../src/world/ShipFurniture';
import { createShipGeometry } from '../src/world/ShipGeometry';
import { assignShipItems, shipItemTransformBounds } from '../src/world/ShipItemPlacement';
import {
  SHIP_LAYOUT,
} from '../src/world/shipLayoutData';
import {
  FREIGHTER_DIMENSIONS,
} from '../src/world/ShipLayoutTypes';
import { createShipMaterials } from '../src/world/ShipMaterials';
import { createShipRigging } from '../src/world/ShipRigging';
import {
  World,
  type WorldConstructionDependencies,
} from '../src/world/World';
import {
  createTestPropModels,
  TEST_PROP_MODEL_TRANSFORM,
  testPropModel,
} from './helpers/propModels';
import { createTestMoonTexture } from './helpers/skyAssets';
import { createTestShip, createTestShipFurniture } from './helpers/shipFurniture';
import { testPhysicsRuntime } from './helpers/physics';
import { SHIP_SHELL_COLLIDERS_BASE } from './fixtures/shipGeometryBase';

const physicsRuntime = await testPhysicsRuntime();

const meshCount = (root: Object3D): number => {
  let count = 0;
  root.traverse((object) => {
    if (object instanceof Mesh) count += 1;
  });
  return count;
};

const expectTestModelTransform = (root: Object3D): void => {
  const model = testPropModel(root);
  expect(model.position.toArray()).toEqual(TEST_PROP_MODEL_TRANSFORM.position);
  model.rotation.toArray().slice(0, 3).forEach((value, index) => {
    expect(value).toBeCloseTo(TEST_PROP_MODEL_TRANSFORM.rotation[index]!);
  });
  expect(model.scale.toArray()).toEqual(TEST_PROP_MODEL_TRANSFORM.scale);
};

const expectNumericRowsCloseTo = (
  actual: readonly (readonly number[])[],
  expected: readonly (readonly number[])[],
): void => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((row, rowIndex) => {
    const expectedRow = expected[rowIndex]!;
    expect(row).toHaveLength(expectedRow.length);
    row.forEach((value, columnIndex) => {
      expect(value, `row ${rowIndex}, column ${columnIndex}`)
        .toBeCloseTo(expectedRow[columnIndex]!, 12);
    });
  });
};

describe('volumetric scavenging clouds', () => {

  it('keeps flat clouds when cloud creation fails', () => {
    const scene = new Scene();
    const environment = new Environment(
      scene,
      createTestMoonTexture(),
      'low',
      () => null,
    );

    try {
      environment.setVolumetricCloudsEnabled(true);
      environment.setVisualQuality('high');
      expect(environment.volumetricCloudsAvailable()).toBe(false);
      environment.update(1, 1, new Vector3());
      const sky = environment as unknown as { sky: { material: ShaderMaterial } };
      expect(sky.sky.material.uniforms.uCloudLayerStrength!.value).toBe(1);
    } finally {
      environment.dispose();
    }
  });

  it('continues environment cleanup and restores scene state after failures', () => {
    const scene = new Scene();
    const originalBackground = new Color(0x112233);
    const originalFog = new FogExp2(0x112233, 0.004);
    scene.background = originalBackground;
    scene.fog = originalFog;
    const environment = new Environment(scene, createTestMoonTexture());
    const internals = environment as unknown as {
      weatherEffects: { dispose(): void };
      volumetricClouds: { dispose(): void };
      sky: { dispose(): void };
    };
    const firstError = new Error('weather cleanup failed');
    const calls: string[] = [];
    const originalWeatherDispose = internals.weatherEffects.dispose.bind(
      internals.weatherEffects,
    );
    vi.spyOn(internals.weatherEffects, 'dispose').mockImplementation(() => {
      calls.push('weather');
      originalWeatherDispose();
      throw firstError;
    });
    const originalCloudDispose = internals.volumetricClouds.dispose.bind(
      internals.volumetricClouds,
    );
    vi.spyOn(internals.volumetricClouds, 'dispose').mockImplementation(() => {
      calls.push('clouds');
      originalCloudDispose();
      throw new Error('cloud cleanup failed');
    });
    const originalSkyDispose = internals.sky.dispose.bind(internals.sky);
    vi.spyOn(internals.sky, 'dispose').mockImplementation(() => {
      calls.push('sky');
      originalSkyDispose();
      throw new Error('sky cleanup failed');
    });

    expect(() => environment.dispose()).toThrow(firstError);
    expect(calls).toEqual(['weather', 'clouds', 'sky']);
    expect(scene.children.some((object) =>
      object instanceof DirectionalLight || object instanceof HemisphereLight)).toBe(false);
    expect(scene.background).toBe(originalBackground);
    expect(scene.fog).toBe(originalFog);
    expect(() => environment.dispose()).not.toThrow();
  });
});

interface RenderResources {
  geometries: Set<BufferGeometry>;
  materials: Set<Material>;
}

const collectRenderResources = (root: Object3D): RenderResources => {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  root.traverse((object) => {
    if (!(object instanceof Mesh || object instanceof Points)) return;
    geometries.add(object.geometry);
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    meshMaterials.forEach((meshMaterial) => materials.add(meshMaterial));
  });
  return { geometries, materials };
};

const observeDisposals = <T extends BufferGeometry | Material>(resources: Iterable<T>): Map<T, number> => {
  const counts = new Map<T, number>();
  for (const resource of resources) {
    counts.set(resource, 0);
    resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource)! + 1));
  }
  return counts;
};

const createTestWorld = (
  scene: Scene,
  propModels: ReturnType<typeof createTestPropModels>,
  moonTexture = createTestMoonTexture(),
  instances: readonly ItemInstance[] = createItemInstances(),
  random: () => number = Math.random,
  runtime: typeof physicsRuntime | null = physicsRuntime,
  construction: WorldConstructionDependencies = {},
): World => {
  const furniture = createTestShipFurniture();
  try {
    const world = new World(
      scene,
      propModels,
      furniture,
      1,
      moonTexture,
      runtime,
      instances,
      random,
      construction,
    );
    const disposeWorld = world.dispose.bind(world);
    world.dispose = () => {
      disposeWorld();
      furniture.dispose();
    };
    return world;
  } catch (error) {
    furniture.dispose();
    throw error;
  }
};

describe('world builders', () => {
  it('adds invisible pickup targets only to the four open scavenging items', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const world = createTestWorld(scene, propModels);
    const expandedItemIds = new Set(['fishingNet', 'swimRing', 'anchor', 'ductTape']);

    try {
      world.itemObjects.forEach((itemObject, instanceId) => {
        const target = itemObject.getObjectByName(SCAVENGE_PICKUP_TARGET_NAME);
        expect(target !== undefined).toBe(expandedItemIds.has(instanceId.split('-')[0]!));
        if (target) expect(target.visible).toBe(false);
      });
    } finally {
      world.dispose();
      propModels.dispose();
    }
  });

  it('preserves ship composition and idempotent geometry ownership', () => {
    const updateMatrixWorld = vi.spyOn(Group.prototype, 'updateMatrixWorld');
    const materials = createShipMaterials();
    const ship = createShipGeometry(materials);
    const resources = collectRenderResources(ship.root);
    const geometryDisposals = observeDisposals(resources.geometries);
    const materialDisposals = observeDisposals(materials.ownedMaterialsForTest());
    const childCount = ship.root.children.length;

    try {
      expect(ship.root.name).toBe('coastal-freighter');
      expect(ship.root.children).toHaveLength(143);
      expect(meshCount(ship.root)).toBe(392);
      expect(resources.geometries).toHaveLength(85);
      expect(ship.shellColliders).toHaveLength(37);
      expectNumericRowsCloseTo(ship.shellColliders.map((collider) => [
        collider.minX,
        collider.maxX,
        collider.minY,
        collider.maxY,
        collider.minZ,
        collider.maxZ,
        ...(collider.orientedFootprint ? [
          collider.orientedFootprint.centerX,
          collider.orientedFootprint.centerZ,
          collider.orientedFootprint.halfWidth,
          collider.orientedFootprint.halfDepth,
          collider.orientedFootprint.rotationY,
        ] : []),
      ]), SHIP_SHELL_COLLIDERS_BASE);
      expect(ship.arcColliders).toHaveLength(0);
      expect(updateMatrixWorld.mock.contexts.some((context, index) =>
        context === ship.root
        && updateMatrixWorld.mock.calls[index]?.[0] === true)).toBe(true);
      expect(ship.root.children.slice(0, 11).map(({ name }) => name)).toEqual([
        'main-hull-body',
        'upper-hull',
        'waterline-band',
        'timber-deck',
        'floor-crewCabin',
        'floor-wheelhouse',
        'floor-cargoDeck',
        'floor-storageWorkroom',
        'floor-lifeboatStation',
        'lifeboat-station-footprint-left',
        'lifeboat-station-footprint-right',
      ]);
      expect(ship.root.children.slice(11, 58)).toHaveLength(47);
      expect(ship.root.children[11]!.name).toBe('crew-cabin-wall-port-0');
      expect(ship.root.children[57]!.name)
        .toBe('balcony:crew-balcony:coaming:aft:1');
      expect(ship.root.children[58]!.name).toBe('ladder:crew-ladder');
      expect(ship.root.children.slice(59, 76).map(({ name }) => name)).toEqual([
        'bow-stem',
        'stern-transom',
        'stern-transom-waterline',
        'deck-hatch',
        'deck-hatch-timber-panel',
        'anchor-hawse-port',
        'anchor-hawse-starboard',
        'roof-engine-body',
        'roof-engine-service-panel',
        'roof-engine-vent-1',
        'roof-engine-vent-2',
        'roof-engine-vent-3',
        'roof-engine-crank',
        'smokestack-port',
        'smokestack-port-collar',
        'smokestack-starboard',
        'smokestack-starboard-collar',
      ]);
      expect(ship.root.children.slice(76)).toHaveLength(67);
      expect(ship.root.children.slice(76).every(({ name }) => name.startsWith('rail-')))
        .toBe(true);

      ship.disposeGeometry();
      ship.disposeGeometry();
      expect(ship.root.children).toHaveLength(childCount);
      geometryDisposals.forEach((count) => expect(count).toBe(1));
      materialDisposals.forEach((count) => expect(count).toBe(0));
    } finally {
      ship.disposeGeometry();
      materials.dispose();
      updateMatrixWorld.mockRestore();
    }
  });

  it('composes the scavenging intro impact with shared-wave vessel motion', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const world = createTestWorld(scene, propModels);
    const sinking = getSinkingState(0, 120);
    try {
      world.setScavengeIntroImpact(0, 0, 0);
      world.update(2, 1 / 60, sinking, new Vector3(), false);
      const baseY = world.ship.position.y;
      const baseX = world.ship.rotation.x;
      const baseZ = world.ship.rotation.z;

      world.setScavengeIntroImpact(-0.08, 0.045, -0.07);
      world.update(2, 0, sinking, new Vector3(), false);
      expect(world.ship.position.y).toBeCloseTo(baseY - 0.08);
      expect(world.ship.rotation.x).toBeCloseTo(baseX + 0.045);
      expect(world.ship.rotation.z).toBeCloseTo(baseZ - 0.07);
    } finally {
      world.dispose();
      propModels.dispose();
    }
  });

  it('synchronizes paused intro transforms without aging crash effects or ship smoothing', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const world = createTestWorld(scene, propModels);
    const sinking = getSinkingState(0, 120);
    const introEffect = (world as unknown as {
      scavengeIntroPresentation: {
        snapshotForTest(): { active: boolean; age: number; debrisCount: number };
      };
    }).scavengeIntroPresentation;
    try {
      world.triggerScavengeIntroCrash();
      world.update(2, 0.25, sinking, new Vector3(), false);
      const effectBeforePause = introEffect.snapshotForTest();
      const positionBeforePause = world.ship.position.clone();
      const rotationBeforePause = world.ship.rotation.clone();

      world.update(20, 0, sinking, new Vector3(), false);

      expect(introEffect.snapshotForTest()).toEqual(effectBeforePause);
      expect(world.ship.position).toEqual(positionBeforePause);
      expect(world.ship.rotation.toArray()).toEqual(rotationBeforePause.toArray());
    } finally {
      world.dispose();
      propModels.dispose();
    }
  });

  it('keeps revealed physics visuals aligned through inactive intro motion', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const world = createTestWorld(scene, propModels);
    const sinking = getSinkingState(0, 120);
    const localPositions = world.physicsObjects.map(
      (object) => world.ship.worldToLocal(object.getWorldPosition(new Vector3())),
    );
    try {
      world.revealPhysicsObjects();
      world.setScavengeIntroImpact(-0.12, 0.08, -0.1);
      world.update(4, 1 / 60, sinking, new Vector3(), false);
      world.physicsObjects.forEach((object, index) => {
        const expected = localPositions[index]!.clone().applyMatrix4(world.ship.matrixWorld);
        expect(object.getWorldPosition(new Vector3()).distanceTo(expected)).toBeLessThan(1e-5);
      });

    } finally {
      world.dispose();
      propModels.dispose();
    }
  });

  it('clones the lifeboat station bounds for deadline evacuation', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const world = createTestWorld(scene, propModels);
    const lifeboatStation = SHIP_LAYOUT.zones.find(({ id }) => id === 'lifeboatStation')!;

    try {
      expect(world.evacuationBounds).toEqual(lifeboatStation.bounds);
      expect(world.evacuationBounds).not.toBe(lifeboatStation.bounds);
    } finally {
      world.dispose();
      propModels.dispose();
    }
  });

  it('uses one resolved weather amplitude for both vessels and the ocean', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const world = createTestWorld(scene, propModels);
    const buoyancySample = vi.spyOn(BoatBuoyancy.prototype, 'sampleTargetInto');
    const oceanUpdate = vi.spyOn(OceanRenderer.prototype, 'update');
    const sinking = {
      ...getSinkingState(30, 120),
      waveAmplitudeScale: 1.2,
    };
    const expectedAmplitude = sinking.waveAmplitudeScale
      * presentationWeatherProfile('waves').waveScale;

    try {
      world.setPresentationWeather('waves');
      world.update(4, 1 / 60, sinking, new Vector3(), false);

      expect(buoyancySample.mock.calls.slice(-2).map((call) => call[4]))
        .toEqual([expectedAmplitude, expectedAmplitude]);
      expect(oceanUpdate.mock.calls.at(-1)?.[1]).toBe(expectedAmplitude);
      expect(world.sampleFlightWaterHeight(4, 2, -3, sinking.waveAmplitudeScale))
        .toBeCloseTo(sampleWaveField(DEFAULT_WAVES, 4, 2, -3, expectedAmplitude).height);
    } finally {
      buoyancySample.mockRestore();
      oceanUpdate.mockRestore();
      world.dispose();
      propModels.dispose();
    }
  });

  it('reuses two water exclusion regions and updates their transforms across frames', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const world = createTestWorld(scene, propModels);
    const internals = world as unknown as {
      boatAnchor: Vector3;
      ocean: OceanRenderer;
    };
    const exclusions: Parameters<OceanRenderer['setExclusions']>[0][] = [];
    const setExclusions = internals.ocean.setExclusions.bind(internals.ocean);
    const exclusionSpy = vi.spyOn(internals.ocean, 'setExclusions')
      .mockImplementation((regions) => {
        exclusions.push(regions);
        setExclusions(regions);
      });

    try {
      world.update(1, 1 / 60, getSinkingState(30, 120), new Vector3(), false);
      const firstList = exclusions[0]!;
      const firstShipMatrix = firstList[0]!.worldToLocal.clone();
      const firstLifeboatMatrix = firstList[1]!.worldToLocal.clone();

      internals.boatAnchor.x += 3;
      internals.boatAnchor.z -= 2;
      world.update(2, 1 / 60, {
        ...getSinkingState(30, 120),
        pitchRadians: 0.15,
        rollRadians: -0.12,
        sinkOffset: -4,
      }, new Vector3(), false);

      expect(exclusions).toHaveLength(2);
      expect(exclusions[1]).toBe(firstList);
      expect(exclusions[1]![0]).toBe(firstList[0]);
      expect(exclusions[1]![1]).toBe(firstList[1]);
      expect(firstList[0]!.worldToLocal).not.toEqual(firstShipMatrix);
      expect(firstList[1]!.worldToLocal).not.toEqual(firstLifeboatMatrix);
      expect(firstList[0]!.worldToLocal).toEqual(world.ship.matrixWorld.clone().invert());
      expect(firstList[1]!.worldToLocal).toEqual(world.lifeboat.matrixWorld.clone().invert());
    } finally {
      exclusionSpy.mockRestore();
      world.dispose();
      propModels.dispose();
    }
  });

  it('keeps physics objects local to the ship when physics is disabled', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const world = createTestWorld(
      scene,
      propModels,
      createTestMoonTexture(),
      createItemInstances(),
      Math.random,
      null,
      { physicsMode: 'off' },
    );
    const internals = world as unknown as {
      scavengePhysics: ScavengePhysics | null;
      physicsDebugView: unknown;
    };

    expect(world.physicsMode).toBe('off');
    expect(internals.scavengePhysics).toBeNull();
    expect(internals.physicsDebugView).toBeNull();
    expect(world.physicsObjects.every(({ visible }) => !visible)).toBe(true);
    expect(world.ship.getObjectByName('physics-objects')?.visible).toBe(false);
    world.physicsObjects.forEach((object) => {
      expect(object.parent?.name).toBe('physics-objects');
      expect(world.ship.getObjectByName(object.name)).toBe(object);
    });
    world.revealPhysicsObjects();
    const before = world.physicsObjects.map((object) => object.position.clone());
    expect(scene.getObjectByName('physics-debug-dynamic')).toBeUndefined();
    expect(world.ship.getObjectByName('physics-debug-static')).toBeUndefined();
    expect(() => world.update(
      1,
      1 / 60,
      getSinkingState(30, 120),
      new Vector3(),
      true,
    )).not.toThrow();
    expect(world.physicsObjects.every(({ visible }) => visible)).toBe(true);
    expect(world.ship.getObjectByName('physics-objects')?.visible).toBe(true);
    world.physicsObjects.forEach((object, index) => expect(object.position).toEqual(before[index]));

    world.dispose();
    propModels.dispose();
  });

  it('owns and disposes a collider overlay only in debug mode', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const world = createTestWorld(
      scene,
      propModels,
      createTestMoonTexture(),
      createItemInstances(),
      Math.random,
      physicsRuntime,
      { physicsMode: 'debug' },
    );

    expect(world.physicsMode).toBe('debug');
    expect(scene.getObjectByName('physics-debug-dynamic')?.visible).toBe(false);
    expect(world.ship.getObjectByName('physics-debug-static')?.visible).toBe(false);
    const floor = world.ship.getObjectByName('physics-debug-cuboid:0') as Mesh;
    expect(floor.position.x - floor.scale.x / 2)
      .toBeCloseTo(-FREIGHTER_DIMENSIONS.width / 2);
    expect(floor.position.x + floor.scale.x / 2)
      .toBeCloseTo(FREIGHTER_DIMENSIONS.width / 2);
    expect(floor.position.z - floor.scale.z / 2)
      .toBeCloseTo(-FREIGHTER_DIMENSIONS.length / 2);
    expect(floor.position.z + floor.scale.z / 2)
      .toBeCloseTo(FREIGHTER_DIMENSIONS.length / 2);
    SCAVENGE_PHYSICS_OBJECT_SPECS.forEach(({ id }) => {
      expect(scene.getObjectByName(`physics-debug-object:${id}`)).toBeDefined();
    });

    world.revealPhysicsObjects();

    expect(scene.getObjectByName('physics-debug-dynamic')?.visible).toBe(true);
    expect(world.ship.getObjectByName('physics-debug-static')?.visible).toBe(true);

    world.dispose();
    expect(scene.getObjectByName('physics-debug-dynamic')).toBeUndefined();
    expect(scene.getObjectByName('physics-debug-static')).toBeUndefined();
    propModels.dispose();
  });

  it('tracks inactive ship motion and advances every physics object when enabled', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const world = createTestWorld(scene, propModels);
    const camera = new PerspectiveCamera();
    const physics = (world as unknown as {
      scavengePhysics: ScavengePhysics;
    }).scavengePhysics;
    const beforeLocal = world.physicsObjects.map(
      (object) => world.ship.worldToLocal(object.getWorldPosition(new Vector3())),
    );
    const beforePhysics = structuredClone(physics.objectPoses);

    world.update(1, 1 / 60, getSinkingState(30, 120), camera.position, false);
    world.physicsObjects.forEach((object, index) => {
      const local = world.ship.worldToLocal(object.getWorldPosition(new Vector3()));
      expect(local.distanceTo(beforeLocal[index]!)).toBeLessThan(1e-5);
    });
    expect(physics.objectPoses).not.toEqual(beforePhysics);
    const beforeActive = world.physicsObjects.map((object) => object.position.clone());

    for (let step = 1; step <= 30; step += 1) {
      world.update(
        1 + step / 60,
        1 / 60,
        getSinkingState(30, 120),
        camera.position,
        true,
      );
    }

    world.physicsObjects.forEach((object, index) => {
      const pose = physics.objectPoses[index]!;
      expect(object.quaternion.toArray()).toEqual([
        pose.rotation.x,
        pose.rotation.y,
        pose.rotation.z,
        pose.rotation.w,
      ]);
      const colliderCenter = new Vector3(
        pose.translation.x,
        pose.translation.y,
        pose.translation.z,
      );
      expect(object.position.distanceTo(colliderCenter))
        .toBeCloseTo(SCAVENGE_PHYSICS_OBJECT_SPECS[index]!.visualHalfHeight);
    });
    expect(world.physicsObjects.some((object, index) => (
      object.position.distanceTo(beforeActive[index]!) > 1e-3
    ))).toBe(true);

    world.dispose();
    propModels.dispose();
  });

  it('attaches paused physics objects to Dorothy without changing their deck poses', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const world = createTestWorld(scene, propModels);
    const camera = new PerspectiveCamera();
    const savedPoses = world.physicsObjects.map((object) => ({
      position: object.getWorldPosition(new Vector3()),
      quaternion: object.getWorldQuaternion(new Quaternion()),
    }));

    world.attachPhysicsObjectsToShip();

    world.physicsObjects.forEach((object, index) => {
      const savedPose = savedPoses[index]!;
      expect(object.parent?.parent).toBe(world.ship);
      expect(object.getWorldPosition(new Vector3())).toEqual(savedPose.position);
      expect(object.getWorldQuaternion(new Quaternion())).toEqual(savedPose.quaternion);
    });

    world.update(1, 1 / 60, {
      ...getSinkingState(30, 120),
      sinkOffset: -4,
      pitchRadians: 0.1,
      rollRadians: -0.2,
    }, camera.position, false);
    world.physicsObjects.forEach((object, index) => {
      expect(object.getWorldPosition(new Vector3()))
        .not.toEqual(savedPoses[index]!.position);
      expect(object.getWorldQuaternion(new Quaternion()))
        .not.toEqual(savedPoses[index]!.quaternion);
    });

    const attachedLocalPoses = world.physicsObjects.map((object) => ({
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
    }));
    world.attachPhysicsObjectsToShip();
    world.physicsObjects.forEach((object, index) => {
      expect(object.parent?.parent).toBe(world.ship);
      expect(object.position).toEqual(attachedLocalPoses[index]!.position);
      expect(object.quaternion.toArray()).toEqual(attachedLocalPoses[index]!.quaternion.toArray());
    });

    world.dispose();
    propModels.dispose();
  });

  it('keeps ship material textures deterministic and disposes owned resources once', () => {
    const materials = createShipMaterials(0x1a2b3c);
    const duplicate = createShipMaterials(0x1a2b3c);
    const ownedMaterials = materials.ownedMaterialsForTest();
    const ownedTextures = materials.ownedTexturesForTest();
    const materialDisposals = ownedMaterials.map((material) => vi.spyOn(material, 'dispose'));
    const textureDisposals = ownedTextures.map((texture) => vi.spyOn(texture, 'dispose'));

    try {
      expect(materials.textureBytesForTest()).toEqual(duplicate.textureBytesForTest());
      expect(new Set(ownedMaterials).size).toBe(ownedMaterials.length);
      expect(new Set(ownedTextures).size).toBe(ownedTextures.length);

      materials.dispose();
      materials.dispose();

      materialDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
      textureDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    } finally {
      duplicate.dispose();
    }
  });

  it('places a dropped carried item on the deck and triggers local smoke immediately', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const world = createTestWorld(scene, propModels);
    const item = world.itemObjects.get('flashlight-1')!;
    const expectedScale = item.scale.x;
    const expectedLocal = new Vector3(2.4, world.deckY, -4.6);
    const worldPoint = world.ship.localToWorld(expectedLocal.clone());
    scene.attach(item);
    item.position.set(0.4, 3.5, -1.1);
    item.rotation.set(-0.15, 0.45, 0.08);
    item.scale.setScalar(0.72);

    world.dropItem('flashlight-1', worldPoint);

    const smoke = world.ship.getObjectByName('ground-drop-smoke') as Points;
    const restingBounds = shipItemTransformBounds('flashlight', {
      position: item.position,
      rotation: item.rotation,
      scale: item.scale.x,
    });
    const restingSize = restingBounds.getSize(new Vector3());
    expect(item.parent).toBe(world.ship);
    expect(item.position.x).toBeCloseTo(expectedLocal.x);
    expect(item.position.z).toBeCloseTo(expectedLocal.z);
    expect(item.scale.x).toBe(expectedScale);
    expect(restingBounds.min.y).toBeCloseTo(world.deckY);
    expect(restingSize.y).toBeCloseTo(
      Math.min(...ITEM_MODEL_SPECS.flashlight.normalizedSize) * expectedScale,
    );
    expect(item.rotation.x).not.toBeCloseTo(-0.15);
    expect(item.rotation.y).not.toBeCloseTo(0.45);
    expect(smoke.visible).toBe(true);
    expect(smoke.position).toEqual(new Vector3(expectedLocal.x, world.deckY + 0.02, expectedLocal.z));

    world.dispose();
    propModels.dispose();
  });

  it('removes and disposes the ship when construction fails during item assignment', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    let observed: Map<BufferGeometry | Material, number> | undefined;
    const oversizedInventory = Array.from({ length: 80 }, (_, index): ItemInstance => ({
      instanceId: `cannedFood-${index + 1}` as ItemInstance['instanceId'],
      type: 'cannedFood',
    }));
    const observeShipResources = (): number => {
      if (!observed) {
        const ship = scene.getObjectByName('sinking-ship')!;
        expect(ship.getObjectByName('ship-deck-details')).toBeUndefined();
        expect(ship.getObjectByName('ship-rigging')).toBeDefined();
        expect(ship.getObjectByName('freighter-smoke')).toBeDefined();
        expect(ship.getObjectByName('ship-danger-effects')).toBeDefined();
        expect(ship.getObjectByName('ship-danger-alarm:crew-cabin')).toBeDefined();
        expect(ship.getObjectByName('ship-danger-puddle:crew-aft')).toBeDefined();
        const resources = collectRenderResources(ship);
        observed = observeDisposals([...resources.geometries, ...resources.materials]);
      }
      return 0.4;
    };

    expect(() => createTestWorld(
      scene,
      propModels,
      createTestMoonTexture(),
      oversizedInventory,
      observeShipResources,
    ))
      .toThrow('Unable to place ship item');
    expect(scene.getObjectByName('sinking-ship')).toBeUndefined();
    expect(observed?.size).toBeGreaterThan(0);
    observed?.forEach((count) => expect(count).toBe(1));
    propModels.dispose();
  });

  it.each(['physics', 'lifeboat', 'ocean', 'environment', 'buoyancy'] as const)(
    'rolls back every owned resource when construction fails after %s creation',
    (failureStage) => {
      const scene = new Scene();
      const sentinel = new Object3D();
      scene.add(sentinel);
      const originalBackground = new Color(0x123456);
      const originalFog = new FogExp2(0x123456, 0.004);
      scene.background = originalBackground;
      scene.fog = originalFog;
      const propModels = createTestPropModels();
      const furniture = createTestShipFurniture();
      const moonTexture = createTestMoonTexture();
      const propDispose = vi.spyOn(propModels, 'dispose');
      const furnitureDispose = vi.spyOn(furniture, 'dispose');
      const moonDispose = vi.spyOn(moonTexture, 'dispose');
      const failure = new Error(`fail after ${failureStage}`);
      let observed: Map<BufferGeometry | Material, number> | undefined;
      let constructed: World | undefined;
      let caught: unknown;
      const originalPhysicsDispose = ScavengePhysics.prototype.dispose;
      const physicsDispose = vi.spyOn(ScavengePhysics.prototype, 'dispose')
        .mockImplementation(function trackedDispose(this: ScavengePhysics) {
          originalPhysicsDispose.call(this);
        });

      try {
        constructed = Reflect.construct(World, [
          scene, propModels, furniture, 1, moonTexture, physicsRuntime, [], () => 0.4,
          {
            checkpoint: (stage: typeof failureStage) => {
              if (stage !== failureStage) return;
              const resources = new Set<BufferGeometry | Material>();
              if (failureStage === 'physics') {
                resources.add((scene.getObjectByName('sail:mainsail') as Mesh).geometry);
              }
              ['lifeboat', 'procedural-ocean', 'procedural-skybox']
                .forEach((name) => {
                  const object = scene.getObjectByName(name);
                  if (!object) return;
                  const found = collectRenderResources(object);
                  found.geometries.forEach((resource) => resources.add(resource));
                  found.materials.forEach((resource) => resources.add(resource));
                });
              observed = observeDisposals(resources);
              throw failure;
            },
          },
        ]);
      } catch (error) {
        caught = error;
      }

      try {
        constructed?.dispose();
        expect(caught).toBe(failure);
        expect(scene.children).toEqual([sentinel]);
        expect(scene.background).toBe(originalBackground);
        expect(scene.fog).toBe(originalFog);
        expect(observed?.size).toBeGreaterThan(0);
        observed?.forEach((count) => expect(count).toBe(1));
        expect(propDispose).not.toHaveBeenCalled();
        expect(furnitureDispose).not.toHaveBeenCalled();
        expect(moonDispose).not.toHaveBeenCalled();
        expect(physicsDispose).toHaveBeenCalledOnce();
      } finally {
        physicsDispose.mockRestore();
        furniture.dispose();
        propModels.dispose();
        moonTexture.dispose();
      }
    },
  );

  it('continues rollback after disposer failures and preserves the construction error', () => {
    const scene = new Scene();
    const sentinel = new Object3D();
    scene.add(sentinel);
    const originalBackground = new Color(0x112233);
    const originalFog = new FogExp2(0x112233, 0.004);
    scene.background = originalBackground;
    scene.fog = originalFog;
    const propModels = createTestPropModels();
    const furniture = createTestShipFurniture();
    const moonTexture = createTestMoonTexture();
    const failure = new Error('environment checkpoint failure');
    const originalEnvironmentDispose = Environment.prototype.dispose;
    const originalOceanDispose = OceanRenderer.prototype.dispose;
    const environmentDispose = vi.spyOn(Environment.prototype, 'dispose')
      .mockImplementation(function disposeThenThrow(this: Environment) {
        originalEnvironmentDispose.call(this);
        throw new Error('environment cleanup failure');
      });
    const oceanDispose = vi.spyOn(OceanRenderer.prototype, 'dispose')
      .mockImplementation(function disposeThenThrow(this: OceanRenderer) {
        originalOceanDispose.call(this);
        throw new Error('ocean cleanup failure');
      });
    let constructed: World | undefined;
    let caught: unknown;

    try {
      try {
        constructed = Reflect.construct(World, [
          scene, propModels, furniture, 1, moonTexture, physicsRuntime, [], () => 0.4,
          { checkpoint: (stage: string) => { if (stage === 'environment') throw failure; } },
        ]);
      } catch (error) {
        caught = error;
      }
      constructed?.dispose();
      expect(caught).toBe(failure);
      expect(environmentDispose).toHaveBeenCalledTimes(1);
      expect(oceanDispose).toHaveBeenCalledTimes(1);
      expect(scene.children).toEqual([sentinel]);
      expect(scene.background).toBe(originalBackground);
      expect(scene.fog).toBe(originalFog);
    } finally {
      environmentDispose.mockRestore();
      oceanDispose.mockRestore();
      furniture.dispose();
      propModels.dispose();
      moonTexture.dispose();
    }
  });

  it('rolls back a buoyancy failure in strict reverse acquisition order', () => {
    const scene = new Scene();
    const sentinel = new Object3D();
    scene.add(sentinel);
    const originalBackground = new Color(0x223344);
    const originalFog = new FogExp2(0x223344, 0.006);
    scene.background = originalBackground;
    scene.fog = originalFog;
    const propModels = createTestPropModels();
    const furniture = createTestShipFurniture();
    const moonTexture = createTestMoonTexture();
    const propLibraryDispose = vi.spyOn(propModels, 'dispose');
    const furnitureLibraryDispose = vi.spyOn(furniture, 'dispose');
    const moonDispose = vi.spyOn(moonTexture, 'dispose');
    const order: string[] = [];
    const counts = new Map<string, number>();
    const mark = (label: string, resource: BufferGeometry | Material): void => {
      counts.set(label, 0);
      resource.addEventListener('dispose', () => {
        counts.set(label, counts.get(label)! + 1);
        order.push(label);
      });
    };
    const originalEnvironmentDispose = Environment.prototype.dispose;
    const originalOceanDispose = OceanRenderer.prototype.dispose;
    const environmentDispose = vi.spyOn(Environment.prototype, 'dispose')
      .mockImplementation(function orderedDispose(this: Environment) {
        order.push('environment');
        originalEnvironmentDispose.call(this);
      });
    const oceanDispose = vi.spyOn(OceanRenderer.prototype, 'dispose')
      .mockImplementation(function orderedDispose(this: OceanRenderer) {
        order.push('ocean');
        originalOceanDispose.call(this);
      });
    const originalPhysicsDispose = ScavengePhysics.prototype.dispose;
    const physicsDispose = vi.spyOn(ScavengePhysics.prototype, 'dispose')
      .mockImplementation(function orderedDispose(this: ScavengePhysics) {
        order.push('physics');
        originalPhysicsDispose.call(this);
      });
    const failure = new Error('buoyancy checkpoint failure');
    const flareGun = createItemInstances().find(({ type }) => type === 'flareGun')!;
    let caught: unknown;

    try {
      try {
        Reflect.construct(World, [
          scene,
          propModels,
          furniture,
          1,
          moonTexture,
          physicsRuntime,
          [flareGun],
          () => 0.4,
          {
            checkpoint: (stage: string) => {
              if (stage !== 'buoyancy') return;
              const shipResources = collectRenderResources(scene.getObjectByName('coastal-freighter')!);
              const propResources = collectRenderResources(scene.getObjectByName('prop:flareGun-1')!);
              const lifeboatResources = collectRenderResources(
                scene.getObjectByName('lifeboat-hull-geometry')!,
              );
              mark('ship', shipResources.geometries.values().next().value!);
              mark('prop', propResources.geometries.values().next().value!);
              mark('lifeboat', lifeboatResources.geometries.values().next().value!);
              scene.getObjectByName('physics-objects')!.addEventListener(
                'removed',
                () => order.push('object'),
              );
              throw failure;
            },
          },
        ]);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBe(failure);
      expect(order).toEqual(expect.arrayContaining([
        'environment', 'ocean', 'lifeboat', 'physics', 'object', 'prop', 'ship',
      ]));
      expect(order.indexOf('environment')).toBeLessThan(order.indexOf('ocean'));
      expect(order.indexOf('ocean')).toBeLessThan(order.indexOf('lifeboat'));
      expect(order.indexOf('lifeboat')).toBeLessThan(order.indexOf('physics'));
      expect(order.indexOf('physics')).toBeLessThan(order.indexOf('object'));
      expect(order.indexOf('object')).toBeLessThan(order.indexOf('prop'));
      expect(order.indexOf('prop')).toBeLessThan(order.indexOf('ship'));
      counts.forEach((count) => expect(count).toBe(1));
      expect(environmentDispose).toHaveBeenCalledTimes(1);
      expect(oceanDispose).toHaveBeenCalledTimes(1);
      expect(physicsDispose).toHaveBeenCalledTimes(1);
      expect(scene.children).toEqual([sentinel]);
      expect(scene.background).toBe(originalBackground);
      expect(scene.fog).toBe(originalFog);
      expect(propLibraryDispose).not.toHaveBeenCalled();
      expect(furnitureLibraryDispose).not.toHaveBeenCalled();
      expect(moonDispose).not.toHaveBeenCalled();
    } finally {
      environmentDispose.mockRestore();
      oceanDispose.mockRestore();
      physicsDispose.mockRestore();
      furniture.dispose();
      propModels.dispose();
      moonTexture.dispose();
    }
  });

  it('continues constructor rollback when physics disposal throws', () => {
    const scene = new Scene();
    const sentinel = new Object3D();
    scene.add(sentinel);
    const propModels = createTestPropModels();
    const furniture = createTestShipFurniture();
    const moonTexture = createTestMoonTexture();
    const constructionFailure = new Error('physics checkpoint failure');
    const disposalFailure = new Error('physics disposal failure');
    const calls: string[] = [];
    const originalPhysicsDispose = ScavengePhysics.prototype.dispose;
    const physicsDispose = vi.spyOn(ScavengePhysics.prototype, 'dispose')
      .mockImplementation(function disposeThenThrow(this: ScavengePhysics) {
        calls.push('physics');
        originalPhysicsDispose.call(this);
        throw disposalFailure;
      });
    let caught: unknown;

    try {
      try {
        Reflect.construct(World, [
          scene,
          propModels,
          furniture,
          1,
          moonTexture,
          physicsRuntime,
          [],
          () => 0.4,
          {
            checkpoint: (stage: string) => {
              if (stage !== 'physics') return;
              scene.getObjectByName('physics-objects')!.addEventListener(
                'removed',
                () => calls.push('object'),
              );
              const ship = scene.getObjectByName('sinking-ship')!;
              ship.addEventListener('removed', () => calls.push('ship-remove'));
              (ship.getObjectByName('sail:mainsail') as Mesh).geometry.addEventListener(
                'dispose',
                () => calls.push('ship-dispose'),
              );
              throw constructionFailure;
            },
          },
        ]);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBe(constructionFailure);
      expect(calls).toEqual(['physics', 'object', 'ship-remove', 'ship-dispose']);
      expect(scene.children).toEqual([sentinel]);
      expect(scene.getObjectByName('physics-object:barrel')).toBeUndefined();
      expect(scene.getObjectByName('sinking-ship')).toBeUndefined();
      expect(physicsDispose).toHaveBeenCalledOnce();
    } finally {
      physicsDispose.mockRestore();
      furniture.dispose();
      propModels.dispose();
      moonTexture.dispose();
    }
  });

  it.each([1, 2])('restores the scene and disposes all owned resources once after %i dispose call(s)', (disposeCalls) => {
    const scene = new Scene();
    const originalBackground = new Color(0x112233);
    const originalFog = new FogExp2(0x112233, 0.004);
    scene.background = originalBackground;
    scene.fog = originalFog;
    const propModels = createTestPropModels();
    const moonTexture = createTestMoonTexture();
    const moonTextureDispose = vi.spyOn(moonTexture, 'dispose');
    const world = createTestWorld(scene, propModels, moonTexture);
    const internals = world as unknown as { scavengePhysics: ScavengePhysics };
    const physicsDispose = vi.spyOn(internals.scavengePhysics, 'dispose');
    const ocean = scene.getObjectByName('procedural-ocean') as Mesh;
    const sky = scene.getObjectByName('procedural-skybox') as Mesh;
    const skyGeometryDispose = vi.spyOn(sky.geometry, 'dispose');
    const skyMaterialDispose = vi.spyOn(sky.material as Material, 'dispose');

    const freighter = world.ship.getObjectByName('coastal-freighter')!;
    const sailGeometries = new Set(['mainsail', 'staysail'].map((id) =>
      (freighter.getObjectByName(`sail:${id}`) as Mesh).geometry));
    const shipResources = collectRenderResources(freighter);
    const shipGeometries = shipResources.geometries;
    const shipMaterials = shipResources.materials;
    const lifeboatMeshes: Mesh[] = [];
    world.lifeboat.traverse((object) => {
      if (object instanceof Mesh) lifeboatMeshes.push(object);
    });
    const lifeboatResources = collectRenderResources(world.lifeboat);
    const propResources = [...world.itemObjects.values()].map(collectRenderResources);
    const propGeometries = new Set(propResources.flatMap((resources) => [...resources.geometries]));
    const propMaterials = new Set(propResources.flatMap((resources) => [...resources.materials]));
    expect([...shipResources.geometries].every((geometry) =>
      !propGeometries.has(geometry) && !lifeboatResources.geometries.has(geometry))).toBe(true);
    expect([...shipResources.materials].every((material) =>
      !propMaterials.has(material) && !lifeboatResources.materials.has(material))).toBe(true);
    expect(sailGeometries.size).toBe(2);
    expect([...sailGeometries].every((geometry) => shipGeometries.has(geometry))).toBe(true);
    const ownedTask6Geometries = new Set([
      ...shipGeometries,
      ...lifeboatResources.geometries,
      ...propGeometries,
    ]);
    const ownedTask6Materials = new Set([
      ...shipMaterials,
      ...lifeboatResources.materials,
      ...propMaterials,
    ]);
    expect(shipGeometries.size).toBeGreaterThan(0);
    expect(shipMaterials.size).toBeGreaterThan(0);
    expect(propResources).toHaveLength(createItemInstances().length);
    propResources.forEach((resources) => {
      expect(resources.geometries.size).toBeGreaterThan(0);
      expect(resources.materials.size).toBeGreaterThan(0);
    });
    expect(lifeboatMeshes.length).toBeGreaterThan(0);

    const geometryDisposals = observeDisposals([
      ...ownedTask6Geometries,
      ocean.geometry,
    ]);
    const ownedMaterialDisposals = observeDisposals([
      ...ownedTask6Materials,
      ocean.material as Material,
    ]);
    expect(scene.getObjectByName('sea-spray')).toBeUndefined();
    expect(scene.getObjectByName('lifeboat-waterline-foam')).toBeUndefined();
    const flareGun = { instanceId: 'flareGun-1', type: 'flareGun' } as const;
    world.saveItem(flareGun);
    world.loseItem('ductTape-1');
    const storedFlareGun = world.itemObjects.get('flareGun-1')!;
    const expectedFlareGun = boatStorageTransform(flareGun);
    expect(storedFlareGun.parent?.name).toBe('lifeboat-storage');
    expect(storedFlareGun.position.toArray()).toEqual(expectedFlareGun.position.toArray());
    expect(storedFlareGun.rotation.toArray()).toEqual(expectedFlareGun.rotation.toArray());
    expect(storedFlareGun.scale.toArray()).toEqual([
      expectedFlareGun.scale,
      expectedFlareGun.scale,
      expectedFlareGun.scale,
    ]);
    expect(world.itemObjects.get('ductTape-1')!.parent).toBeNull();
    expect(world.itemObjects.get('cannedFood-1')!.parent).toBe(world.ship);
    world.physicsObjects.forEach((object) => expect(object.parent?.name).toBe('physics-objects'));
    for (let call = 0; call < disposeCalls; call += 1) world.dispose();

    expect(scene.getObjectByName('sinking-ship')).toBeUndefined();
    expect(scene.getObjectByName('lifeboat')).toBeUndefined();
    expect(scene.getObjectByName('procedural-ocean')).toBeUndefined();
    expect(scene.getObjectByName('rain')).toBeUndefined();
    expect(scene.getObjectByName('procedural-skybox')).toBeUndefined();
    expect(scene.getObjectByName('storm-clouds')).toBeUndefined();
    expect(scene.getObjectByName('physics-object:barrel')).toBeUndefined();
    expect(scene.getObjectByName('physics-object:cargoBox')).toBeUndefined();
    world.physicsObjects.forEach((object) => expect(object.parent?.parent).toBeNull());
    expect(physicsDispose).toHaveBeenCalledOnce();
    expect(skyGeometryDispose).toHaveBeenCalledOnce();
    expect(skyMaterialDispose).toHaveBeenCalledOnce();
    expect(moonTextureDispose).not.toHaveBeenCalled();
    expect(scene.children.some((object) =>
      object instanceof DirectionalLight || object instanceof HemisphereLight)).toBe(false);
    expect(scene.background).toBe(originalBackground);
    expect(scene.fog).toBe(originalFog);
    geometryDisposals.forEach((count) => expect(count).toBe(1));
    ownedMaterialDisposals.forEach((count) => expect(count).toBe(1));
    propModels.dispose();
  });

  it('continues owned geometry, material, and texture cleanup and rethrows the first error', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const furniture = createTestShipFurniture();
    const world = new World(
      scene,
      propModels,
      furniture,
      1,
      createTestMoonTexture(),
      physicsRuntime,
      [createItemInstances()[0]!],
    );
    const propResources = collectRenderResources(world.itemObjects.values().next().value!);
    const geometry = propResources.geometries.values().next().value!;
    const material = propResources.materials.values().next().value!;
    const textures = new Set<Texture>();
    collectRenderResources(world.lifeboat).materials.forEach((ownedMaterial) => {
      Object.values(ownedMaterial).forEach((value) => {
        if (value instanceof Texture) textures.add(value);
      });
    });
    const texture = textures.values().next().value!;
    expect(texture).toBeInstanceOf(Texture);
    const firstError = new Error('world geometry disposal failed');
    const laterError = new Error('world material disposal failed');
    const geometryDispose = vi.spyOn(geometry, 'dispose').mockImplementation(() => {
      throw firstError;
    });
    const materialDispose = vi.spyOn(material, 'dispose').mockImplementation(() => {
      throw laterError;
    });
    const textureDispose = vi.spyOn(texture, 'dispose');

    expect(() => world.dispose()).toThrow(firstError);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
    expect(() => world.dispose()).not.toThrow();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();

    furniture.dispose();
    propModels.dispose();
  });

  it('continues every owner cleanup step after early failures and keeps the first error', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const furniture = createTestShipFurniture();
    const world = new World(
      scene,
      propModels,
      furniture,
      1,
      createTestMoonTexture(),
      physicsRuntime,
      [createItemInstances()[0]!],
    );
    const internals = world as unknown as {
      ocean: OceanRenderer;
      environment: Environment;
      shipBuild: { dispose(): void };
      ownedGeometries: Set<BufferGeometry>;
      ownedMaterials: Set<Material>;
      ownedTextures: Set<Texture>;
    };
    const geometry = internals.ownedGeometries.values().next().value!;
    const material = internals.ownedMaterials.values().next().value!;
    const texture = internals.ownedTextures.values().next().value!;
    const firstError = new Error('ocean owner cleanup failed');
    const laterError = new Error('environment owner cleanup failed');
    const calls: string[] = [];
    const originalOceanDispose = internals.ocean.dispose.bind(internals.ocean);
    const oceanDispose = vi.spyOn(internals.ocean, 'dispose').mockImplementation(() => {
      calls.push('ocean');
      originalOceanDispose();
      throw firstError;
    });
    const originalEnvironmentDispose = internals.environment.dispose.bind(internals.environment);
    const environmentDispose = vi.spyOn(internals.environment, 'dispose').mockImplementation(() => {
      calls.push('environment');
      originalEnvironmentDispose();
      throw laterError;
    });
    const originalSceneRemove = scene.remove.bind(scene);
    let ownerSceneRemoveCalls = 0;
    const sceneRemove = vi.spyOn(scene, 'remove').mockImplementation((...objects: Object3D[]) => {
      if (objects.length > 1 && objects.includes(world.ship)) {
        ownerSceneRemoveCalls += 1;
        calls.push('scene');
      }
      return originalSceneRemove(...objects);
    });
    const originalShipDispose = internals.shipBuild.dispose.bind(internals.shipBuild);
    const shipDispose = vi.spyOn(internals.shipBuild, 'dispose').mockImplementation(() => {
      calls.push('ship');
      originalShipDispose();
    });
    const originalGeometryDispose = geometry.dispose.bind(geometry);
    const geometryDispose = vi.spyOn(geometry, 'dispose').mockImplementation(() => {
      calls.push('geometry');
      originalGeometryDispose();
    });
    const originalMaterialDispose = material.dispose.bind(material);
    const materialDispose = vi.spyOn(material, 'dispose').mockImplementation(() => {
      calls.push('material');
      originalMaterialDispose();
    });
    const originalTextureDispose = texture.dispose.bind(texture);
    const textureDispose = vi.spyOn(texture, 'dispose').mockImplementation(() => {
      calls.push('texture');
      originalTextureDispose();
    });

    expect(() => world.dispose()).toThrow(firstError);

    expect(calls).toEqual([
      'ocean',
      'environment',
      'scene',
      'ship',
      'geometry',
      'material',
      'texture',
    ]);
    expect(scene.getObjectByName('sinking-ship')).toBeUndefined();
    expect(scene.getObjectByName('lifeboat')).toBeUndefined();
    expect(internals.ownedGeometries.size).toBe(0);
    expect(internals.ownedMaterials.size).toBe(0);
    expect(internals.ownedTextures.size).toBe(0);
    expect(() => world.dispose()).not.toThrow();
    [
      oceanDispose,
      environmentDispose,
      shipDispose,
      geometryDispose,
      materialDispose,
      textureDispose,
    ].forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    expect(sceneRemove).toHaveBeenCalled();
    expect(ownerSceneRemoveCalls).toBe(1);

    furniture.dispose();
    propModels.dispose();
  });
});

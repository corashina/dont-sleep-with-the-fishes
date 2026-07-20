import { describe, expect, it, vi } from 'vitest';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Points,
  Quaternion,
  Scene,
  ShaderMaterial,
  Texture,
  Vector3,
  Vector4,
} from 'three';
import { createItemInstances, ITEM_IDS, type ItemInstance } from '../src/game/ItemState';
import { getSinkingState, type SinkingState } from '../src/game/sinking';
import { BoatBuoyancy, smoothBoatPose } from '../src/ocean/BoatBuoyancy';
import { OceanRenderer } from '../src/ocean/OceanRenderer';
import { resolveLocalMovement } from '../src/player/collisions';
import { pointInWaterExclusion } from './helpers/waterExclusion';
import { DEFAULT_WAVES, sampleWaveField } from '../src/ocean/WaveField';
import { boatStorageTransform } from '../src/world/BoatStorage';
import { Environment } from '../src/world/Environment';
import { createLifeboat } from '../src/world/Lifeboat';
import { createProp } from '../src/world/PropFactory';
import { assignShipItems } from '../src/world/ShipItemPlacement';
import { World } from '../src/world/World';
import {
  createTestPropModels,
  TEST_PROP_MODEL_TRANSFORM,
  testPropModel,
} from './helpers/propModels';
import { createTestMoonTexture } from './helpers/skyAssets';
import { createTestShip, createTestShipFurniture } from './helpers/shipFurniture';

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
): World => {
  const furniture = createTestShipFurniture();
  try {
    const world = new World(scene, propModels, furniture, 1, moonTexture, instances, random);
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
  it('integrates the shared furniture library, anisotropy, owned surfaces, and exact start', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const shipFurniture = createTestShipFurniture();
    const world = new World(
      scene,
      propModels,
      shipFurniture,
      8,
      createTestMoonTexture(),
      createItemInstances(),
      () => 0.35,
    );
    const libraryDispose = vi.spyOn(shipFurniture, 'dispose');
    const surfaceIds = [...world.itemObjects.values()]
      .map((object) => object.userData.shipSurfaceId as string);

    expect(world.playerStart.toArray()).toEqual([0, 3.72, 7.2]);
    expect(surfaceIds).toHaveLength(22);
    expect(new Set(surfaceIds).size).toBe(22);
    expect(surfaceIds.every(Boolean)).toBe(true);
    world.dispose();
    expect(libraryDispose).not.toHaveBeenCalled();
    shipFurniture.dispose();
    propModels.dispose();
  });

  it('removes and disposes the ship when construction fails during item assignment', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const oversizedInventory = Array.from({ length: 40 }, (_, index): ItemInstance => ({
      instanceId: `cannedFood-${index + 1}` as ItemInstance['instanceId'],
      type: 'cannedFood',
    }));

    expect(() => createTestWorld(
      scene,
      propModels,
      createTestMoonTexture(),
      oversizedInventory,
      () => 0.4,
    ))
      .toThrow('Unable to place ship item');
    expect(scene.getObjectByName('sinking-ship')).toBeUndefined();
    propModels.dispose();
  });

  it.each(['lifeboat', 'ocean', 'environment', 'buoyancy'] as const)(
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

      try {
        constructed = Reflect.construct(World, [
          scene, propModels, furniture, 1, moonTexture, [], () => 0.4,
          {
            checkpoint: (stage: typeof failureStage) => {
              if (stage !== failureStage) return;
              const resources = new Set<BufferGeometry | Material>();
              ['lifeboat', 'procedural-ocean', 'procedural-skybox', 'sea-spray']
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
      } finally {
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
          scene, propModels, furniture, 1, moonTexture, [], () => 0.4,
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
              throw failure;
            },
          },
        ]);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBe(failure);
      expect(order).toEqual(expect.arrayContaining([
        'environment', 'ocean', 'lifeboat', 'prop', 'ship',
      ]));
      expect(order.indexOf('environment')).toBeLessThan(order.indexOf('ocean'));
      expect(order.indexOf('ocean')).toBeLessThan(order.indexOf('lifeboat'));
      expect(order.indexOf('lifeboat')).toBeLessThan(order.indexOf('prop'));
      expect(order.indexOf('prop')).toBeLessThan(order.indexOf('ship'));
      counts.forEach((count) => expect(count).toBe(1));
      expect(environmentDispose).toHaveBeenCalledTimes(1);
      expect(oceanDispose).toHaveBeenCalledTimes(1);
      expect(scene.children).toEqual([sentinel]);
      expect(scene.background).toBe(originalBackground);
      expect(scene.fog).toBe(originalFog);
      expect(propLibraryDispose).not.toHaveBeenCalled();
      expect(furnitureLibraryDispose).not.toHaveBeenCalled();
      expect(moonDispose).not.toHaveBeenCalled();
    } finally {
      environmentDispose.mockRestore();
      oceanDispose.mockRestore();
      furniture.dispose();
      propModels.dispose();
      moonTexture.dispose();
    }
  });

  it('assembles one object for every supply instance and exposes gameplay markers', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const world = createTestWorld(scene, propModels, createTestMoonTexture(), createItemInstances());
    expect(world.itemObjects.size).toBe(22);
    expect(world.colliders.length).toBeGreaterThanOrEqual(10);
    expect(scene.getObjectByName('sinking-ship')).toBeDefined();
    expect(scene.getObjectByName('lifeboat')).toBeDefined();
    world.itemObjects.forEach((prop) => {
      expect(prop.scale.x).toBeGreaterThanOrEqual(0.75);
      expect(prop.scale.x).toBeLessThanOrEqual(1);
      expect(prop.scale.toArray()).toEqual([prop.scale.x, prop.scale.x, prop.scale.x]);
      expectTestModelTransform(prop);
    });
    world.dispose();
    propModels.dispose();
  });

  it('binds but does not own the shared moon texture', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const moonTexture = createTestMoonTexture();
    const textureDispose = vi.spyOn(moonTexture, 'dispose');
    const world = createTestWorld(scene, propModels, moonTexture);
    const sky = scene.getObjectByName('procedural-skybox') as Mesh;

    expect((sky.material as ShaderMaterial).uniforms.uMoonMap!.value).toBe(moonTexture);

    world.dispose();
    world.dispose();
    expect(textureDispose).not.toHaveBeenCalled();
    propModels.dispose();
  });

  it('builds twenty-two model instances including a distinct scuba set', () => {
    const propModels = createTestPropModels();
    const world = createTestWorld(
      new Scene(),
      propModels,
      createTestMoonTexture(),
      createItemInstances(),
    );
    expect(world.itemObjects.size).toBe(22);
    expect(world.itemObjects.get('scubaSet-1')?.userData.itemType).toBe('scubaSet');
    expect(world.itemObjects.get('scubaSet-1')?.userData.instanceId).toBe('scubaSet-1');
    world.dispose();
    propModels.dispose();
  });

  it('keeps physical sinking effects while rendering calm sunny weather', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const moonTexture = createTestMoonTexture();
    const world = createTestWorld(scene, propModels, moonTexture);
    expect(world.ship.position.toArray()).toEqual([0, -0.76, 0]);
    const sinking: SinkingState = {
      progress: 0.4,
      rollRadians: -0.12,
      pitchRadians: 0.04,
      sinkOffset: -1.25,
      alarmRate: 1,
      waveAmplitudeScale: 1.18,
      cameraShake: 0.006,
    };
    const time = 3.75;
    const delta = 0.2;
    const cameraPosition = new Vector3(14, 7, -11);
    const buoyancy = new BoatBuoyancy((sampleTime, x, z, scale) =>
      sampleWaveField(DEFAULT_WAVES, sampleTime, x, z, scale));
    const target = buoyancy.sampleTarget(time, 9.0, -6.5, sinking.waveAmplitudeScale);
    const expectedPose = smoothBoatPose(
      { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 },
      target,
      delta,
      7,
    );
    const freighterBuoyancy = new BoatBuoyancy(
      (sampleTime, x, z, scale) => sampleWaveField(DEFAULT_WAVES, sampleTime, x, z, scale),
      { length: 30, width: 10 },
    );
    const freighterTarget = freighterBuoyancy.sampleTarget(
      time,
      0,
      0,
      sinking.waveAmplitudeScale,
    );
    const expectedFreighterPose = smoothBoatPose(
      { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 },
      freighterTarget,
      delta,
      2.4,
    );
    const collidersBefore = world.colliders.map((box) => ({ ...box }));
    const movementStart = {
      x: world.playerStart.x,
      y: world.playerStart.y,
      z: world.playerStart.z,
    };
    const movementDesired = {
      x: movementStart.x + 3,
      y: movementStart.y,
      z: movementStart.z - 2,
    };
    const resolvedBefore = resolveLocalMovement(
      movementStart,
      movementDesired,
      0.35,
      world.colliders,
      world.arcColliders,
    );
    const beacon = scene.getObjectByName('alarm-beacon') as Mesh;
    const sky = scene.getObjectByName('procedural-skybox') as Mesh;
    const skyUniforms = (sky.material as ShaderMaterial).uniforms;
    expect(scene.getObjectByName('rain')).toBeUndefined();
    expect(scene.getObjectByName('sea-spray')).toBeInstanceOf(Points);
    expect(skyUniforms.uSunVisibility!.value).toBe(1);

    world.update(time, delta, sinking, cameraPosition, false);

    const ocean = scene.getObjectByName('procedural-ocean') as Mesh;
    const oceanMaterial = ocean.material as ShaderMaterial;
    expect(oceanMaterial.uniforms.uTime!.value).toBe(time);
    expect(oceanMaterial.uniforms.uAmplitudeScale!.value).toBe(sinking.waveAmplitudeScale);
    expect(world.lifeboat.position.x).toBeCloseTo(9.0 + expectedPose.driftX);
    expect(world.lifeboat.position.y).toBeCloseTo(0.35 + expectedPose.y);
    expect(world.lifeboat.position.z).toBeCloseTo(-6.5 + expectedPose.driftZ);
    expect(world.lifeboat.rotation.x).toBeCloseTo(expectedPose.pitch);
    expect(world.lifeboat.rotation.z).toBeCloseTo(-expectedPose.roll);
    expect(world.lifeboat.scale.toArray()).toEqual([1, 1, 1]);
    expect(world.ship.position.x).toBe(0);
    expect(world.ship.position.y).toBeCloseTo(
      sinking.sinkOffset + expectedFreighterPose.y - 0.76,
    );
    expect(world.ship.position.z).toBe(0);
    expect(world.ship.rotation.x).toBeCloseTo(
      sinking.pitchRadians + expectedFreighterPose.pitch,
    );
    expect(world.ship.rotation.y).toBe(0);
    expect(world.ship.rotation.z).toBeCloseTo(
      sinking.rollRadians - expectedFreighterPose.roll,
    );
    expect(world.colliders).toEqual(collidersBefore);
    expect(resolveLocalMovement(
      movementStart,
      movementDesired,
      0.35,
      world.colliders,
      world.arcColliders,
    )).toEqual(resolvedBefore);
    expect((scene.fog as FogExp2).density).toBeCloseTo(0.012);
    expect(beacon).toBeInstanceOf(Mesh);
    const expectedPulse = 0.5 + 0.5 * Math.sin(time * Math.PI * 2 * sinking.alarmRate);
    expect((beacon.material as MeshStandardMaterial).emissiveIntensity)
      .toBeCloseTo(0.25 + expectedPulse * 1.35);
    expect(sky).toBeInstanceOf(Mesh);
    expect(sky.position.toArray()).toEqual(cameraPosition.toArray());
    expect(scene.getObjectByName('storm-clouds')).toBeUndefined();
    expect(scene.getObjectByName('rain')).toBeUndefined();
    expect(scene.getObjectByName('sea-spray')).toBeInstanceOf(Points);
    expect(skyUniforms.uMoonMap!.value).toBe(moonTexture);
    expect(skyUniforms.uSunVisibility!.value).toBe(1);
    expect(oceanMaterial.uniforms.uDirectLightStrength?.value).toBe(
      skyUniforms.uSunVisibility!.value,
    );
    expect(oceanMaterial.uniforms.uHorizonColor!.value).toEqual(
      skyUniforms.uHorizonColor!.value,
    );
    const smoke = scene.getObjectByName('freighter-smoke') as Points;
    const smokePositions = smoke.geometry.getAttribute('position') as BufferAttribute;
    const smokeVersion = smokePositions.version;
    world.update(1, 0.1, { ...sinking, progress: 1 }, cameraPosition, false);
    expect(smokePositions.version).toBeGreaterThan(smokeVersion);
    expect((scene.fog as FogExp2).density).toBeCloseTo(0.012);
    expect(skyUniforms.uSunVisibility!.value).toBe(1);
    world.dispose();
    propModels.dispose();
  });

  it('uploads ship and lifeboat exclusions from their current world transforms', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const world = createTestWorld(scene, propModels, createTestMoonTexture());
    const sinking = getSinkingState(45, 120);

    world.update(2.5, 0.1, sinking, new Vector3(12, 5, -9), false);

    const ocean = scene.getObjectByName('procedural-ocean') as Mesh;
    const uniforms = (ocean.material as ShaderMaterial).uniforms;
    const matrices = uniforms.uExclusionWorldToLocal!.value as Matrix4[];
    const bounds = uniforms.uExclusionBounds!.value as Vector4[];
    const lowerBounds = uniforms.uExclusionLowerBounds!.value as Vector4[];
    const taperStarts = uniforms.uExclusionTaperStarts!.value as number[];
    const lowerTaperStarts = uniforms.uExclusionLowerTaperStarts!.value as number[];
    const minimumLocalYs = uniforms.uExclusionMinimumLocalYs!.value as number[];
    const upperLocalYs = uniforms.uExclusionUpperLocalYs!.value as number[];
    expect(uniforms.uExclusionCount!.value).toBe(2);
    expect(bounds.map((value) => value.toArray())).toEqual([
      [-6.25, 6.25, -18, 18],
      [-1.6, 1.6, -3.04, 3.04],
    ]);
    expect(taperStarts).toEqual([14, 1.05]);
    expect(minimumLocalYs).toEqual([0.76, -0.38]);
    expect(lowerBounds.map((value) => value.toArray())).toEqual([
      [-5.375, 5.375, -17.28, 17.28],
      [-1.6, 1.6, -3.04, 3.04],
    ]);
    expect(lowerTaperStarts).toEqual([13.44, 1.05]);
    expect(upperLocalYs).toEqual([1.86, -0.38]);
    expect(matrices[0]!.elements).toEqual(world.ship.matrixWorld.clone().invert().elements);
    expect(world.ship.position.y).not.toBe(0);
    expect(world.ship.rotation.x).not.toBe(0);
    const freighterRegion = {
      worldToLocal: matrices[0]!,
      bounds: bounds[0]!,
      taperStart: taperStarts[0]!,
      minimumLocalY: minimumLocalYs[0]!,
      lowerHalfWidth: Math.abs(lowerBounds[0]!.x),
      lowerHalfLength: Math.abs(lowerBounds[0]!.z),
      lowerTaperStart: lowerTaperStarts[0]!,
      upperLocalY: upperLocalYs[0]!,
    };
    expect(pointInWaterExclusion(
      world.ship.localToWorld(new Vector3(0, 0.5, 0)),
      freighterRegion,
    )).toBe(false);
    expect(pointInWaterExclusion(
      world.ship.localToWorld(new Vector3(0, 0.9, 0)),
      freighterRegion,
    )).toBe(true);
    expect(pointInWaterExclusion(
      world.ship.localToWorld(new Vector3(5.5, 1.2, 16.5)),
      freighterRegion,
    )).toBe(false);
    expect(pointInWaterExclusion(
      world.ship.localToWorld(new Vector3(5.7, 0.76, 0)),
      freighterRegion,
    )).toBe(false);
    expect(pointInWaterExclusion(
      world.ship.localToWorld(new Vector3(5.7, 1.86, 0)),
      freighterRegion,
    )).toBe(true);
    expect(pointInWaterExclusion(
      world.ship.localToWorld(new Vector3(0, 0.76, 17.5)),
      freighterRegion,
    )).toBe(false);
    expect(pointInWaterExclusion(
      world.ship.localToWorld(new Vector3(0, 1.86, 17.5)),
      freighterRegion,
    )).toBe(true);
    expect(matrices[1]!.elements).toEqual(world.lifeboat.matrixWorld.clone().invert().elements);
    expect(pointInWaterExclusion(
      world.lifeboat.localToWorld(new Vector3(0.8, 0, 1.5)),
      {
        worldToLocal: matrices[1]!,
        bounds: bounds[1]!,
        taperStart: taperStarts[1]!,
        minimumLocalY: minimumLocalYs[1]!,
        lowerHalfWidth: Math.abs(lowerBounds[1]!.x),
        lowerHalfLength: Math.abs(lowerBounds[1]!.z),
        lowerTaperStart: lowerTaperStarts[1]!,
        upperLocalY: upperLocalYs[1]!,
      },
    )).toBe(true);
    expect(pointInWaterExclusion(
      world.lifeboat.localToWorld(new Vector3(1.12, 0, 2.4)),
      {
        worldToLocal: matrices[1]!,
        bounds: bounds[1]!,
        taperStart: taperStarts[1]!,
        minimumLocalY: minimumLocalYs[1]!,
        lowerHalfWidth: Math.abs(lowerBounds[1]!.x),
        lowerHalfLength: Math.abs(lowerBounds[1]!.z),
        lowerTaperStart: lowerTaperStarts[1]!,
        upperLocalY: upperLocalYs[1]!,
      },
    )).toBe(true);
    expect(pointInWaterExclusion(
      world.lifeboat.localToWorld(new Vector3(1.4, 0, 2.4)),
      {
        worldToLocal: matrices[1]!,
        bounds: bounds[1]!,
        taperStart: taperStarts[1]!,
        minimumLocalY: minimumLocalYs[1]!,
        lowerHalfWidth: Math.abs(lowerBounds[1]!.x),
        lowerHalfLength: Math.abs(lowerBounds[1]!.z),
        lowerTaperStart: lowerTaperStarts[1]!,
        upperLocalY: upperLocalYs[1]!,
      },
    )).toBe(false);
    expect(pointInWaterExclusion(
      world.lifeboat.localToWorld(new Vector3(0, -0.5, 0)),
      {
        worldToLocal: matrices[1]!,
        bounds: bounds[1]!,
        taperStart: taperStarts[1]!,
        minimumLocalY: minimumLocalYs[1]!,
        lowerHalfWidth: Math.abs(lowerBounds[1]!.x),
        lowerHalfLength: Math.abs(lowerBounds[1]!.z),
        lowerTaperStart: lowerTaperStarts[1]!,
        upperLocalY: upperLocalYs[1]!,
      },
    )).toBe(false);
    world.dispose();
    propModels.dispose();
  });

  it('slows spray while keeping the procedural sky fixed to the camera', () => {
    const sinking = getSinkingState(60, 120);
    const propModels = createTestPropModels();
    const regularScene = new Scene();
    const reducedScene = new Scene();
    const regular = createTestWorld(regularScene, propModels, createTestMoonTexture());
    const reduced = createTestWorld(reducedScene, propModels, createTestMoonTexture());
    const regularSpray = regularScene.getObjectByName('sea-spray') as Points;
    const reducedSpray = reducedScene.getObjectByName('sea-spray') as Points;
    const regularY = (regularSpray.geometry.getAttribute('position') as BufferAttribute).array[1] as number;
    const reducedY = (reducedSpray.geometry.getAttribute('position') as BufferAttribute).array[1] as number;

    regular.update(1, 1, sinking, new Vector3(), false);
    reduced.update(1, 1, sinking, new Vector3(), true);

    const regularDistance = (
      ((regularSpray.geometry.getAttribute('position') as BufferAttribute).array[1] as number) - regularY + 2.2
    ) % 2.2;
    const reducedDistance = (
      ((reducedSpray.geometry.getAttribute('position') as BufferAttribute).array[1] as number) - reducedY + 2.2
    ) % 2.2;
    expect(regularDistance).toBeGreaterThan(reducedDistance);
    expect(regularScene.getObjectByName('storm-clouds')).toBeUndefined();
    expect(reducedScene.getObjectByName('storm-clouds')).toBeUndefined();
    expect(regularScene.getObjectByName('procedural-skybox')).toBeDefined();
    expect(reducedScene.getObjectByName('procedural-skybox')).toBeDefined();
    regular.dispose();
    reduced.dispose();
    propModels.dispose();
  });

  it('saves scavenged items in the shared type-aware boat slots', () => {
    const propModels = createTestPropModels();
    const instances = createItemInstances();
    const world = createTestWorld(
      new Scene(),
      propModels,
      createTestMoonTexture(),
      instances,
      () => 0.35,
    );
    const cannedFood = instances.find(({ instanceId }) => instanceId === 'cannedFood-3')!;
    const flareGun = instances.find(({ instanceId }) => instanceId === 'flareGun-1')!;

    world.saveItem(cannedFood);
    world.saveItem(flareGun);

    for (const instance of [cannedFood, flareGun]) {
      const prop = world.itemObjects.get(instance.instanceId)!;
      const transform = boatStorageTransform(instance);
      expect(prop.parent?.name).toBe('lifeboat-storage');
      expect(prop.position.toArray()).toEqual(transform.position.toArray());
      expect(prop.rotation.toArray().slice(0, 3))
        .toEqual(transform.rotation.toArray().slice(0, 3));
      expect(prop.scale.toArray()).toEqual([transform.scale, transform.scale, transform.scale]);
    }

    world.dispose();
    propModels.dispose();
  });

  it('reattaches landed items to the sinking ship and restores their scale', () => {
    const propModels = createTestPropModels();
    const world = createTestWorld(
      new Scene(),
      propModels,
      createTestMoonTexture(),
      createItemInstances(),
    );
    const landed = world.itemObjects.get('cannedFood-1')!;
    const assignedScale = landed.scale.x;
    landed.removeFromParent();
    landed.scale.setScalar(0.37);
    expect(landed.scale.x).not.toBe(assignedScale);

    world.landItem('cannedFood-1');

    expect(landed.parent).toBe(world.ship);
    expect(landed.scale.toArray()).toEqual([assignedScale, assignedScale, assignedScale]);
    expectTestModelTransform(landed);
    world.dispose();
    propModels.dispose();
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
    const ocean = scene.getObjectByName('procedural-ocean') as Mesh;
    const spray = scene.getObjectByName('sea-spray') as Points;
    const sky = scene.getObjectByName('procedural-skybox') as Mesh;
    const skyGeometryDispose = vi.spyOn(sky.geometry, 'dispose');
    const skyMaterialDispose = vi.spyOn(sky.material as Material, 'dispose');

    const freighter = world.ship.getObjectByName('coastal-freighter')!;
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
    expect(propResources).toHaveLength(22);
    propResources.forEach((resources) => {
      expect(resources.geometries.size).toBeGreaterThan(0);
      expect(resources.materials.size).toBeGreaterThan(0);
    });
    expect(lifeboatMeshes.length).toBeGreaterThan(0);

    const geometryDisposals = observeDisposals([
      ...ownedTask6Geometries,
      ocean.geometry,
      spray.geometry,
    ]);
    const ownedMaterialDisposals = observeDisposals([
      ...ownedTask6Materials,
      ocean.material as Material,
      spray.material as Material,
    ]);
    world.saveItem({ instanceId: 'flareGun-1', type: 'flareGun' });
    world.loseItem('ductTape-1');
    expect(world.itemObjects.get('flareGun-1')!.parent?.name).toBe('lifeboat-storage');
    expect(world.itemObjects.get('ductTape-1')!.parent).toBeNull();
    expect(world.itemObjects.get('cannedFood-1')!.parent).toBe(world.ship);
    for (let call = 0; call < disposeCalls; call += 1) world.dispose();

    expect(scene.getObjectByName('sinking-ship')).toBeUndefined();
    expect(scene.getObjectByName('lifeboat')).toBeUndefined();
    expect(scene.getObjectByName('procedural-ocean')).toBeUndefined();
    expect(scene.getObjectByName('rain')).toBeUndefined();
    expect(scene.getObjectByName('sea-spray')).toBeUndefined();
    expect(scene.getObjectByName('procedural-skybox')).toBeUndefined();
    expect(scene.getObjectByName('storm-clouds')).toBeUndefined();
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

  it.each(ITEM_IDS)('builds a visible mesh for %s', (type) => {
    const propModels = createTestPropModels();
    const instance = { instanceId: `${type}-1`, type } as ItemInstance;
    const prop = createProp(propModels, instance);
    expect(prop.name).toBe(`prop:${instance.instanceId}`);
    expect(prop.userData).toMatchObject({
      instanceId: instance.instanceId,
      itemType: instance.type,
    });
    expect(prop.position.toArray()).toEqual([0, 0, 0]);
    expect(prop.quaternion.angleTo(new Quaternion())).toBeCloseTo(0);
    expect(prop.scale.toArray()).toEqual([1, 1, 1]);
    expectTestModelTransform(prop);
    expect(meshCount(prop)).toBeGreaterThan(0);
    collectRenderResources(prop).geometries.forEach((geometry) => geometry.dispose());
    collectRenderResources(prop).materials.forEach((material) => material.dispose());
    propModels.dispose();
  });

  it('builds the furnished freighter contract with surplus authored anchors', () => {
    const ship = createTestShip();
    expect(ship.itemSurfaces.length).toBeGreaterThan(createItemInstances().length);
    expect(ship.colliders.length).toBeGreaterThanOrEqual(24);
    expect(ship.playerStart.toArray()).toEqual([0, 3.72, 7.2]);
    expect(ship.evacuationPoint.toArray()).toEqual([5.4, 3.72, -6.5]);
    expect(ship.lifeboatAnchor.toArray()).toEqual([9.0, 0.35, -6.5]);
    expect(ship.waterExclusion).toEqual({
      halfWidth: 6.25,
      halfLength: 18,
      taperStart: 14,
      minimumLocalY: 0.76,
      heightProfile: {
        lowerHalfWidth: 5.375,
        lowerHalfLength: 17.28,
        lowerTaperStart: 13.44,
        upperLocalY: 1.86,
      },
    });
    expect(ship.root.getObjectByName('ship-furniture')).toBeDefined();
    expect(ship.root.getObjectByName('freighter-smoke')).toBeDefined();
    ship.dispose();
  });

  it('places all world items on unique authored anchors', () => {
    const propModels = createTestPropModels();
    const world = createTestWorld(
      new Scene(),
      propModels,
      createTestMoonTexture(),
      createItemInstances(),
      () => 0.35,
    );
    const referenceShip = createTestShip();
    const surfacesById = new Map(referenceShip.itemSurfaces.map((surface) => [surface.id, surface]));
    const assignments = assignShipItems(createItemInstances(), referenceShip.itemSurfaces, () => 0.35);
    const surfaceIds = [...world.itemObjects.values()].map((item) => item.userData.shipSurfaceId as string);
    expect(surfaceIds).toHaveLength(22);
    expect(new Set(surfaceIds).size).toBe(22);
    expect(surfaceIds.every(Boolean)).toBe(true);
    world.itemObjects.forEach((item, instanceId) => {
      const surface = surfacesById.get(item.userData.shipSurfaceId as string);
      const assignment = assignments.get(instanceId);
      expect(surface).toBeDefined();
      expect(assignment).toBeDefined();
      expect(item.position.toArray()).toEqual(assignment!.position.toArray());
      expect(item.rotation.toArray()).toEqual(assignment!.rotation.toArray());
      expect(item.scale.toArray()).toEqual([assignment!.scale, assignment!.scale, assignment!.scale]);
    });
    world.dispose();
    referenceShip.dispose();
    propModels.dispose();
  });

  it('builds an unmarked storage root inside the lifeboat', () => {
    const lifeboat = createLifeboat();
    expect(lifeboat.storageRoot.name).toBe('lifeboat-storage');
    expect(lifeboat.storageRoot.children).toHaveLength(0);
    expect(lifeboat.root.getObjectByName('supply-slot-1')).toBeUndefined();
  });

  it('limits acceptance to the lifeboat interior above its floor', () => {
    const { acceptanceBox } = createLifeboat();
    expect(acceptanceBox.containsPoint(new Vector3(0, 0, 0))).toBe(true);
    expect(acceptanceBox.min.toArray()).toEqual([-1.35, -0.3, -2.72]);
    expect(acceptanceBox.max.toArray()).toEqual([1.35, 1, 2.72]);
  });

  it.each([
    ['hull side', new Vector3(1.5, 0, 0)],
    ['endcap', new Vector3(0, 0, 2.9)],
    ['underside', new Vector3(0, -0.4, 0)],
  ])('rejects a thrown item at the lifeboat %s', (_label, point) => {
    expect(createLifeboat().acceptanceBox.containsPoint(point)).toBe(false);
  });
});

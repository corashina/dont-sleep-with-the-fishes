import { describe, expect, it, vi } from 'vitest';
import {
  Box3,
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
  PointsMaterial,
  Quaternion,
  Scene,
  ShaderMaterial,
  SpotLight,
  Texture,
  Vector3,
  Vector4,
} from 'three';
import { createItemInstances, ITEM_IDS, type ItemInstance } from '../src/game/ItemState';
import { getSinkingState, type SinkingState } from '../src/game/sinking';
import { BoatBuoyancy, smoothBoatPose } from '../src/ocean/BoatBuoyancy';
import { OceanRenderer } from '../src/ocean/OceanRenderer';
import { resolveLocalMovement } from '../src/player/collisions';
import { mulberry32 } from '../src/survival/random';
import { pointInWaterExclusion } from './helpers/waterExclusion';
import { DEFAULT_WAVES, sampleWaveField } from '../src/ocean/WaveField';
import { boatStorageTransform } from '../src/world/BoatStorage';
import { SUN_DIRECTION } from '../src/world/celestialLight';
import { Environment } from '../src/world/Environment';
import { createLifeboat } from '../src/world/Lifeboat';
import { createTestLifeboatAssets } from './helpers/lifeboatAssets';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import { createProp } from '../src/world/PropFactory';
import { createShipDeckDetails } from '../src/world/ShipDeckDetails';
import { createShipFurniture } from '../src/world/ShipFurniture';
import { createShipGeometry } from '../src/world/ShipGeometry';
import { assignShipItems, shipItemTransformBounds } from '../src/world/ShipItemPlacement';
import { FREIGHTER_DIMENSIONS, SHIP_LAYOUT } from '../src/world/ShipLayout';
import { createShipMaterials } from '../src/world/ShipMaterials';
import { createShipRigging } from '../src/world/ShipRigging';
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

  it('does not add ceiling fixtures or localized room lights to the scavenging ship', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const createPracticalLight = vi.spyOn(propModels, 'createPracticalLight');
    const world = createTestWorld(scene, propModels);
    const spotLights: SpotLight[] = [];
    world.ship.traverse((object) => {
      if (object instanceof SpotLight) spotLights.push(object);
    });

    expect(scene.getObjectByName('ship-room-lights')).toBeUndefined();
    expect(world.ship.getObjectByName('room-lamp:crew-cabin')).toBeUndefined();
    expect(spotLights).toEqual([]);
    expect(createPracticalLight).not.toHaveBeenCalled();

    world.dispose();
    propModels.dispose();
  });

  it('removes and disposes the ship when construction fails during item assignment', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    let observed: Map<BufferGeometry | Material, number> | undefined;
    const oversizedInventory = Array.from({ length: 40 }, (_, index): ItemInstance => ({
      instanceId: `cannedFood-${index + 1}` as ItemInstance['instanceId'],
      type: 'cannedFood',
    }));
    const observeShipResources = (): number => {
      if (!observed) {
        const ship = scene.getObjectByName('sinking-ship')!;
        expect(ship.getObjectByName('ship-deck-details')).toBeDefined();
        expect(ship.getObjectByName('ship-rigging')).toBeDefined();
        expect(ship.getObjectByName('freighter-smoke')).toBeDefined();
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
    expect(propResources).toHaveLength(21);
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
});

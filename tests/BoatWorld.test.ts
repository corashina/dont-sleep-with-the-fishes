import { describe, expect, it, vi } from 'vitest';
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  DirectionalLight,
  FogExp2,
  Group,
  Line,
  MathUtils,
  Matrix4,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PointLight,
  Points,
  Quaternion,
  ShaderMaterial,
  Texture,
  Vector3,
  Vector4,
} from 'three';
import {
  ITEM_DEFINITIONS,
  createItemInstances,
  type ItemId,
  type ItemInstance,
  type ItemInstanceId,
} from '../src/game/ItemState';
import { BoatBuoyancy, smoothBoatPose } from '../src/ocean/BoatBuoyancy';
import { OceanRenderer } from '../src/ocean/OceanRenderer';
import { DEFAULT_WAVES, sampleWaveField } from '../src/ocean/WaveField';
import { UNBOUNDED_MINIMUM_LOCAL_Y } from '../src/ocean/WaterExclusion';
import { BoatWorld, FISHING_PLAYER_SEAT } from '../src/survival/BoatWorld';
import { FishingCatchLibrary } from '../src/survival/FishingCatchLibrary';
import { FishingBiteParticles } from '../src/survival/FishingBiteParticles';
import { FISHING_CATCHES } from '../src/survival/fishingCatalog';
import {
  boatStorageTransform,
  boatSupplyTransform,
} from '../src/world/BoatStorage';
import { SUN_DIRECTION } from '../src/world/celestialLight';
import { projectBoatBounds } from '../src/survival/BoatInteraction';
import { collectMeshResources } from '../src/world/SceneResources';
import { HOVER_OUTLINE_NAME } from '../src/rendering/HoverOutline';
import { SurvivalInventoryState } from '../src/survival/inventory';
import type { SurvivalSnapshot } from '../src/survival/survivalTypes';
import { presentationWeatherProfile } from '../src/weather/presentationWeather';
import type { SkyPalette } from '../src/world/skyPalette';
import {
  createTestPropModels,
  TEST_PROP_MODEL_TRANSFORM,
  testPropModel,
} from './helpers/propModels';
import { loadProductionPropModels } from './helpers/productionPropModels';
import { createTestMoonTexture } from './helpers/skyAssets';

const savedItem = (type: ItemId, index = 1): ItemInstance => ({
  instanceId: `${type}-${index}` as ItemInstanceId,
  type,
});

function firstMesh(root: Object3D): Mesh {
  let found: Mesh | undefined;
  root.traverse((object) => {
    if (!found && object instanceof Mesh) found = object;
  });
  if (!found) throw new Error('Expected saved prop mesh');
  return found;
}

function expectTestModelTransform(root: Object3D): void {
  const model = testPropModel(root);
  expect(model.position.toArray()).toEqual(TEST_PROP_MODEL_TRANSFORM.position);
  model.rotation.toArray().slice(0, 3).forEach((value, index) => {
    expect(value).toBeCloseTo(TEST_PROP_MODEL_TRANSFORM.rotation[index]!);
  });
  expect(model.scale.toArray()).toEqual(TEST_PROP_MODEL_TRANSFORM.scale);
}

function boundsRelativeTo(root: Object3D): Box3 {
  root.updateWorldMatrix(true, true);
  const inverseRoot = new Matrix4().copy(root.matrixWorld).invert();
  const bounds = new Box3().makeEmpty();
  const localMatrix = new Matrix4();
  const point = new Vector3();

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.computeBoundingBox();
    const geometryBounds = object.geometry.boundingBox;
    if (geometryBounds === null) return;
    localMatrix.multiplyMatrices(inverseRoot, object.matrixWorld);
    for (let corner = 0; corner < 8; corner += 1) {
      point.set(
        corner & 1 ? geometryBounds.max.x : geometryBounds.min.x,
        corner & 2 ? geometryBounds.max.y : geometryBounds.min.y,
        corner & 4 ? geometryBounds.max.z : geometryBounds.min.z,
      ).applyMatrix4(localMatrix);
      bounds.expandByPoint(point);
    }
  });
  return bounds;
}

function snapshot(
  savedItems: readonly ItemInstance[],
  overrides: Partial<SurvivalSnapshot> = {},
): SurvivalSnapshot {
  return {
    state: 'day',
    day: 1,
    health: 100,
    hunger: 20,
    energy: 80,
    hull: 80,
    food: 0,
    bait: 0,
    recoveredFood: 0,
    recoveredBait: 0,
    repairMaterial: 0,
    rescueProgress: 0,
    weather: 'calm',
    actedToday: false,
    journalEntries: [],
    inventory: new SurvivalInventoryState(savedItems).snapshot(),
    savedItems,
    pendingEventId: null,
    lastOutcome: null,
    seed: 8,
    ...overrides,
  };
}

function expectedSurvivalPose(
  time: number,
  delta: number,
  amplitudeScale: number,
) {
  const buoyancy = new BoatBuoyancy((sampleTime, x, z, scale) =>
    sampleWaveField(DEFAULT_WAVES, sampleTime, x, z, scale));
  const target = buoyancy.sampleTarget(time, 0, 0, amplitudeScale);
  return smoothBoatPose(
    { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 },
    target,
    delta,
    7,
  );
}

describe('BoatWorld helpers', () => {
  it('uses canonical supply transforms without the old slatted platform', () => {
    const savedItems = createItemInstances();
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      createTestMoonTexture(),
      savedItems,
    );
    world.syncInventory(snapshot(savedItems, {
      food: ITEM_DEFINITIONS.cannedFood.spawnCount,
      bait: ITEM_DEFINITIONS.baitTin.spawnCount,
      recoveredFood: ITEM_DEFINITIONS.cannedFood.spawnCount,
      recoveredBait: ITEM_DEFINITIONS.baitTin.spawnCount,
    }));

    expect(world.scene.getObjectByName('survival-supply-platform')).toBeUndefined();
    for (const type of Object.keys(ITEM_DEFINITIONS) as ItemId[]) {
      for (let index = 0; index < ITEM_DEFINITIONS[type].spawnCount; index += 1) {
        const copy = world.scene.getObjectByName(
          `boat-supply:${type}:copy-${index + 1}`,
        )!;
        const expected = boatSupplyTransform(type, index);

        expect(copy.visible, `${type}-${index + 1}`).toBe(true);
        expect(copy.position.toArray()).toEqual(expected.position.toArray());
        expect(copy.rotation.toArray()).toEqual(expected.rotation.toArray());
        expect(copy.scale.toArray()).toEqual([
          expected.scale,
          expected.scale,
          expected.scale,
        ]);
      }
    }

    world.dispose();
    propModels.dispose();
  });

  it('uses the resolved thunderstorm profile for atmosphere and shared wave motion', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    );
    const buoyancySample = vi.spyOn(BoatBuoyancy.prototype, 'sampleTargetInto');
    const oceanUpdate = vi.spyOn(OceanRenderer.prototype, 'update');
    const profile = presentationWeatherProfile('thunderstorm');
    const internals = world as unknown as {
      ambient: { intensity: number };
      key: { intensity: number };
      sky: { palette: Readonly<SkyPalette> };
      weatherEffects: {
        state: { profile: ReturnType<typeof presentationWeatherProfile> };
      };
    };

    try {
      world.setPresentationWeather('thunderstorm');
      world.update(4, 2);

      expect(buoyancySample.mock.calls.at(-1)?.[4]).toBe(profile.waveScale);
      expect(oceanUpdate.mock.calls.at(-1)?.[1]).toBe(profile.waveScale);
      expect(internals.weatherEffects.state.profile).toBe(profile);
      expect((world.scene.fog as FogExp2).density)
        .toBeCloseTo(internals.sky.palette.fogDensity * profile.fogDensityScale);
      expect(internals.ambient.intensity)
        .toBeCloseTo(internals.sky.palette.ambientLightIntensity * profile.lightIntensityScale);
      expect(internals.key.intensity)
        .toBeCloseTo(internals.sky.palette.keyLightIntensity * profile.lightIntensityScale);
      expect(internals.sky.palette.fogDensity).toBeCloseTo(0.027);
      expect(internals.sky.palette.ambientLightIntensity).toBeCloseTo(0.44);
    } finally {
      buoyancySample.mockRestore();
      oceanUpdate.mockRestore();
      world.dispose();
      propModels.dispose();
    }
  });

  it('keeps waves rougher than rain while fog remains comparatively quiet', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    );
    const buoyancySample = vi.spyOn(BoatBuoyancy.prototype, 'sampleTargetInto');
    const oceanUpdate = vi.spyOn(OceanRenderer.prototype, 'update');
    const amplitudes = new Map<string, number>();

    try {
      for (const [index, id] of (['waves', 'rain', 'fog'] as const).entries()) {
        world.setPresentationWeather(id);
        world.update(index + 1, 1 / 60);
        const buoyancyAmplitude = buoyancySample.mock.calls.at(-1)?.[4];
        const oceanAmplitude = oceanUpdate.mock.calls.at(-1)?.[1];
        expect(buoyancyAmplitude).toBe(oceanAmplitude);
        amplitudes.set(id, oceanAmplitude!);
      }

      expect(amplitudes.get('waves')).toBeGreaterThan(amplitudes.get('rain')!);
      expect(amplitudes.get('rain')).toBeGreaterThan(amplitudes.get('fog')!);
    } finally {
      buoyancySample.mockRestore();
      oceanUpdate.mockRestore();
      world.dispose();
      propModels.dispose();
    }
  });

  it('forwards event staging and keeps the cargo vessel held for natural rescue', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    );
    world.stageEvent('drifting-bottle');
    expect(world.scene.getObjectByName('event-prop:drifting-bottle')?.visible).toBe(true);
    const reveal = world.revealEvent('drifting-bottle');
    world.update(1, 1);
    await reveal;
    world.clearEvent();
    expect(world.scene.getObjectByName('event-prop:drifting-bottle')?.visible).toBe(false);

    const rescue = world.play('rescue');
    world.skipSequence();
    await rescue;
    expect(world.scene.getObjectByName('event-prop:other-people')?.visible).toBe(true);

    world.dispose();
    propModels.dispose();
  });

  it('shows a newly gained supply without allocating a model during inventory sync', () => {
    const propModels = createTestPropModels();
    const create = vi.spyOn(propModels, 'create');
    const world = new BoatWorld(
      new PerspectiveCamera(65, 4 / 3, 0.1, 100),
      propModels,
      createTestMoonTexture(),
    );
    const createdAtConstruction = create.mock.calls.length;
    const gained = savedItem('energyBar');

    world.syncInventory(snapshot([], {
      inventory: {
        [gained.instanceId]: { ...gained, condition: 'usable' as const },
      },
    }));

    expect(create).toHaveBeenCalledTimes(createdAtConstruction);
    expect(world.scene.getObjectByName('boat-supply:energyBar:copy-1')?.visible).toBe(true);
    expect(world.projectInteractionAnchors(800, 600)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'supply:energyBar',
        backingInstanceId: 'energyBar-1',
      }),
    ]));

    world.dispose();
    propModels.dispose();
  });

  it('restores an animated item group without changing its canonical copy transform', async () => {
    const item = savedItem('energyBar');
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 4 / 3, 0.1, 100),
      propModels,
      createTestMoonTexture(),
      [item],
    );
    world.syncInventory(snapshot([item]));
    const group = world.scene.getObjectByName('boat-supply:energyBar')!;
    const copy = world.scene.getObjectByName('boat-supply:energyBar:copy-1')!;
    const expected = boatSupplyTransform('energyBar', 0);
    const pending = world.playEventItemUse(item.instanceId);

    world.update(1, 1);
    await pending;

    expect(group.position.toArray()).toEqual([0, 0, 0]);
    group.rotation.toArray().slice(0, 3).forEach((value) => {
      expect(value).toBeCloseTo(0);
    });
    expect(copy.position.toArray()).toEqual(expected.position.toArray());
    expect(copy.rotation.toArray()).toEqual(expected.rotation.toArray());
    world.dispose();
    propModels.dispose();
  });

  it('uses the imported lantern model with a restrained shadow-casting light', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    );
    const lantern = world.scene.getObjectByName('survival-lantern')!;
    const model = lantern.getObjectByName('survival-lantern:model')!;
    const light = lantern.getObjectByName('survival-lantern:light') as PointLight;
    const material = firstMesh(model).material as MeshStandardMaterial;

    expect(model).toBeDefined();
    expect(firstMesh(model).castShadow).toBe(false);
    expect(material.emissive.getHex()).toBe(0xffc56a);
    expect(material.emissiveIntensity).toBe(1.35);
    expect(material.emissiveMap).toBe(material.map);
    expect(light).toBeInstanceOf(PointLight);
    expect(light.intensity).toBe(3.8);
    expect(light.distance).toBe(4);
    expect(light.castShadow).toBe(true);
    expect(world.projectInteractionAnchors(800, 600)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'end-day-lantern',
        toolId: 'lantern',
        action: 'endDay',
        itemType: null,
      }),
    ]));

    world.dispose();
    propModels.dispose();
  });

  it('places the repair toolbox on the left end of the lantern bench', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
    );
    const lantern = world.scene.getObjectByName('survival-lantern')!;
    const repairTools = world.scene.getObjectByName('repair-toolbox')!;

    expect(repairTools.position.toArray()).toEqual([-1.05, 0.225, 0.78]);
    expect(repairTools.position.x).toBe(-lantern.position.x);
    expect(repairTools.position.z).toBe(lantern.position.z);
    expect(repairTools.rotation.y).toBe(-Math.PI / 2);

    world.dispose();
    propModels.dispose();
  });

  it('continues owned geometry, material, and texture cleanup and rethrows the first error', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      propModels,
      createTestMoonTexture(),
      [savedItem('medicalKit')],
    );
    world.syncInventory(snapshot([savedItem('medicalKit')]));
    const propMesh = firstMesh(
      world.scene.getObjectByName('boat-supply:medicalKit:copy-1')!,
    );
    const lifeboatMaterials = new Set<Material>();
    collectMeshResources(
      world.scene.getObjectByName('lifeboat')!,
      new Set<BufferGeometry>(),
      lifeboatMaterials,
    );
    const textures = new Set<Texture>();
    lifeboatMaterials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value instanceof Texture) textures.add(value);
      });
    });
    const texture = textures.values().next().value!;
    expect(texture).toBeInstanceOf(Texture);
    const firstError = new Error('boat geometry disposal failed');
    const laterError = new Error('boat material disposal failed');
    const geometryDispose = vi.spyOn(propMesh.geometry, 'dispose').mockImplementation(() => {
      throw firstError;
    });
    const material = Array.isArray(propMesh.material) ? propMesh.material[0]! : propMesh.material;
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

    propModels.dispose();
  });

  it('continues every owner and camera cleanup step after early failures', () => {
    const originalParent = new Group();
    const camera = new PerspectiveCamera();
    camera.position.set(4, 5, 6);
    camera.rotation.set(0.2, -0.3, 0.1);
    originalParent.add(camera);
    const originalPosition = camera.position.clone();
    const originalQuaternion = camera.quaternion.clone();
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
      [savedItem('medicalKit')],
    );
    const internals = world as unknown as {
      ocean: { dispose(): void };
      fishingBiteParticles: { dispose(): void };
      sky: { dispose(): void };
      ownedGeometries: Set<BufferGeometry>;
      ownedMaterials: Set<Material>;
      ownedTextures: Set<Texture>;
    };
    const geometry = internals.ownedGeometries.values().next().value!;
    const material = internals.ownedMaterials.values().next().value!;
    const texture = internals.ownedTextures.values().next().value!;
    const firstError = new Error('survival ocean cleanup failed');
    const laterSkyError = new Error('survival sky cleanup failed');
    const laterCameraError = new Error('camera detach cleanup failed');
    const calls: string[] = [];
    const originalOceanDispose = internals.ocean.dispose.bind(internals.ocean);
    const oceanDispose = vi.spyOn(internals.ocean, 'dispose').mockImplementation(() => {
      calls.push('ocean');
      originalOceanDispose();
      throw firstError;
    });
    const originalFishingBiteParticlesDispose =
      internals.fishingBiteParticles.dispose.bind(internals.fishingBiteParticles);
    const fishingBiteParticlesDispose = vi.spyOn(internals.fishingBiteParticles, 'dispose')
      .mockImplementation(() => {
        calls.push('bite-particles');
        originalFishingBiteParticlesDispose();
      });
    const originalSkyDispose = internals.sky.dispose.bind(internals.sky);
    const skyDispose = vi.spyOn(internals.sky, 'dispose').mockImplementation(() => {
      calls.push('sky');
      originalSkyDispose();
      throw laterSkyError;
    });
    const originalSceneRemove = world.scene.remove.bind(world.scene);
    let ownerSceneRemoveCalls = 0;
    const sceneRemove = vi.spyOn(world.scene, 'remove')
      .mockImplementation((...objects: Object3D[]) => {
        if (objects.length > 1 && objects.some(({ name }) => name === 'boat-motion-rig')) {
          ownerSceneRemoveCalls += 1;
          calls.push('scene');
        }
        return originalSceneRemove(...objects);
      });
    const originalCameraRemove = camera.removeFromParent.bind(camera);
    let injectCameraFailure = true;
    const cameraRemove = vi.spyOn(camera, 'removeFromParent').mockImplementation(() => {
      const result = originalCameraRemove();
      if (injectCameraFailure) {
        injectCameraFailure = false;
        calls.push('camera');
        throw laterCameraError;
      }
      return result;
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
      'bite-particles',
      'sky',
      'scene',
      'camera',
      'geometry',
      'material',
      'texture',
    ]);
    expect(world.scene.children).toEqual([]);
    expect(camera.parent).toBe(originalParent);
    expect(camera.position.toArray()).toEqual(originalPosition.toArray());
    expect(camera.quaternion.toArray()).toEqual(originalQuaternion.toArray());
    expect(internals.ownedGeometries.size).toBe(0);
    expect(internals.ownedMaterials.size).toBe(0);
    expect(internals.ownedTextures.size).toBe(0);
    expect(() => world.dispose()).not.toThrow();
    [
      oceanDispose,
      fishingBiteParticlesDispose,
      skyDispose,
      geometryDispose,
      materialDispose,
      textureDispose,
    ].forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    expect(sceneRemove).toHaveBeenCalled();
    expect(ownerSceneRemoveCalls).toBe(1);
    expect(cameraRemove).toHaveBeenCalledTimes(2);

    propModels.dispose();
  });

  it('keeps broken props inspectable, hides used and lost props, and restores repaired state', () => {
    const savedItems = [savedItem('bucket'), savedItem('energyBar'), savedItem('map')];
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 4 / 3, 0.1, 100),
      propModels,
      createTestMoonTexture(),
      savedItems,
    );
    const inventory = new SurvivalInventoryState(savedItems);
    inventory.break('bucket-1');
    inventory.consumeInstance('energyBar-1');
    inventory.lose('map-1');
    world.syncInventory(snapshot(savedItems, { inventory: inventory.snapshot() }));
    expect(world.scene.getObjectByName('boat-supply:bucket')?.visible).toBe(true);
    expect(world.projectInteractionAnchors(800, 600).find(({ id }) => id === 'supply:bucket'))
      .toMatchObject({
        action: null,
        quantity: 1,
        usableQuantity: 0,
        brokenQuantity: 1,
      });
    expect(world.scene.getObjectByName('boat-supply:energyBar')?.visible).toBe(false);
    expect(world.scene.getObjectByName('boat-supply:map')?.visible).toBe(false);
    inventory.repair('bucket-1');
    world.syncInventory(snapshot(savedItems, { inventory: inventory.snapshot() }));
    expect(world.scene.getObjectByName('boat-supply:bucket')?.visible).toBe(true);
    world.dispose();
    propModels.dispose();
  });

  it('projects usable actions and hides consumed instances', () => {
    const savedItems = [
      savedItem('ductTape'),
      savedItem('baitTin'), savedItem('baitTin', 2),
      savedItem('flareGun'), savedItem('flashlight'),
    ];
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera(65, 4 / 3, 0.1, 100);
    camera.updateProjectionMatrix();
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
      savedItems,
    );
    const inventory = new SurvivalInventoryState(savedItems);
    inventory.consumeInstance('baitTin-2');

    world.syncInventory(snapshot(savedItems, { bait: 3, recoveredBait: 1, inventory: inventory.snapshot() }));
    const anchors = world.projectInteractionAnchors(800, 600);

    expect(anchors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'supply:ductTape', remainingUses: 1, quantity: 1,
      }),
      expect.objectContaining({
        id: 'supply:baitTin', remainingUses: 1, quantity: 3,
      }),
      expect.objectContaining({
        id: 'supply:flareGun', remainingUses: 1, backingInstanceId: 'flareGun-1',
      }),
      expect.objectContaining({
        id: 'supply:flashlight', remainingUses: null, backingInstanceId: 'flashlight-1',
      }),
    ]));
    world.dispose();
    propModels.dispose();
  });

  it('uses the full projected item model as its pointer target', () => {
    const savedItems = [savedItem('bucket')];
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera(65, 4 / 3, 0.1, 100);
    camera.updateProjectionMatrix();
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
      savedItems,
    );
    world.syncInventory(snapshot(savedItems));

    const bucket = world.projectInteractionAnchors(8_000, 6_000)
      .find(({ id }) => id === 'supply:bucket')!;

    expect(bucket.hitArea?.width).toBeGreaterThan(50);
    expect(bucket.hitArea?.height).toBeGreaterThan(50);
    world.dispose();
    propModels.dispose();
  });

  it('keeps projected item and tool anchors steady while riding waves', () => {
    const savedItems = [savedItem('bucket')];
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera(65, 4 / 3, 0.1, 100);
    camera.updateProjectionMatrix();
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
      savedItems,
    );
    world.syncInventory(snapshot(savedItems));
    world.update(0.5, 1 / 60);
    const settled = new Map(
      world.projectInteractionAnchors(800, 600).map((anchor) => [anchor.id, anchor]),
    );

    world.update(8, 0.5);
    const ridingWave = new Map(
      world.projectInteractionAnchors(800, 600).map((anchor) => [anchor.id, anchor]),
    );

    for (const id of [
      'supply:bucket',
      'fishing-tools',
      'repair-tools',
      'end-day-lantern',
    ]) {
      expect(ridingWave.get(id)?.x, id).toBeCloseTo(settled.get(id)!.x);
      expect(ridingWave.get(id)?.y, id).toBeCloseTo(settled.get(id)!.y);
      expect(ridingWave.get(id)?.hitArea?.width, id)
        .toBeCloseTo(settled.get(id)!.hitArea!.width);
      expect(ridingWave.get(id)?.hitArea?.height, id)
        .toBeCloseTo(settled.get(id)!.hitArea!.height);
    }

    world.dispose();
    propModels.dispose();
  });

  it('anchors the fishing line to the rod geometry tip instead of its bounds center', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      createTestMoonTexture(),
    );
    const lineOrigin = world.scene.getObjectByName('fishing-line-origin')!;

    expect(lineOrigin.position.x).toBeCloseTo(0.353055, 5);
    expect(lineOrigin.position.y).toBeCloseTo(-0.236377, 5);
    expect(lineOrigin.position.z).toBeCloseTo(0.258526, 5);

    world.dispose();
    propModels.dispose();
  });

  it('uses point particles only during the fishing bite window', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      createTestMoonTexture(),
    );
    const internals = world as unknown as {
      fishingBiteParticles: FishingBiteParticles;
    };

    expect(world.scene.getObjectByName('fishing-bubbles')).toBeUndefined();
    expect(world.scene.getObjectByName('fishing-ripples')).toBeUndefined();
    expect(world.scene.getObjectByName('scavenge-lifeboat-bow-spray')).toBeUndefined();
    expect(internals.fishingBiteParticles.activeCount()).toBe(0);

    world.showFishingBite(world.centeredFishingCast());
    expect(internals.fishingBiteParticles.activeCount()).toBeGreaterThan(0);

    world.showFishingWaiting(world.centeredFishingCast());
    expect(internals.fishingBiteParticles.activeCount()).toBe(0);

    world.dispose();
    propModels.dispose();
  });

  it('hides the bobber while reeling in a reward', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      createTestMoonTexture(),
    );
    const point = world.centeredFishingCast();
    const bobber = world.scene.getObjectByName('fishing-bobber')!;

    world.showFishingBite(point);
    expect(bobber.visible).toBe(true);

    const reel = world.playFishingReel('cod');
    await vi.waitFor(() => {
      expect(bobber.visible).toBe(false);
    });

    world.update(1, 1);
    await reel;
    expect(bobber.visible).toBe(false);
    const catchDisplay = world.scene.getObjectByName('fishing-catch-display')!;
    const catchRest = world.scene.getObjectByName('fishing-catch-bow-rest')!;
    expect(catchDisplay.visible).toBe(true);
    expect(catchDisplay.parent).toBe(catchRest);
    expect(catchDisplay.position.toArray()).toEqual([0, 0, 0]);
    expect(catchRest.position.toArray()).toEqual([0, 0.43, -2.52]);
    expect(world.scene.getObjectByName('fishing-line')?.visible).toBe(false);
    expect(world.projectFishingCatch(800, 600)).toMatchObject({ visible: true });

    world.dispose();
    propModels.dispose();
  });

  it('settles the active fishing handle and preserves bow view when presentation is cleared', async () => {
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      propModels,
      createTestMoonTexture(),
    );
    const normalPosition = camera.position.clone();
    const pending = world.playFishingCast(world.centeredFishingCast());
    const bowPosition = camera.position.clone();
    expect(bowPosition.toArray()).not.toEqual(normalPosition.toArray());

    world.clearFishingPresentation();
    await pending;

    expect(camera.position.toArray()).toEqual(bowPosition.toArray());
    for (const name of ['fishing-line', 'fishing-bobber', 'fishing-splash', 'fishing-catch-display']) {
      expect(world.scene.getObjectByName(name)?.visible).toBe(false);
    }
    let repeatEntrySettled = false;
    void world.enterFishingView().then(() => { repeatEntrySettled = true; });
    await Promise.resolve();
    expect(repeatEntrySettled).toBe(true);
    expect(camera.position.toArray()).toEqual(bowPosition.toArray());

    world.dispose();
    propModels.dispose();
  });

  it('settles dedicated fishing handles on dispose from every active stage', async () => {
    const stages: Array<(world: BoatWorld) => Promise<void> | void> = [
      (world) => world.enterFishingView(),
      (world) => world.playFishingCast(world.centeredFishingCast()),
      (world) => { world.showFishingWaiting(world.centeredFishingCast()); },
      (world) => { world.showFishingBite(world.centeredFishingCast()); },
      (world) => world.playFishingReel('cod'),
      (world) => world.playFishingMiss(),
      (world) => world.exitFishingView(),
    ];

    for (const enterStage of stages) {
      const propModels = createTestPropModels();
      const world = new BoatWorld(
        new PerspectiveCamera(65, 16 / 9, 0.08, 220),
        propModels,
        createTestMoonTexture(),
      );
      const pending = enterStage(world);
      world.dispose();
      world.dispose();
      await pending;
      propModels.dispose();
    }
  });

  it('disposes presentation and catch-library resources exactly once from every fishing stage', async () => {
    const stages: ReadonlyArray<{
      readonly name: string;
      readonly arrange: (world: BoatWorld) => Promise<void> | void;
    }> = [
      { name: 'idle', arrange: () => {} },
      { name: 'entering', arrange: (world) => { void world.enterFishingView(); } },
      {
        name: 'ready',
        arrange: (world) => {
          void world.enterFishingView();
          world.update(1, 1);
        },
      },
      { name: 'casting', arrange: (world) => { void world.playFishingCast(world.centeredFishingCast()); } },
      { name: 'waiting', arrange: (world) => { world.showFishingWaiting(world.centeredFishingCast()); } },
      { name: 'bite', arrange: (world) => { world.showFishingBite(world.centeredFishingCast()); } },
      { name: 'reeling', arrange: (world) => world.playFishingReel('cod') },
      { name: 'missing', arrange: (world) => { void world.playFishingMiss(); } },
      { name: 'returning', arrange: (world) => { void world.exitFishingView(); } },
    ];

    for (const stage of stages) {
      const propModels = createTestPropModels();
      const world = new BoatWorld(
        new PerspectiveCamera(65, 16 / 9, 0.08, 220),
        propModels,
        createTestMoonTexture(),
      );
      const internals = world as unknown as {
        fishingCatches: FishingCatchLibrary;
        fishingBiteParticles: FishingBiteParticles;
        ownedGeometries: Set<BufferGeometry>;
        ownedMaterials: Set<Material>;
      };
      const preparedCatch = await internals.fishingCatches.prepare('cod');
      expect(preparedCatch).not.toBeNull();
      const catchGeometries = new Set<BufferGeometry>();
      const catchMaterials = new Set<Material>();
      collectMeshResources(preparedCatch!, catchGeometries, catchMaterials);
      const line = world.scene.getObjectByName('fishing-line') as Line<BufferGeometry, Material>;
      const pooledMeshes = [
        firstMesh(world.scene.getObjectByName('fishing-bobber')!),
        firstMesh(world.scene.getObjectByName('fishing-splash')!),
      ];
      const biteParticleGeometry = internals.fishingBiteParticles.points.geometry;
      const biteParticleMaterial = internals.fishingBiteParticles.points.material;
      const presentationGeometries = new Set<BufferGeometry>([
        line.geometry,
        ...pooledMeshes.map(({ geometry }) => geometry),
      ]);
      const presentationMaterials = new Set<Material>([
        line.material,
        ...pooledMeshes.flatMap(({ material }) => Array.isArray(material) ? material : [material]),
      ]);
      const catchGeometry = catchGeometries.values().next().value!;
      const catchMaterial = catchMaterials.values().next().value!;

      presentationGeometries.forEach((geometry) => {
        expect(internals.ownedGeometries.has(geometry), stage.name).toBe(true);
      });
      presentationMaterials.forEach((material) => {
        expect(internals.ownedMaterials.has(material), stage.name).toBe(true);
      });
      expect(internals.ownedGeometries.has(biteParticleGeometry), stage.name).toBe(false);
      expect(internals.ownedMaterials.has(biteParticleMaterial), stage.name).toBe(false);
      expect(
        [...catchGeometries].some((geometry) => internals.ownedGeometries.has(geometry)),
        stage.name,
      ).toBe(false);
      expect(
        [...catchMaterials].some((material) => internals.ownedMaterials.has(material)),
        stage.name,
      ).toBe(false);

      const presentationDisposeSpies = [
        ...presentationGeometries,
        ...presentationMaterials,
      ].map((resource) => vi.spyOn(resource, 'dispose'));
      const catchGeometryDispose = vi.spyOn(catchGeometry, 'dispose');
      const catchMaterialDispose = vi.spyOn(catchMaterial, 'dispose');
      const biteParticleGeometryDispose = vi.spyOn(biteParticleGeometry, 'dispose');
      const biteParticleMaterialDispose = vi.spyOn(biteParticleMaterial, 'dispose');

      const pending = stage.arrange(world);
      world.dispose();
      world.dispose();
      await pending;

      presentationDisposeSpies.forEach((dispose) => {
        expect(dispose, stage.name).toHaveBeenCalledOnce();
      });
      expect(catchGeometryDispose, stage.name).toHaveBeenCalledOnce();
      expect(catchMaterialDispose, stage.name).toHaveBeenCalledOnce();
      expect(biteParticleGeometryDispose, stage.name).toHaveBeenCalledOnce();
      expect(biteParticleMaterialDispose, stage.name).toHaveBeenCalledOnce();
      propModels.dispose();
    }
  });

});

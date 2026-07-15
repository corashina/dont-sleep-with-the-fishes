import { describe, expect, it, vi } from 'vitest';
import {
  BufferAttribute,
  BufferGeometry,
  FogExp2,
  Group,
  Matrix4,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Points,
  ShaderMaterial,
  Texture,
  Vector3,
  Vector4,
} from 'three';
import {
  createItemInstances,
  type ItemId,
  type ItemInstance,
  type ItemInstanceId,
} from '../src/game/ItemState';
import { BoatWorld, clampParallax } from '../src/survival/BoatWorld';
import { boatStorageTransform } from '../src/world/BoatStorage';
import { collectMeshResources } from '../src/world/SceneResources';
import { createSurvivalInventory } from '../src/survival/inventory';
import type { SurvivalSnapshot } from '../src/survival/survivalTypes';
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
    restedToday: false,
    actedToday: false,
    journalEntries: [],
    inventory: createSurvivalInventory(savedItems),
    savedItems,
    pendingEventId: null,
    lastOutcome: null,
    seed: 8,
    ...overrides,
  };
}

describe('BoatWorld helpers', () => {
  it('moves the hull and rider rigs while preserving saved-item local transforms', () => {
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    const propModels = createTestPropModels();
    const savedItems = [savedItem('medicalKit')];
    const world = new BoatWorld(
      camera,
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      savedItems,
    );
    const motionRig = world.scene.getObjectByName('boat-motion-rig')!;
    const cameraRig = world.scene.getObjectByName('boat-camera-rig')!;
    const prop = world.scene.getObjectByName('prop:medicalKit-1')!;
    const localPosition = prop.position.clone();
    const localQuaternion = prop.quaternion.clone();

    for (let index = 1; index <= 40; index += 1) world.update(index * 0.1, 0.1);

    expect(Math.abs(motionRig.rotation.x) + Math.abs(motionRig.rotation.y) + Math.abs(motionRig.rotation.z))
      .toBeGreaterThan(0);
    expect(Math.abs(cameraRig.rotation.x) + Math.abs(cameraRig.rotation.y) + Math.abs(cameraRig.rotation.z))
      .toBeGreaterThan(0);
    expect(Math.abs(cameraRig.rotation.x)).toBeLessThanOrEqual(Math.PI / 180);
    expect(Math.abs(cameraRig.rotation.z)).toBeLessThanOrEqual(Math.PI / 180);
    expect(prop.position.toArray()).toEqual(localPosition.toArray());
    expect(prop.quaternion.toArray()).toEqual(localQuaternion.toArray());
    world.dispose();
    propModels.dispose();
  });

  it('keeps reduced-motion rigs and secondary cues neutral', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: true } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      [savedItem('fishingRod')],
    );
    const line = world.scene.getObjectByName('fishing-line')!;
    const authoredLineRotation = line.rotation.clone();
    const ocean = world.scene.getObjectByName('procedural-ocean') as Mesh;
    const oceanUniforms = (ocean.material as ShaderMaterial).uniforms;
    const initialOceanTime = oceanUniforms.uTime!.value as number;
    world.play('fish');
    world.update(4, 0.2);
    const motionRig = world.scene.getObjectByName('boat-motion-rig')!;
    const cameraRig = world.scene.getObjectByName('boat-camera-rig')!;
    const spray = world.scene.getObjectByName('survival-bow-spray') as Points;

    expect(motionRig.position.y).toBeCloseTo(0.22);
    expect(motionRig.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(cameraRig.position.toArray()).toEqual([0, 0, 0]);
    expect(cameraRig.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(line.visible).toBe(true);
    expect(line.rotation.toArray()).toEqual(authoredLineRotation.toArray());
    expect(oceanUniforms.uTime!.value).toBeGreaterThan(initialOceanTime);
    expect(oceanUniforms.uTime!.value).toBe(4);
    const sprayPositions = (
      spray.geometry.getAttribute('position') as BufferAttribute
    ).array as Float32Array;
    for (let index = 1; index < sprayPositions.length; index += 3) {
      expect(sprayPositions[index]).toBe(-1000);
    }
    world.dispose();
    propModels.dispose();
  });

  it('keeps projected controls finite throughout the calm motion envelope', async () => {
    const propModels = await loadProductionPropModels();
    const savedItems = createItemInstances();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      savedItems,
    );

    for (let index = 1; index <= 80; index += 1) {
      world.update(index * 0.1, 0.1);
      const anchors = world.projectInteractionAnchors(1280, 720);
      const itemAnchors = anchors.filter(({ itemType }) => itemType !== null);
      expect(itemAnchors).toHaveLength(savedItems.length);
      expect(itemAnchors.every(({ visible, x, y }) =>
        visible && Number.isFinite(x) && Number.isFinite(y)
        && x >= 0 && x <= 1280 && y >= 0 && y <= 720,
      )).toBe(true);
    }
    world.dispose();
    propModels.dispose();
  });

  it('applies fishing-line lag after the fishing cue makes the line visible', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      [savedItem('fishingRod')],
    );
    const line = world.scene.getObjectByName('fishing-line')!;
    const authoredRotation = line.rotation.clone();
    world.play('fish');
    for (let index = 1; index <= 8; index += 1) world.update(index * 0.1, 0.1);
    expect(line.visible).toBe(true);
    expect(
      Math.abs(line.rotation.x - authoredRotation.x)
      + Math.abs(line.rotation.z - authoredRotation.z),
    ).toBeGreaterThan(0);
    world.dispose();
    propModels.dispose();
  });

  it('clamps mouse parallax and disables it for reduced motion', () => {
    expect(clampParallax(2, -2, false)).toEqual({ yaw: 0.045, pitch: -0.025 });
    expect(clampParallax(0.4, -0.4, true)).toEqual({ yaw: 0, pitch: 0 });
  });

  it('frames the enlarged boat from the higher stern seat without changing FOV', () => {
    const camera = new PerspectiveCamera(65, 16 / 9, 0.1, 100);
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      [],
    );
    expect(camera.position.toArray()).toEqual([0, 0.88, 2.35]);
    expect(camera.fov).toBe(65);
    expect(world.scene.getObjectByName('lifeboat-hull-geometry')).toBeDefined();
    expect(world.scene.getObjectByName('paddle-port')).toBeDefined();
    expect(world.scene.getObjectByName('paddle-starboard')).toBeDefined();
    world.dispose();
    propModels.dispose();
  });

  it('transitions sky, fog, lights, and ocean to squall night together', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      [],
    );
    world.setWeather('squall');
    world.setPhase('night');
    world.update(0.75, 0.75);
    world.update(1.5, 0.75);

    const sky = world.scene.getObjectByName('procedural-skybox') as Mesh;
    const ocean = world.scene.getObjectByName('procedural-ocean') as Mesh;
    const skyUniforms = (sky.material as ShaderMaterial).uniforms;
    const oceanUniforms = (ocean.material as ShaderMaterial).uniforms;
    expect(skyUniforms.uSunVisibility!.value).toBe(0);
    expect(skyUniforms.uMoonVisibility!.value).toBeCloseTo(0.07);
    expect(skyUniforms.uStarVisibility!.value).toBeCloseTo(0.02);
    expect((world.scene.fog as FogExp2).density).toBeCloseTo(0.034);
    expect(oceanUniforms.uHorizonColor!.value).toEqual(skyUniforms.uHorizonColor!.value);
    expect(oceanUniforms.uSkyColor!.value).toEqual(skyUniforms.uZenithColor!.value);
    world.dispose();
    propModels.dispose();
  });

  it('tints the procedural sky during the dive cue and clears the tint afterward', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      [],
    );
    const sequence = world.play('dive');
    world.update(0.7, 0.7);
    const sky = world.scene.getObjectByName('procedural-skybox') as Mesh;
    const uniforms = (sky.material as ShaderMaterial).uniforms;
    expect(uniforms.uTintAmount!.value).toBeGreaterThan(0);
    world.update(1.4, 0.7);
    await sequence;
    world.update(1.5, 0.1);
    expect(uniforms.uTintAmount!.value).toBe(0);
    world.dispose();
    propModels.dispose();
  });

  it('disposes the survival sky once', () => {
    const propModels = createTestPropModels();
    const moonTexture = createTestMoonTexture();
    const moonTextureDispose = vi.spyOn(moonTexture, 'dispose');
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      moonTexture,
    );
    const sky = world.scene.getObjectByName('procedural-skybox') as Mesh;
    const geometryDispose = vi.spyOn(sky.geometry, 'dispose');
    const materialDispose = vi.spyOn(sky.material as ShaderMaterial, 'dispose');
    expect((sky.material as ShaderMaterial).uniforms.uMoonMap!.value).toBe(moonTexture);
    world.dispose();
    world.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(moonTextureDispose).not.toHaveBeenCalled();
    propModels.dispose();
  });

  it('disposes owned survival resources once', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      [savedItem('medicalKit')],
    );
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    collectMeshResources(world.scene, geometries, materials);
    const spray = world.scene.getObjectByName('survival-bow-spray') as Points;
    geometries.add(spray.geometry);
    materials.add(spray.material as Material);
    const textures = new Set<Texture>();
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value instanceof Texture) textures.add(value);
      });
    });
    const spies = [
      ...[...geometries].map((resource) => vi.spyOn(resource, 'dispose')),
      ...[...materials].map((resource) => vi.spyOn(resource, 'dispose')),
      ...[...textures].map((resource) => vi.spyOn(resource, 'dispose')),
    ];

    world.dispose();
    world.dispose();

    spies.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
    propModels.dispose();
  });

  it('continues owned geometry, material, and texture cleanup and rethrows the first error', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      [savedItem('medicalKit')],
    );
    const propMesh = firstMesh(world.scene.getObjectByName('prop:medicalKit-1')!);
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
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      [savedItem('medicalKit')],
    );
    const internals = world as unknown as {
      ocean: { dispose(): void };
      spray: { dispose(): void };
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
    const originalSprayDispose = internals.spray.dispose.bind(internals.spray);
    const sprayDispose = vi.spyOn(internals.spray, 'dispose').mockImplementation(() => {
      calls.push('spray');
      originalSprayDispose();
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
      'spray',
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
      sprayDispose,
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

  it('keeps all maximum-inventory item anchor centers at least 40 pixels apart', async () => {
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    camera.updateProjectionMatrix();
    const propModels = await loadProductionPropModels();
    let world: BoatWorld | undefined;
    try {
      world = new BoatWorld(
        camera,
        { matches: false } as MediaQueryList,
        propModels,
        createTestMoonTexture(),
        createItemInstances(),
      );
      const anchors = world.projectInteractionAnchors(1280, 720)
        .filter((anchor) => anchor.itemType !== null && anchor.visible);
      expect(anchors).toHaveLength(14);
      for (let first = 0; first < anchors.length; first += 1) {
        for (let second = first + 1; second < anchors.length; second += 1) {
          const distance = Math.hypot(
            anchors[first]!.x - anchors[second]!.x,
            anchors[first]!.y - anchors[second]!.y,
          );
          expect(distance, `${anchors[first]!.id} is too close to ${anchors[second]!.id}`)
            .toBeGreaterThanOrEqual(40);
        }
      }
    } finally {
      world?.dispose();
      propModels.dispose();
    }
  });

  it('keeps every visible actionable anchor clear of fixed repair and horizon anchors', async () => {
    const propModels = await loadProductionPropModels();
    let world: BoatWorld | undefined;
    try {
      world = new BoatWorld(
        new PerspectiveCamera(65, 16 / 9, 0.08, 220),
        { matches: false } as MediaQueryList,
        propModels,
        createTestMoonTexture(),
        createItemInstances(),
      );
      const actionable = world.projectInteractionAnchors(1280, 720)
        .filter((anchor) => anchor.visible && anchor.action !== null);
      expect(actionable).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'repair-patch', action: 'repair' }),
        expect.objectContaining({ id: 'horizon', action: 'endDay' }),
      ]));
      for (let first = 0; first < actionable.length; first += 1) {
        for (let second = first + 1; second < actionable.length; second += 1) {
          const distance = Math.hypot(
            actionable[first]!.x - actionable[second]!.x,
            actionable[first]!.y - actionable[second]!.y,
          );
          expect(distance, `${actionable[first]!.id} is too close to ${actionable[second]!.id}`)
            .toBeGreaterThanOrEqual(40);
        }
      }
    } finally {
      world?.dispose();
      propModels.dispose();
    }
  });

  it('keeps the shared camera at a fixed height for reduced motion', () => {
    const camera = new PerspectiveCamera();
    const reducedMotion = { matches: true } as unknown as MediaQueryList;
    const propModels = createTestPropModels();
    const world = new BoatWorld(camera, reducedMotion, propModels, createTestMoonTexture());
    const before = camera.getWorldPosition(new Vector3()).y;

    world.update(1, 0.1);
    const after = camera.getWorldPosition(new Vector3()).y;
    world.dispose();
    propModels.dispose();

    expect(after).toBe(before);
  });

  it('uploads one exclusion from the motion-rig lifeboat world transform', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
    );

    world.update(1.5, 0.1);

    const boat = world.scene.getObjectByName('lifeboat')!;
    const ocean = world.scene.getObjectByName('procedural-ocean') as Mesh;
    const uniforms = (ocean.material as ShaderMaterial).uniforms;
    const matrices = uniforms.uExclusionWorldToLocal!.value as Matrix4[];
    const bounds = uniforms.uExclusionBounds!.value as Vector4[];
    expect(uniforms.uExclusionCount!.value).toBe(1);
    expect(bounds[0]!.toArray()).toEqual([-1.6, 1.6, -3.04, 3.04]);
    expect(matrices[0]!.elements).toEqual(boat.matrixWorld.clone().invert().elements);
    expect(matrices[1]).toEqual(new Matrix4());
    expect(bounds[1]).toEqual(new Vector4());
    world.dispose();
    propModels.dispose();
  });

  it('builds every saved instance once at its stable type-aware transform', () => {
    const savedItems = [
      savedItem('cannedFood', 3),
      savedItem('fishingRod'),
      savedItem('ductTape', 2),
      savedItem('scubaSet'),
    ];
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      savedItems,
    );
    const storage = world.scene.getObjectByName('lifeboat-storage')!;

    expect(storage.children.map(({ name }) => name)).toEqual([
      'prop:cannedFood-3',
      'prop:fishingRod-1',
      'prop:ductTape-2',
      'prop:scubaSet-1',
    ]);
    storage.children.forEach((prop, index) => {
      const transform = boatStorageTransform(savedItems[index]!);
      expect(prop.position.toArray()).toEqual(transform.position.toArray());
      expect(prop.rotation.toArray().slice(0, 3)).toEqual(transform.rotation.toArray().slice(0, 3));
      expect(prop.scale.toArray()).toEqual([transform.scale, transform.scale, transform.scale]);
      expectTestModelTransform(prop);
    });
    world.dispose();
    propModels.dispose();
  });

  it('synchronizes recovered food, bait, and inventory charges without loose gains refilling props', () => {
    const savedItems = [
      savedItem('cannedFood'),
      savedItem('cannedFood', 2),
      savedItem('baitTin'),
      savedItem('baitTin', 2),
      savedItem('ductTape'),
      savedItem('ductTape', 2),
    ];
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      savedItems,
    );
    const inventory = createSurvivalInventory(savedItems);
    inventory.ductTape.charges = 1;

    world.syncInventory(snapshot(savedItems, {
      food: 1,
      bait: 1,
      recoveredFood: 1,
      recoveredBait: 1,
      inventory,
    }));

    const foodOne = world.scene.getObjectByName('prop:cannedFood-1')!;
    const foodTwo = world.scene.getObjectByName('prop:cannedFood-2')!;
    const baitOne = world.scene.getObjectByName('prop:baitTin-1')!;
    const baitTwo = world.scene.getObjectByName('prop:baitTin-2')!;
    const tapeOne = world.scene.getObjectByName('prop:ductTape-1')!;
    const tapeTwo = world.scene.getObjectByName('prop:ductTape-2')!;
    const tapeOneMaterial = firstMesh(tapeOne).material as MeshStandardMaterial;
    const tapeTwoMaterial = firstMesh(tapeTwo).material as MeshStandardMaterial;
    const tapeOriginalColor = tapeOneMaterial.color.getHex();
    expect([foodOne.visible, foodTwo.visible]).toEqual([true, false]);
    expect([foodOne.userData.depleted, foodTwo.userData.depleted]).toEqual([false, true]);
    expect([baitOne.visible, baitTwo.visible]).toEqual([true, true]);
    expect([baitOne.userData.depleted, baitTwo.userData.depleted]).toEqual([false, true]);
    expect([tapeOne.userData.depleted, tapeTwo.userData.depleted]).toEqual([false, true]);
    expect(tapeOneMaterial).not.toBe(tapeTwoMaterial);
    expect(tapeOneMaterial.color.getHex()).toBe(tapeOriginalColor);
    expect(tapeTwoMaterial.color.getHex()).not.toBe(tapeOriginalColor);

    inventory.ductTape.charges = 4;
    world.syncInventory(snapshot(savedItems, {
      food: 2,
      bait: 6,
      recoveredFood: 1,
      recoveredBait: 1,
      inventory,
    }));
    expect(foodTwo.visible).toBe(false);
    expect(foodTwo.userData.depleted).toBe(true);
    expect(baitTwo.userData.depleted).toBe(true);
    expect(tapeTwo.userData.depleted).toBe(false);
    expect(tapeOneMaterial.color.getHex()).toBe(tapeOriginalColor);
    expect(tapeTwoMaterial.color.getHex()).toBe(tapeOriginalColor);
    world.dispose();
    propModels.dispose();
  });

  it('highlights only the selected instance and restores depleted presentation', () => {
    const savedItems = [savedItem('ductTape'), savedItem('ductTape', 2)];
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      savedItems,
    );
    const inventory = createSurvivalInventory(savedItems);
    inventory.ductTape.charges = 1;
    world.syncInventory(snapshot(savedItems, { inventory }));

    const first = world.scene.getObjectByName('prop:ductTape-1')!;
    const second = world.scene.getObjectByName('prop:ductTape-2')!;
    const firstMaterial = firstMesh(first).material as MeshStandardMaterial;
    const secondMaterial = firstMesh(second).material as MeshStandardMaterial;
    const firstEmissive = firstMaterial.emissive.getHex();
    const secondEmissive = secondMaterial.emissive.getHex();
    const depletedColor = secondMaterial.color.getHex();

    world.setHighlightedItem('ductTape-2');
    expect(secondMaterial.emissive.getHex()).not.toBe(secondEmissive);
    expect(firstMaterial.emissive.getHex()).toBe(firstEmissive);

    world.setHighlightedItem(null);
    expect(secondMaterial.emissive.getHex()).toBe(secondEmissive);
    expect(secondMaterial.color.getHex()).toBe(depletedColor);

    world.setHighlightedItem('missing-instance');
    expect(firstMaterial.emissive.getHex()).toBe(firstEmissive);
    expect(secondMaterial.emissive.getHex()).toBe(secondEmissive);
    world.dispose();
    propModels.dispose();
  });

  it('projects saved props plus fixed repair and horizon anchors', () => {
    const savedItems = [savedItem('fishingRod'), savedItem('flareGun')];
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera(65, 4 / 3, 0.1, 100);
    camera.updateProjectionMatrix();
    const world = new BoatWorld(
      camera,
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      savedItems,
    );

    const anchors = world.projectInteractionAnchors(800, 600);

    expect(anchors).toHaveLength(savedItems.length + 2);
    expect(anchors).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'fishingRod-1', itemType: 'fishingRod', action: 'fish' }),
      expect.objectContaining({ id: 'flareGun-1', itemType: 'flareGun', action: null }),
      expect.objectContaining({ id: 'repair-patch', itemType: null, action: 'repair' }),
      expect.objectContaining({ id: 'horizon', itemType: null, action: 'endDay', visible: true }),
    ]));
    expect(anchors.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    const itemAnchor = anchors.find(({ id }) => id === 'fishingRod-1')!;
    const fixedAnchor = anchors.find(({ id }) => id === 'horizon')!;
    expect(itemAnchor.hitArea).toEqual({
      width: expect.any(Number),
      height: expect.any(Number),
      depth: expect.any(Number),
    });
    expect(itemAnchor.hitArea!.width).toBeGreaterThanOrEqual(44);
    expect(itemAnchor.hitArea!.height).toBeGreaterThanOrEqual(44);
    expect(fixedAnchor.hitArea).toBeUndefined();
    world.dispose();
    propModels.dispose();
  });

  it('projects per-instance remaining uses for duplicate and contextual supplies', () => {
    const savedItems = [
      savedItem('ductTape'), savedItem('ductTape', 2),
      savedItem('baitTin'), savedItem('baitTin', 2),
      savedItem('flareGun'), savedItem('flashlight'),
    ];
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera(65, 4 / 3, 0.1, 100);
    camera.updateProjectionMatrix();
    const world = new BoatWorld(
      camera,
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      savedItems,
    );
    const inventory = createSurvivalInventory(savedItems);
    inventory.ductTape.charges = 1;
    inventory.flareGun.charges = 1;

    world.syncInventory(snapshot(savedItems, { bait: 3, recoveredBait: 3, inventory }));
    const anchors = world.projectInteractionAnchors(800, 600);

    expect(anchors).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'ductTape-1', remainingUses: 1, depleted: false }),
      expect.objectContaining({ id: 'ductTape-2', remainingUses: 0, depleted: true }),
      expect.objectContaining({ id: 'baitTin-1', remainingUses: 3, depleted: false }),
      expect.objectContaining({ id: 'baitTin-2', remainingUses: 0, depleted: true }),
      expect.objectContaining({ id: 'flareGun-1', remainingUses: 1, depleted: false }),
      expect.objectContaining({ id: 'flashlight-1', remainingUses: null, depleted: false }),
    ]));
    world.dispose();
    propModels.dispose();
  });

  it('animates fishing cues from the recovered rod and has no hand-line fallback', () => {
    const propModels = createTestPropModels();
    const rodWorld = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      [savedItem('fishingRod'), savedItem('scubaSet')],
    );
    const rod = rodWorld.scene.getObjectByName('prop:fishingRod-1')!;
    const before = rod.rotation.z;
    rodWorld.play('fish');
    rodWorld.update(0.7, 0.7);
    expect(rod.rotation.z).toBeLessThan(before);
    expect(rodWorld.scene.getObjectByName('fishing-line')?.visible).toBe(true);
    expect(rodWorld.scene.getObjectByName('fishing-catch')?.visible).toBe(true);
    rodWorld.dispose();

    const emptyWorld = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      [],
    );
    emptyWorld.play('fish');
    emptyWorld.update(0.7, 0.7);
    expect(emptyWorld.scene.getObjectByName('fishing-line')?.visible).toBe(false);
    expect(emptyWorld.scene.getObjectByName('fishing-catch')?.visible).toBe(false);
    emptyWorld.dispose();
    propModels.dispose();
  });

  it('resets transient cues after they finish', async () => {
    const camera = new PerspectiveCamera();
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      [],
    );
    const sequence = world.play('rest');
    world.update(0.8, 0.8);
    await sequence;
    expect(world.presentationCueForTest()).toBeNull();
    world.dispose();
    propModels.dispose();
  });

});

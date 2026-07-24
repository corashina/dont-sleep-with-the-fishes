import { describe, expect, it, vi } from 'vitest';
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  FogExp2,
  Group,
  Line,
  MathUtils,
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
import { BoatBuoyancy, smoothBoatPose } from '../src/ocean/BoatBuoyancy';
import { DEFAULT_WAVES, sampleWaveField } from '../src/ocean/WaveField';
import { UNBOUNDED_MINIMUM_LOCAL_Y } from '../src/ocean/WaterExclusion';
import { BoatWorld } from '../src/survival/BoatWorld';
import { FishingCatchLibrary } from '../src/survival/FishingCatchLibrary';
import { FISHING_CATCHES } from '../src/survival/fishingCatalog';
import { boatStorageTransform } from '../src/world/BoatStorage';
import { projectBoatBounds } from '../src/survival/BoatInteraction';
import { collectMeshResources } from '../src/world/SceneResources';
import { SurvivalInventoryState } from '../src/survival/inventory';
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
  it('matches scavenging buoyancy for the boat, player viewpoint, and saved items', () => {
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      [savedItem('medicalKit')],
    );
    const motionRig = world.scene.getObjectByName('boat-motion-rig')!;
    const cameraRig = world.scene.getObjectByName('boat-camera-rig')!;
    world.syncInventory(snapshot([savedItem('medicalKit')]));
    const prop = world.scene.getObjectByName('boat-supply:medicalKit')!;
    const localPosition = prop.position.clone();
    const localQuaternion = prop.quaternion.clone();
    const initialPropWorldPosition = prop.getWorldPosition(new Vector3());
    const time = 1.5;
    const delta = 0.1;
    const expected = expectedSurvivalPose(time, delta, 0.78);

    world.update(time, delta);

    expect(motionRig.position.x).toBeCloseTo(expected.driftX);
    expect(motionRig.position.y).toBeCloseTo(0.22 + expected.y);
    expect(motionRig.position.z).toBeCloseTo(expected.driftZ);
    expect(motionRig.rotation.x).toBeCloseTo(expected.pitch);
    expect(motionRig.rotation.y).toBe(0);
    expect(motionRig.rotation.z).toBeCloseTo(-expected.roll);
    expect(cameraRig.position.toArray()).toEqual([0, 0, 0]);
    expect(cameraRig.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(camera.getWorldPosition(new Vector3()).toArray()).toEqual(
      motionRig.localToWorld(camera.position.clone()).toArray(),
    );
    expect(prop.position.toArray()).toEqual(localPosition.toArray());
    expect(prop.quaternion.toArray()).toEqual(localQuaternion.toArray());
    expect(prop.getWorldPosition(new Vector3()).toArray()).not.toEqual(initialPropWorldPosition.toArray());
    world.dispose();
    propModels.dispose();
  });

  it('keeps reduced-motion secondary cues neutral while the hull floats', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: true } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      [],
    );
    const line = world.scene.getObjectByName('fishing-line')!;
    const authoredLineRotation = line.rotation.clone();
    const ocean = world.scene.getObjectByName('procedural-ocean') as Mesh;
    const oceanUniforms = (ocean.material as ShaderMaterial).uniforms;
    const initialOceanTime = oceanUniforms.uTime!.value as number;
    const time = 4;
    const delta = 0.2;
    const expected = expectedSurvivalPose(time, delta, 0.78);
    world.play('fish');
    world.update(time, delta);
    const motionRig = world.scene.getObjectByName('boat-motion-rig')!;
    const cameraRig = world.scene.getObjectByName('boat-camera-rig')!;
    const spray = world.scene.getObjectByName('survival-bow-spray') as Points;

    expect(motionRig.position.x).toBeCloseTo(expected.driftX);
    expect(motionRig.position.y).toBeCloseTo(0.22 + expected.y);
    expect(motionRig.position.z).toBeCloseTo(expected.driftZ);
    expect(motionRig.rotation.x).toBeCloseTo(expected.pitch);
    expect(motionRig.rotation.y).toBe(0);
    expect(motionRig.rotation.z).toBeCloseTo(-expected.roll);
    expect(cameraRig.position.toArray()).toEqual([0, 0, 0]);
    expect(cameraRig.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(line.visible).toBe(false);
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

  it('preserves stronger squall heave with scavenging buoyancy', () => {
    const propModels = createTestPropModels();
    const calm = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      [],
    );
    const squall = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      [],
    );
    squall.setWeather('squall');

    calm.update(1.5, 0.1);
    squall.update(1.5, 0.1);

    const calmRig = calm.scene.getObjectByName('boat-motion-rig')!;
    const squallRig = squall.scene.getObjectByName('boat-motion-rig')!;
    const calmExpected = expectedSurvivalPose(1.5, 0.1, 0.78);
    const squallExpected = expectedSurvivalPose(1.5, 0.1, 1.35);
    expect(calmRig.position.y).toBeCloseTo(0.22 + calmExpected.y);
    expect(squallRig.position.y).toBeCloseTo(0.22 + squallExpected.y);
    expect(Math.abs(squallRig.position.y - 0.22))
      .toBeGreaterThan(Math.abs(calmRig.position.y - 0.22));

    calm.dispose();
    squall.dispose();
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
    world.syncInventory(snapshot(savedItems, { food: 3, bait: 2 }));

    for (let index = 1; index <= 80; index += 1) {
      world.update(index * 0.1, 0.1);
      const anchors = world.projectInteractionAnchors(1280, 720);
      const itemAnchors = anchors.filter(({ itemType }) => itemType !== null);
      expect(itemAnchors).toHaveLength(18);
      expect(itemAnchors.every(({ visible, x, y }) =>
        visible && Number.isFinite(x) && Number.isFinite(y)
        && x >= 0 && x <= 1280 && y >= 0 && y <= 720,
      )).toBe(true);
    }
    world.dispose();
    propModels.dispose();
  });


  it('keeps the survival camera locked to its authored base view', () => {
    const camera = new PerspectiveCamera();
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
    );
    const base = camera.quaternion.clone();
    expect(world).not.toHaveProperty('setPointer');
    for (let index = 1; index <= 12; index += 1) {
      world.update(index * 0.1, 0.1);
      expect(Math.abs(camera.quaternion.dot(base))).toBeCloseTo(1, 8);
    }
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
    const sky = world.scene.getObjectByName('procedural-skybox') as Mesh;
    const ocean = world.scene.getObjectByName('procedural-ocean') as Mesh;
    const skyUniforms = (sky.material as ShaderMaterial).uniforms;
    const oceanUniforms = (ocean.material as ShaderMaterial).uniforms;
    expect(oceanUniforms.uDirectLightStrength?.value).toBe(
      skyUniforms.uSunVisibility!.value,
    );

    world.setWeather('squall');
    world.setPhase('night');
    world.update(0.75, 0.75);
    world.update(1.5, 0.75);

    expect(skyUniforms.uSunVisibility!.value).toBe(0);
    expect(oceanUniforms.uDirectLightStrength?.value).toBe(
      skyUniforms.uSunVisibility!.value,
    );
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
      world.syncInventory(snapshot(createItemInstances(), { food: 3, bait: 2 }));
      const anchors = world.projectInteractionAnchors(1280, 720)
        .filter((anchor) => anchor.itemType !== null && anchor.visible);
      expect(anchors).toHaveLength(18);
      const tooClose: string[] = [];
      let minimumSpacing = Number.POSITIVE_INFINITY;
      for (let first = 0; first < anchors.length; first += 1) {
        for (let second = first + 1; second < anchors.length; second += 1) {
          const distance = Math.hypot(
            anchors[first]!.x - anchors[second]!.x,
            anchors[first]!.y - anchors[second]!.y,
          );
          minimumSpacing = Math.min(minimumSpacing, distance);
          if (distance < 40) {
            tooClose.push(
              `${anchors[first]!.id}(${anchors[first]!.x.toFixed(1)},${anchors[first]!.y.toFixed(1)})/`
              + `${anchors[second]!.id}(${anchors[second]!.x.toFixed(1)},${anchors[second]!.y.toFixed(1)}): ${distance.toFixed(2)}px`,
            );
          }
        }
      }
      expect(tooClose).toEqual([]);
      expect(minimumSpacing).toBeGreaterThanOrEqual(40);
    } finally {
      world?.dispose();
      propModels.dispose();
    }
  });

  it('keeps every visible actionable anchor clear of the repair tools', async () => {
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
      world.syncInventory(snapshot(createItemInstances(), { food: 3, bait: 2 }));
      const actionable = world.projectInteractionAnchors(1280, 720)
        .filter((anchor) => anchor.visible && anchor.action !== null);
      expect(actionable).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'repair-tools', action: 'repair' }),
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

  it('moves the shared camera with buoyant reduced motion', () => {
    const camera = new PerspectiveCamera();
    const reducedMotion = { matches: true } as unknown as MediaQueryList;
    const propModels = createTestPropModels();
    const world = new BoatWorld(camera, reducedMotion, propModels, createTestMoonTexture());
    const motionRig = world.scene.getObjectByName('boat-motion-rig')!;
    const initialWorldPosition = camera.getWorldPosition(new Vector3());

    world.update(1, 0.1);

    expect(camera.getWorldPosition(new Vector3()).toArray()).toEqual(
      motionRig.localToWorld(camera.position.clone()).toArray(),
    );
    expect(camera.getWorldPosition(new Vector3()).toArray()).not.toEqual(initialWorldPosition.toArray());
    world.dispose();
    propModels.dispose();
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
    const taperStarts = uniforms.uExclusionTaperStarts!.value as number[];
    const minimumLocalYs = uniforms.uExclusionMinimumLocalYs!.value as number[];
    expect(uniforms.uExclusionCount!.value).toBe(1);
    expect(bounds[0]!.toArray()).toEqual([-1.6, 1.6, -3.04, 3.04]);
    expect(taperStarts).toEqual([1.05, 0]);
    expect(minimumLocalYs).toEqual([-0.38, UNBOUNDED_MINIMUM_LOCAL_Y]);
    expect(matrices[0]!.elements).toEqual(boat.matrixWorld.clone().invert().elements);
    expect(matrices[1]).toEqual(new Matrix4());
    expect(bounds[1]).toEqual(new Vector4());
    world.dispose();
    propModels.dispose();
  });

  it('builds every saved instance once at its stable type-aware transform', () => {
    const savedItems = [
      savedItem('cannedFood', 3),
      savedItem('harpoonGun'),
      savedItem('ductTape'),
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

    expect(storage.children).toHaveLength(19);
    expect(storage.getObjectByName('boat-supply:cannedFood:copy-1')).toBeDefined();
    expect(storage.getObjectByName('boat-supply:harpoonGun:copy-1')).toBeDefined();
    expect(storage.getObjectByName('boat-supply:ductTape:copy-1')).toBeDefined();
    expect(storage.getObjectByName('boat-supply:scubaSet:copy-1')).toBeDefined();
    expectTestModelTransform(storage.getObjectByName('boat-supply:harpoonGun:copy-1')!);
    world.dispose();
    propModels.dispose();
  });

  it('keeps every grouped supply position on the single forward platform', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      createItemInstances(),
    );
    const platform = world.scene.getObjectByName('survival-supply-platform')!;
    const platformBounds = new Box3().setFromObject(platform, true);
    const storage = world.scene.getObjectByName('lifeboat-storage')!;

    expect(platform.children.filter(({ name }) => name.includes('-slat-'))).toHaveLength(9);
    for (const group of storage.children) {
      const worldPosition = group.getWorldPosition(new Vector3());
      expect(worldPosition.x, group.name).toBeGreaterThanOrEqual(platformBounds.min.x);
      expect(worldPosition.x, group.name).toBeLessThanOrEqual(platformBounds.max.x);
      expect(worldPosition.z, group.name).toBeGreaterThanOrEqual(platformBounds.min.z);
      expect(worldPosition.z, group.name).toBeLessThanOrEqual(platformBounds.max.z);
    }

    world.dispose();
    propModels.dispose();
  });

  it('synchronizes exact per-instance conditions without loose gains refilling props', () => {
    const savedItems = [
      savedItem('cannedFood'),
      savedItem('cannedFood', 2),
      savedItem('baitTin'),
      savedItem('baitTin', 2),
      savedItem('bucket'),
    ];
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      savedItems,
    );
    const inventory = new SurvivalInventoryState(savedItems);
    inventory.consumeInstance('cannedFood-2');
    inventory.consumeInstance('baitTin-2');
    inventory.break('bucket-1');

    world.syncInventory(snapshot(savedItems, {
      food: 1,
      bait: 1,
      recoveredFood: 1,
      recoveredBait: 1,
      inventory: inventory.snapshot(),
    }));

    const foodOne = world.scene.getObjectByName('boat-supply:cannedFood:copy-1')!;
    const foodTwo = world.scene.getObjectByName('boat-supply:cannedFood:copy-2')!;
    const baitOne = world.scene.getObjectByName('boat-supply:baitTin:copy-1')!;
    const baitTwo = world.scene.getObjectByName('boat-supply:baitTin:copy-2')!;
    const bucket = world.scene.getObjectByName('boat-supply:bucket:copy-1')!;
    const brokenMaterial = firstMesh(bucket).material as MeshStandardMaterial;
    expect([foodOne.visible, foodTwo.visible]).toEqual([true, false]);
    expect([baitOne.visible, baitTwo.visible]).toEqual([true, false]);
    expect(bucket.visible).toBe(true);
    inventory.repair('bucket-1');
    world.syncInventory(snapshot(savedItems, {
      food: 2,
      bait: 6,
      recoveredFood: 1,
      recoveredBait: 1,
      inventory: inventory.snapshot(),
    }));
    expect(foodTwo.visible).toBe(true);
    expect([
      baitOne.visible,
      baitTwo.visible,
      world.scene.getObjectByName('boat-supply:baitTin:copy-3')!.visible,
    ]).toEqual([true, true, true]);
    expect(firstMesh(bucket).material).not.toBe(brokenMaterial);
    world.dispose();
    propModels.dispose();
  });

  it('highlights only the selected visible instance and restores broken presentation', () => {
    const savedItems = [savedItem('bucket'), savedItem('map')];
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      savedItems,
    );
    const inventory = new SurvivalInventoryState(savedItems);
    inventory.break('bucket-1');
    world.syncInventory(snapshot(savedItems, { inventory: inventory.snapshot() }));

    const first = world.scene.getObjectByName('boat-supply:map:copy-1')!;
    const second = world.scene.getObjectByName('boat-supply:bucket:copy-1')!;
    const firstMaterial = firstMesh(first).material as MeshStandardMaterial;
    const secondMaterial = firstMesh(second).material as MeshStandardMaterial;
    const firstEmissive = firstMaterial.emissive.getHex();
    const secondEmissive = secondMaterial.emissive.getHex();
    const depletedColor = secondMaterial.color.getHex();

    world.setHighlightedItem('bucket-1');
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

  it('mutes event props, restores eligible color, and animates the exact selected instance', async () => {
    const savedItems = [savedItem('cannedFood'), savedItem('cannedFood', 2)];
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      savedItems,
    );
    world.syncInventory(snapshot(savedItems, { food: 2 }));
    const group = world.scene.getObjectByName('boat-supply:cannedFood')!;
    const first = world.scene.getObjectByName('boat-supply:cannedFood:copy-1')!;
    const second = world.scene.getObjectByName('boat-supply:cannedFood:copy-2')!;
    const normalFirstColor = (firstMesh(first).material as MeshStandardMaterial).color.getHex();
    const normalSecondColor = (firstMesh(second).material as MeshStandardMaterial).color.getHex();

    world.setEventEligibleItems(new Set());
    expect((firstMesh(first).material as MeshStandardMaterial).color.getHex()).not.toBe(normalFirstColor);
    expect((firstMesh(second).material as MeshStandardMaterial).color.getHex()).not.toBe(normalSecondColor);

    world.setEventEligibleItems(new Set(['cannedFood-2']));
    expect((firstMesh(first).material as MeshStandardMaterial).color.getHex()).toBe(normalFirstColor);
    expect((firstMesh(second).material as MeshStandardMaterial).color.getHex()).toBe(normalSecondColor);
    const firstEmissive = (firstMesh(first).material as MeshStandardMaterial).emissive.getHex();
    world.setHighlightedItem('cannedFood-1');
    expect((firstMesh(first).material as MeshStandardMaterial).emissive.getHex())
      .not.toBe(firstEmissive);

    const groupStart = group.position.clone();
    const use = world.playEventItemUse('cannedFood-2');
    world.update(.3, .3);
    expect(group.position.y).toBeGreaterThan(groupStart.y);
    world.update(1, 1);
    await use;
    expect(group.position).toEqual(groupStart);

    world.setEventEligibleItems(null);
    expect((firstMesh(first).material as MeshStandardMaterial).color.getHex()).toBe(normalFirstColor);
    world.dispose();
    propModels.dispose();
  });

  it('settles missing and reduced-motion event item use without leaving a transform', async () => {
    const savedItems = [savedItem('bucket')];
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: true } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      savedItems,
    );
    world.syncInventory(snapshot(savedItems));
    const prop = world.scene.getObjectByName('boat-supply:bucket')!;
    const start = prop.position.clone();
    await world.playEventItemUse('bucket-2');
    const use = world.playEventItemUse('bucket-1');
    world.update(.01, .01);
    await use;
    expect(prop.position).toEqual(start);
    world.dispose();
    propModels.dispose();
  });

  it('projects saved props plus fixed fishing and repair tool anchors', () => {
    const savedItems = [savedItem('flareGun')];
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
    world.syncInventory(snapshot(savedItems));

    const anchors = world.projectInteractionAnchors(800, 600);

    expect(world.scene.getObjectByName('lifeboat-equipment:fishingRod')).toBeDefined();
    expect(anchors).toHaveLength(savedItems.length + 2);
    expect(anchors).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'fishing-tools', itemType: null, toolId: 'fishingRod', action: 'fish' }),
      expect.objectContaining({
        id: 'supply:flareGun',
        itemType: 'flareGun',
        quantity: 1,
        backingInstanceId: 'flareGun-1',
      }),
      expect.objectContaining({ id: 'repair-tools', itemType: null, toolId: 'repairTools', action: 'repair' }),
    ]));
    expect(anchors.some(({ id }) => id === 'horizon' || id === 'rest')).toBe(false);
    expect(anchors.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    const itemAnchor = anchors.find(({ id }) => id === 'fishing-tools')!;
    const repair = anchors.find(({ id }) => id === 'repair-tools')!;
    expect(itemAnchor.hitArea).toEqual({
      width: expect.any(Number),
      height: expect.any(Number),
      depth: expect.any(Number),
    });
    expect(itemAnchor.hitArea!.width).toBeGreaterThanOrEqual(44);
    expect(itemAnchor.hitArea!.height).toBeGreaterThanOrEqual(44);
    expect(repair.hitArea).toEqual({
      width: expect.any(Number),
      height: expect.any(Number),
      depth: expect.any(Number),
    });
    expect(repair.hitArea!.width).toBeGreaterThanOrEqual(44);
    expect(repair.hitArea!.height).toBeGreaterThanOrEqual(44);
    world.dispose();
    propModels.dispose();
  });

  it('publishes one food anchor with exact quantity and three visible copies', () => {
    const savedItems = [
      savedItem('cannedFood'),
      savedItem('cannedFood', 2),
      savedItem('cannedFood', 3),
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
    world.syncInventory(snapshot(savedItems, { food: 5 }));

    const food = world.projectInteractionAnchors(800, 600)
      .filter(({ itemType }) => itemType === 'cannedFood');
    expect(food).toHaveLength(1);
    expect(food[0]).toMatchObject({
      id: 'supply:cannedFood',
      quantity: 5,
      usableQuantity: 5,
      brokenQuantity: 0,
      backingInstanceId: 'cannedFood-1',
    });
    expect(world.scene.getObjectByName('boat-supply:cannedFood')?.children
      .filter(({ visible }) => visible)).toHaveLength(3);
    world.dispose();
    propModels.dispose();
  });

  it('owns the fixed fishing rod and fish action anchor with no saved items', () => {
    const propModels = createTestPropModels();
    const camera = new PerspectiveCamera(65, 4 / 3, 0.1, 100);
    camera.updateProjectionMatrix();
    const world = new BoatWorld(
      camera,
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      [],
    );

    expect(world.scene.getObjectByName('lifeboat-equipment:fishingRod')).toBeDefined();
    expect(world.projectInteractionAnchors(800, 600)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'fishing-tools', itemType: null, toolId: 'fishingRod', action: 'fish',
      }),
    ]));
    world.dispose();
    propModels.dispose();
  });

  it('authors the fishing rod forward from a named bow pivot', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 4 / 3, 0.1, 100),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
    );

    const pivot = world.scene.getObjectByName('fishing-rod-pivot')!;
    const rod = world.scene.getObjectByName('lifeboat-equipment:fishingRod')!;
    const tip = world.scene.getObjectByName('fishing-line-origin')!;
    expect(pivot.position.x).toBe(0);
    expect(pivot.position.z).toBeLessThan(-2);
    expect(pivot.rotation.x).toBeCloseTo(MathUtils.degToRad(-22), 8);
    expect(tip.parent).toBe(rod);
    expect(tip.position.toArray().every(Number.isFinite)).toBe(true);
    const tipWorld = tip.getWorldPosition(new Vector3());
    expect(new Box3().setFromObject(rod).containsPoint(tipWorld)).toBe(true);
    expect(tipWorld.z)
      .toBeLessThan(pivot.getWorldPosition(new Vector3()).z);
    world.dispose();
    propModels.dispose();
  });

  it('keeps broken props inspectable, hides used and lost props, and restores repaired state', () => {
    const savedItems = [savedItem('bucket'), savedItem('energyBar'), savedItem('map')];
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 4 / 3, 0.1, 100),
      { matches: false } as MediaQueryList,
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
      { matches: false } as MediaQueryList,
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

  it('acknowledges generic fish cues from the fixed rod without starting minigame visuals', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
      [],
    );
    const pivot = world.scene.getObjectByName('fishing-rod-pivot')!;
    const before = pivot.rotation.x;
    world.play('fish');
    world.update(0.7, 0.7);
    expect(pivot.rotation.x).toBeLessThan(before);
    expect(world.scene.getObjectByName('fishing-line')?.visible).toBe(false);
    expect(world.scene.getObjectByName('fishing-catch-display')?.visible).toBe(false);
    world.dispose();
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
    const sequence = world.play('treat');
    world.update(0.8, 0.8);
    await sequence;
    expect(world.presentationCueForTest()).toBeNull();
    world.dispose();
    propModels.dispose();
  });

  it('reuses one project-authored catch template per family with authored appearance', () => {
    const library = new FishingCatchLibrary();
    const templates = new Map<string, Object3D>();
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    const boundsByCatch = new Map<string, Vector3>();

    for (const definition of FISHING_CATCHES) {
      const prepared = library.prepare(definition.id);
      expect(prepared.userData.fishingFamily).toBe(definition.family);
      const familyTemplate = templates.get(definition.family);
      if (familyTemplate) expect(prepared).toBe(familyTemplate);
      else templates.set(definition.family, prepared);

      prepared.updateMatrixWorld(true);
      boundsByCatch.set(
        definition.id,
        new Box3().setFromObject(prepared, true).getSize(new Vector3()),
      );
      prepared.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        geometries.add(object.geometry);
        const assigned = Array.isArray(object.material) ? object.material : [object.material];
        assigned.forEach((material) => materials.add(material));
      });
      const body = prepared.getObjectByName(`fishing-catch:${definition.family}:body`) as Mesh;
      expect((body.material as MeshStandardMaterial).color.getHex())
        .toBe(definition.appearance.color);
    }

    expect(templates.size).toBe(8);
    expect(boundsByCatch.get('tuna')!.toArray())
      .not.toEqual(boundsByCatch.get('sardine')!.toArray());
    const resourceCounts = [geometries.size, materials.size];
    library.prepare('cod');
    library.prepare('salmon');
    expect([geometries.size, materials.size]).toEqual(resourceCounts);

    const disposeSpies = [
      ...geometries,
      ...materials,
    ].map((resource) => vi.spyOn(resource, 'dispose'));
    library.dispose();
    library.dispose();
    disposeSpies.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });

  it('moves to the authored bow camera pose and returns exactly through explicit updates', async () => {
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
    );
    const normalPosition = camera.position.clone();
    const normalQuaternion = camera.quaternion.clone();

    const entering = world.enterFishingView();
    expect(camera.position.toArray()).toEqual(normalPosition.toArray());
    world.update(0.016, 0.016);
    expect(camera.position.distanceTo(normalPosition)).toBeLessThan(0.1);
    world.update(0.55, 0.534);
    const midpoint = camera.position.clone();
    world.update(1.1, 0.55);
    await entering;
    const bowPosition = camera.position.clone();
    const bowQuaternion = camera.quaternion.clone();
    expect(midpoint.distanceTo(normalPosition)).toBeGreaterThan(0.1);
    expect(midpoint.distanceTo(camera.position)).toBeGreaterThan(0.1);
    expect(camera.position.toArray()).toEqual([0, 1.38, -0.72]);
    expect(Math.abs(bowQuaternion.dot(normalQuaternion))).toBeLessThan(0.9999);

    const returning = world.exitFishingView();
    world.update(2.2, 1.1);
    await returning;
    expect(camera.position.toArray()).toEqual(normalPosition.toArray());
    expect(camera.quaternion.toArray()).toEqual(normalQuaternion.toArray());
    world.dispose();
    propModels.dispose();
  });

  it('uses stable camera endpoints and minimal fishing motion when reduced motion is active', async () => {
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      { matches: true } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
    );
    const normalPosition = camera.position.clone();
    const pivot = world.scene.getObjectByName('fishing-rod-pivot')!;
    const baseRodRotation = pivot.rotation.x;
    const entering = world.enterFishingView();
    expect(camera.position.toArray()).not.toEqual(normalPosition.toArray());
    world.update(0.01, 0.01);
    await entering;

    const casting = world.playFishingCast(world.centeredFishingCast());
    world.update(0.02, 0.01);
    expect(Math.abs(pivot.rotation.x - baseRodRotation)).toBeLessThan(0.12);
    await casting;

    const returning = world.exitFishingView();
    expect(camera.position.toArray()).toEqual(normalPosition.toArray());
    world.update(0.03, 0.01);
    await returning;
    world.dispose();
    propModels.dispose();
  });

  it('runs staggered fading bubble loops without growing the pool', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
    );
    world.showFishingBite(world.centeredFishingCast());
    const bubbles = world.scene.getObjectByName('fishing-bubbles')!;
    const poolSize = bubbles.children.length;

    world.update(1, 0.1);
    const first = bubbles.children.map((bubble) => {
      const material = (bubble as Mesh).material as MeshStandardMaterial;
      return {
        opacity: material.opacity,
        position: bubble.position.toArray(),
        scale: bubble.scale.x,
      };
    });
    world.update(1.45, 0.45);
    const second = bubbles.children.map((bubble) => {
      const material = (bubble as Mesh).material as MeshStandardMaterial;
      return {
        opacity: material.opacity,
        position: bubble.position.toArray(),
        scale: bubble.scale.x,
      };
    });

    expect(bubbles.children).toHaveLength(poolSize);
    expect(new Set(first.map(({ opacity }) => opacity)).size).toBeGreaterThan(1);
    expect(second).not.toEqual(first);
    expect(second.every(({ opacity }) => opacity >= 0 && opacity <= 0.72)).toBe(true);
    world.dispose();
    propModels.dispose();
  });

  it('anchors the production fishing line at the local forward tip through every visible phase', async () => {
    const propModels = await loadProductionPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
    );
    const pivot = world.scene.getObjectByName('fishing-rod-pivot')!;
    const rod = world.scene.getObjectByName('lifeboat-equipment:fishingRod')!;
    const tip = world.scene.getObjectByName('fishing-line-origin')!;
    const line = world.scene.getObjectByName('fishing-line') as Line<BufferGeometry>;
    const rodBounds = boundsRelativeTo(rod);
    const centerX = (rodBounds.min.x + rodBounds.max.x) / 2;
    const centerY = (rodBounds.min.y + rodBounds.max.y) / 2;

    expect(tip.position.x).toBeCloseTo(centerX, 8);
    expect(tip.position.y).toBeCloseTo(centerY, 8);
    expect(tip.position.z).toBeCloseTo(rodBounds.max.z, 8);

    const expectForwardPose = () => {
      const handleWorld = rod.localToWorld(new Vector3(centerX, centerY, rodBounds.min.z));
      const tipWorld = tip.getWorldPosition(new Vector3());
      expect(pivot.rotation.x).toBeCloseTo(MathUtils.degToRad(-22), 8);
      expect(tipWorld.z).toBeLessThan(handleWorld.z);
    };
    const expectLineAtTip = () => {
      const origin = tip.getWorldPosition(new Vector3());
      const positions = line.geometry.getAttribute('position') as BufferAttribute;
      expect(positions.getX(0)).toBeCloseTo(origin.x, 6);
      expect(positions.getY(0)).toBeCloseTo(origin.y, 6);
      expect(positions.getZ(0)).toBeCloseTo(origin.z, 6);
    };
    const point = world.centeredFishingCast();

    const cast = world.playFishingCast(point);
    world.update(0.000001, 0.000001);
    expectLineAtTip();
    world.update(0.801, 0.800999);
    await cast;
    expectForwardPose();
    expectLineAtTip();

    world.showFishingWaiting(point);
    world.update(0.9, 0.099);
    expectForwardPose();
    expectLineAtTip();

    world.showFishingBite(point);
    world.update(1, 0.1);
    expectForwardPose();
    expectLineAtTip();

    const reel = world.playFishingReel('cod');
    world.update(1.5, 0.5);
    expectLineAtTip();
    world.update(2, 0.5);
    await reel;
    expectForwardPose();
    expectLineAtTip();

    world.showFishingBite(point);
    const miss = world.playFishingMiss();
    world.update(2.4, 0.4);
    expectLineAtTip();
    world.update(2.8, 0.4);
    await miss;
    expectForwardPose();
    expectLineAtTip();

    world.clearFishingPresentation();
    expect(line.visible).toBe(false);
    expectForwardPose();
    world.dispose();
    propModels.dispose();
  });

  it('keeps reduced-motion bite pools visible without continuous oscillation', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      { matches: true } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
    );
    world.showFishingBite(world.centeredFishingCast());
    const bobber = world.scene.getObjectByName('fishing-bobber')!;
    const bubbles = world.scene.getObjectByName('fishing-bubbles')!;
    const ripples = world.scene.getObjectByName('fishing-ripples')!;

    world.update(1, 0.1);
    const first = bubbles.children.map((bubble) => ({
      position: bubble.position.toArray(),
      scale: bubble.scale.toArray(),
      opacity: ((bubble as Mesh).material as MeshStandardMaterial).opacity,
    }));
    const rippleScales = ripples.children.map(({ scale }) => scale.toArray());
    world.update(4, 0.1);
    const second = bubbles.children.map((bubble) => ({
      position: bubble.position.toArray(),
      scale: bubble.scale.toArray(),
      opacity: ((bubble as Mesh).material as MeshStandardMaterial).opacity,
    }));

    expect(bobber.visible).toBe(true);
    expect(bubbles.visible).toBe(true);
    expect(ripples.visible).toBe(true);
    expect(second).toEqual(first);
    expect(first.every(({ opacity }) => opacity > 0 && opacity < 0.68)).toBe(true);
    expect(ripples.children.map(({ scale }) => scale.toArray())).toEqual(rippleScales);
    world.dispose();
    propModels.dispose();
  });

  it('raycasts only the bounded authored fishing water and exposes an immutable center cast', async () => {
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    camera.updateProjectionMatrix();
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
    );
    const entering = world.enterFishingView();
    world.update(1.1, 1.1);
    await entering;

    expect(world.castFishingAtScreenPoint(-1, 360, 1280, 720)).toBeNull();
    expect(world.castFishingAtScreenPoint(1281, 360, 1280, 720)).toBeNull();
    expect(world.castFishingAtScreenPoint(0, 0, 1280, 720)).toBeNull();
    const cast = world.castFishingAtScreenPoint(640, 360, 1280, 720);
    expect(cast).toEqual({ x: expect.any(Number), z: expect.any(Number) });
    expect(Object.isFrozen(cast)).toBe(true);
    const centered = world.centeredFishingCast();
    expect(centered).toEqual({ x: expect.any(Number), z: expect.any(Number) });
    expect(Object.isFrozen(centered)).toBe(true);
    expect(() => world.playFishingCast(centered)).not.toThrow();
    world.dispose();
    propModels.dispose();
  });

  it('accepts the inclusive authored cast edges and rejects epsilon-outside points', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
    );
    const accepted = [
      { x: -2.7, z: -6.4 },
      { x: 2.7, z: -6.4 },
      { x: 0, z: -8.5 },
      { x: 0, z: -4.8 },
    ] as const;
    for (const point of accepted) {
      expect(() => world.playFishingCast(point)).not.toThrow();
      world.clearFishingPresentation();
    }

    const epsilon = 1e-9;
    const rejected = [
      { x: -2.7 - epsilon, z: -6.4 },
      { x: 2.7 + epsilon, z: -6.4 },
      { x: 0, z: -8.5 - epsilon },
      { x: 0, z: -4.8 + epsilon },
    ] as const;
    for (const point of rejected) {
      expect(() => world.playFishingCast(point)).toThrow(RangeError);
    }
    world.dispose();
    propModels.dispose();
  });

  it.each([
    [1280, 720],
    [1024, 768],
  ])('keeps the centered fishing target over open water at %ix%i', async (width, height) => {
    const camera = new PerspectiveCamera(65, width / height, 0.08, 220);
    camera.updateProjectionMatrix();
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
    );

    const entering = world.enterFishingView();
    world.update(1.1, 1.1);
    await entering;
    expect(camera.position.y).toBeGreaterThan(1.22);
    expect(camera.position.z).toBeGreaterThan(-1.62);

    const centered = world.centeredFishingCast();
    expect(centered).toEqual({ x: 0, z: -6.4 });
    world.showFishingBite(centered);
    world.update(1.2, 0.1);
    const target = world.projectFishingBite(width, height);
    const bow = world.scene.getObjectByName('hull-bow-rounded-cap')!;
    const bowBounds = projectBoatBounds(
      new Box3().setFromObject(bow, true),
      camera,
      width,
      height,
    );
    expect(target.visible).toBe(true);
    expect(bowBounds.visible).toBe(true);
    expect(target.y + target.height / 2)
      .toBeLessThan(bowBounds.y);

    world.dispose();
    propModels.dispose();
  });

  it('stages the cast through the rod pivot, bobber arc, and landing splash', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
    );
    const pivot = world.scene.getObjectByName('fishing-rod-pivot')!;
    const line = world.scene.getObjectByName('fishing-line')!;
    const bobber = world.scene.getObjectByName('fishing-bobber')!;
    const splash = world.scene.getObjectByName('fishing-splash')!;
    const bubbles = world.scene.getObjectByName('fishing-bubbles')!;
    const ripples = world.scene.getObjectByName('fishing-ripples')!;
    const poolSizes = [bubbles.children.length, ripples.children.length];
    const baseRodRotation = pivot.rotation.x;
    const point = world.centeredFishingCast();
    let finished = false;

    const cast = world.playFishingCast(point)
      .then(() => { finished = true; });
    expect(finished).toBe(false);
    expect(line.visible).toBe(true);
    world.update(0.2, 0.2);
    const quarterPosition = bobber.position.clone();
    expect(pivot.rotation.x).not.toBe(baseRodRotation);
    expect(bobber.visible).toBe(true);
    expect(splash.visible).toBe(false);
    expect(finished).toBe(false);
    world.update(0.4, 0.2);
    const midpoint = bobber.position.clone();
    expect(splash.visible).toBe(false);
    world.update(0.74, 0.34);
    expect(splash.visible).toBe(true);
    const landingWaveHeight = sampleWaveField(
      DEFAULT_WAVES,
      0.74,
      point.x,
      point.z,
      0.78,
    ).height;
    expect(splash.position.x).toBeCloseTo(point.x, 8);
    expect(splash.position.y).toBeCloseTo(landingWaveHeight, 8);
    expect(splash.position.z).toBeCloseTo(point.z, 8);
    world.update(0.8, 0.06);
    const landingPosition = bobber.position.clone();
    await cast;
    expect(midpoint.y).toBeGreaterThan(quarterPosition.y);
    expect(midpoint.y).toBeGreaterThan(landingPosition.y);
    expect(splash.visible).toBe(true);
    world.update(0.93, 0.13);
    expect(splash.visible).toBe(false);
    expect([bubbles.children.length, ripples.children.length]).toEqual(poolSizes);
    world.dispose();
    propModels.dispose();
  });

  it('renders the landing splash when a coarse frame completes the cast', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
    );
    const splash = world.scene.getObjectByName('fishing-splash')!;
    const cast = world.playFishingCast(world.centeredFishingCast());

    world.update(0.8, 0.8);
    await cast;

    expect(splash.visible).toBe(true);
    world.update(0.93, 0.13);
    expect(splash.visible).toBe(false);
    world.dispose();
    propModels.dispose();
  });

  it('starts the cast endpoint at the rod tip and interpolates toward the shared wave', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
    );
    const point = world.centeredFishingCast();
    const lineOrigin = world.scene.getObjectByName('fishing-line-origin')!;
    const line = world.scene.getObjectByName('fishing-line') as Line<BufferGeometry>;
    const bobber = world.scene.getObjectByName('fishing-bobber')!;
    const castOriginY = lineOrigin.getWorldPosition(new Vector3()).y;
    const cast = world.playFishingCast(point);

    world.update(0.000001, 0.000001);
    const origin = lineOrigin.getWorldPosition(new Vector3());
    const positions = line.geometry.getAttribute('position') as BufferAttribute;
    expect(positions.getX(0)).toBeCloseTo(origin.x, 6);
    expect(positions.getY(0)).toBeCloseTo(origin.y, 6);
    expect(positions.getZ(0)).toBeCloseTo(origin.z, 6);
    expect(bobber.position.y).toBeCloseTo(castOriginY, 4);
    expect(positions.getY(4))
      .toBeCloseTo(castOriginY, 4);

    world.update(0.08, 0.079999);
    const progress = 0.1 ** 2 * (3 - 2 * 0.1);
    const waveHeight = sampleWaveField(DEFAULT_WAVES, 0.08, point.x, point.z, 0.78).height;
    const expectedY = castOriginY
      + (waveHeight + 0.075 - castOriginY) * progress
      + Math.sin(Math.PI * progress) * 1.35;
    expect(bobber.position.y).toBeCloseTo(expectedY, 8);

    world.update(0.801, 0.721);
    await cast;
    world.dispose();
    propModels.dispose();
  });

  it('keeps bobber, splash, bubbles, ripples, and bite projection on the shared wave sample', () => {
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    camera.updateProjectionMatrix();
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
    );
    const point = world.centeredFishingCast();
    world.showFishingWaiting(point);
    world.showFishingBite(point);
    const time = 2.4;
    world.update(time, 0.1);
    const expectedHeight = sampleWaveField(DEFAULT_WAVES, time, point.x, point.z, 0.78).height;
    for (const name of ['fishing-bobber', 'fishing-splash', 'fishing-bubbles', 'fishing-ripples']) {
      const object = world.scene.getObjectByName(name)!;
      expect(object.position.x).toBeCloseTo(point.x, 8);
      expect(object.position.y).toBeCloseTo(expectedHeight, 8);
      expect(object.position.z).toBeCloseTo(point.z, 8);
    }
    const projected = new Vector3(point.x, expectedHeight, point.z).project(camera);
    expect(world.projectFishingBite(1280, 720)).toMatchObject({
      x: expect.closeTo((projected.x * 0.5 + 0.5) * 1280, 5),
      y: expect.closeTo((-projected.y * 0.5 + 0.5) * 720, 5),
      visible: true,
    });
    world.dispose();
    propModels.dispose();
  });

  it('keeps reel and miss results at the bow until explicit exit restores the exact camera', async () => {
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
    );
    const normalPosition = camera.position.clone();
    const normalQuaternion = camera.quaternion.clone();
    const point = world.centeredFishingCast();
    const entering = world.enterFishingView();
    world.update(0.55, 0.55);
    world.update(1.1, 0.55);
    await entering;
    const bowPosition = camera.position.clone();
    const bowQuaternion = camera.quaternion.clone();
    expect(bowPosition.toArray()).not.toEqual(normalPosition.toArray());

    world.showFishingBite(point);
    const catchDisplay = world.scene.getObjectByName('fishing-catch-display')!;
    const fishingLine = world.scene.getObjectByName('fishing-line') as Line<BufferGeometry>;
    const castPosition = catchDisplay.position.clone();
    const lineOrigin = world.scene.getObjectByName('fishing-line-origin')!;
    const lineOriginWorld = lineOrigin.getWorldPosition(new Vector3());
    const reel = world.playFishingReel('cod');
    world.update(1.5, 0.5);
    expect(catchDisplay.visible).toBe(true);
    expect(catchDisplay.position.y).toBeGreaterThan(castPosition.y);
    expect(Math.abs(catchDisplay.position.z - lineOriginWorld.z))
      .toBeLessThan(Math.abs(castPosition.z - lineOriginWorld.z));
    world.update(2, 0.5);
    await reel;
    expect(world.scene.getObjectByName('fishing-line')?.visible).toBe(true);
    expect(world.scene.getObjectByName('fishing-bobber')?.visible).toBe(true);
    expect(world.scene.getObjectByName('fishing-catch-display')?.visible).toBe(true);
    expect(catchDisplay.position.z).not.toBe(castPosition.z);
    const completedLinePositions = fishingLine.geometry.getAttribute('position') as BufferAttribute;
    expect(completedLinePositions.getX(4)).toBeCloseTo(catchDisplay.position.x, 6);
    expect(completedLinePositions.getY(4)).toBeCloseTo(catchDisplay.position.y, 6);
    expect(completedLinePositions.getZ(4)).toBeCloseTo(catchDisplay.position.z, 6);
    world.update(2.1, 0.1);
    expect(completedLinePositions.getX(4)).toBeCloseTo(catchDisplay.position.x, 6);
    expect(completedLinePositions.getY(4)).toBeCloseTo(catchDisplay.position.y, 6);
    expect(completedLinePositions.getZ(4)).toBeCloseTo(catchDisplay.position.z, 6);
    expect(world.scene.getObjectByName('fishing-bubbles')?.visible).toBe(false);
    expect(world.scene.getObjectByName('fishing-ripples')?.visible).toBe(false);
    expect(camera.position.toArray()).toEqual(bowPosition.toArray());
    expect(camera.quaternion.toArray()).toEqual(bowQuaternion.toArray());

    world.showFishingBite(point);
    const miss = world.playFishingMiss();
    world.update(2.5, 0.5);
    world.update(3, 0.5);
    await miss;
    expect(world.scene.getObjectByName('fishing-line')?.visible).toBe(true);
    expect(world.scene.getObjectByName('fishing-bobber')?.visible).toBe(true);
    expect(world.scene.getObjectByName('fishing-catch-display')?.visible).toBe(false);
    expect(camera.position.toArray()).toEqual(bowPosition.toArray());
    expect(camera.quaternion.toArray()).toEqual(bowQuaternion.toArray());

    const returning = world.exitFishingView();
    for (const name of ['fishing-line', 'fishing-bobber', 'fishing-bubbles', 'fishing-ripples', 'fishing-catch-display']) {
      expect(world.scene.getObjectByName(name)?.visible).toBe(false);
    }
    world.update(3.55, 0.55);
    world.update(4.1, 0.55);
    await returning;
    expect(camera.position.toArray()).toEqual(normalPosition.toArray());
    expect(camera.quaternion.toArray()).toEqual(normalQuaternion.toArray());
    world.dispose();
    propModels.dispose();
  });

  it('renders reduced-motion catch and miss results for a frame without timers before explicit clear', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      { matches: true } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
    );
    const timer = vi.spyOn(globalThis, 'setTimeout');
    const point = world.centeredFishingCast();

    try {
      world.showFishingBite(point);
      const reel = world.playFishingReel('cod');
      world.update(1 / 60, 1 / 60);
      const catchFrame = {
        line: world.scene.getObjectByName('fishing-line')?.visible,
        bobber: world.scene.getObjectByName('fishing-bobber')?.visible,
        catch: world.scene.getObjectByName('fishing-catch-display')?.visible,
      };
      await reel;

      expect(catchFrame).toEqual({ line: true, bobber: true, catch: true });
      expect(world.scene.getObjectByName('fishing-catch-display')?.visible).toBe(true);
      const returning = world.exitFishingView();
      expect(world.scene.getObjectByName('fishing-catch-display')?.visible).toBe(false);
      world.update(2 / 60, 1 / 60);
      await returning;

      world.showFishingBite(point);
      const miss = world.playFishingMiss();
      world.update(3 / 60, 1 / 60);
      const missFrame = {
        line: world.scene.getObjectByName('fishing-line')?.visible,
        bobber: world.scene.getObjectByName('fishing-bobber')?.visible,
        catch: world.scene.getObjectByName('fishing-catch-display')?.visible,
      };
      await miss;

      expect(missFrame).toEqual({ line: true, bobber: true, catch: false });
      world.clearFishingPresentation();
      expect(world.scene.getObjectByName('fishing-line')?.visible).toBe(false);
      expect(world.scene.getObjectByName('fishing-bobber')?.visible).toBe(false);
      expect(timer).not.toHaveBeenCalled();
    } finally {
      timer.mockRestore();
      world.dispose();
      propModels.dispose();
    }
  });

  it('settles active fishing handles when a new command supersedes them', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      { matches: false } as MediaQueryList,
      propModels,
      createTestMoonTexture(),
    );
    let enteringSettled = false;
    const entering = world.enterFishingView().then(() => { enteringSettled = true; });
    let castingSettled = false;
    const casting = world.playFishingCast(world.centeredFishingCast())
      .then(() => { castingSettled = true; });

    await entering;
    expect(enteringSettled).toBe(true);
    expect(castingSettled).toBe(false);

    const reeling = world.playFishingReel('cod');
    await casting;
    expect(castingSettled).toBe(true);
    world.update(1, 1);
    await reeling;
    world.dispose();
    propModels.dispose();
  });

  it('settles the active fishing handle and preserves bow view when presentation is cleared', async () => {
    const camera = new PerspectiveCamera(65, 16 / 9, 0.08, 220);
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      camera,
      { matches: false } as MediaQueryList,
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
    for (const name of ['fishing-line', 'fishing-bobber', 'fishing-splash', 'fishing-bubbles', 'fishing-ripples', 'fishing-catch-display']) {
      expect(world.scene.getObjectByName(name)?.visible).toBe(false);
    }
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
        { matches: false } as MediaQueryList,
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

  it('disposes presentation and catch-library resources exactly once from every fishing stage', () => {
    const stages: ReadonlyArray<{
      readonly name: string;
      readonly arrange: (world: BoatWorld) => void;
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
      { name: 'reeling', arrange: (world) => { void world.playFishingReel('cod'); } },
      { name: 'missing', arrange: (world) => { void world.playFishingMiss(); } },
      { name: 'returning', arrange: (world) => { void world.exitFishingView(); } },
    ];

    for (const stage of stages) {
      const propModels = createTestPropModels();
      const world = new BoatWorld(
        new PerspectiveCamera(65, 16 / 9, 0.08, 220),
        { matches: false } as MediaQueryList,
        propModels,
        createTestMoonTexture(),
      );
      const internals = world as unknown as {
        fishingCatches: FishingCatchLibrary;
        ownedGeometries: Set<BufferGeometry>;
        ownedMaterials: Set<Material>;
      };
      internals.fishingCatches.prepare('cod');
      const catchInternals = internals.fishingCatches as unknown as {
        geometries: Set<BufferGeometry>;
        materials: Set<Material>;
      };
      const line = world.scene.getObjectByName('fishing-line') as Line<BufferGeometry, Material>;
      const pooledMeshes = [
        firstMesh(world.scene.getObjectByName('fishing-bobber')!),
        firstMesh(world.scene.getObjectByName('fishing-splash')!),
        ...(world.scene.getObjectByName('fishing-bubbles')!.children as Mesh[]),
        firstMesh(world.scene.getObjectByName('fishing-ripples')!),
      ];
      const presentationGeometries = new Set<BufferGeometry>([
        line.geometry,
        ...pooledMeshes.map(({ geometry }) => geometry),
      ]);
      const presentationMaterials = new Set<Material>([
        line.material,
        ...pooledMeshes.flatMap(({ material }) => Array.isArray(material) ? material : [material]),
      ]);
      const catchGeometry = catchInternals.geometries.values().next().value!;
      const catchMaterial = catchInternals.materials.values().next().value!;

      presentationGeometries.forEach((geometry) => {
        expect(internals.ownedGeometries.has(geometry), stage.name).toBe(true);
      });
      presentationMaterials.forEach((material) => {
        expect(internals.ownedMaterials.has(material), stage.name).toBe(true);
      });
      expect(
        [...catchInternals.geometries].some((geometry) => internals.ownedGeometries.has(geometry)),
        stage.name,
      ).toBe(false);
      expect(
        [...catchInternals.materials].some((material) => internals.ownedMaterials.has(material)),
        stage.name,
      ).toBe(false);

      const presentationDisposeSpies = [
        ...presentationGeometries,
        ...presentationMaterials,
      ].map((resource) => vi.spyOn(resource, 'dispose'));
      const catchGeometryDispose = vi.spyOn(catchGeometry, 'dispose');
      const catchMaterialDispose = vi.spyOn(catchMaterial, 'dispose');

      stage.arrange(world);
      world.dispose();
      world.dispose();

      presentationDisposeSpies.forEach((dispose) => {
        expect(dispose, stage.name).toHaveBeenCalledOnce();
      });
      expect(catchGeometryDispose, stage.name).toHaveBeenCalledOnce();
      expect(catchMaterialDispose, stage.name).toHaveBeenCalledOnce();
      propModels.dispose();
    }
  });

});

import { describe, expect, it } from 'vitest';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Points,
  Quaternion,
  Scene,
  ShaderMaterial,
  Vector3,
  Vector4,
} from 'three';
import { createItemInstances, ITEM_IDS, type ItemInstance } from '../src/game/ItemState';
import { getSinkingState, type SinkingState } from '../src/game/sinking';
import { BoatBuoyancy, smoothBoatPose } from '../src/ocean/BoatBuoyancy';
import { OceanRenderer } from '../src/ocean/OceanRenderer';
import { pointInWaterExclusion } from '../src/ocean/WaterExclusion';
import { DEFAULT_WAVES, sampleWaveField } from '../src/ocean/WaveField';
import { boatStorageTransform } from '../src/world/BoatStorage';
import { createLifeboat } from '../src/world/Lifeboat';
import { createProp } from '../src/world/PropFactory';
import { createShip } from '../src/world/Ship';
import { assignShipItems } from '../src/world/ShipItemPlacement';
import { World } from '../src/world/World';
import {
  createTestPropModels,
  TEST_PROP_MODEL_TRANSFORM,
  testPropModel,
} from './helpers/propModels';

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

describe('world builders', () => {
  it('removes and disposes the ship when construction fails during item assignment', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const oversizedInventory = Array.from({ length: 40 }, (_, index): ItemInstance => ({
      instanceId: `waterJug-${index + 1}` as ItemInstance['instanceId'],
      type: 'waterJug',
    }));

    expect(() => new World(scene, propModels, oversizedInventory, () => 0.4))
      .toThrow('Unable to place ship item');
    expect(scene.getObjectByName('sinking-ship')).toBeUndefined();
    propModels.dispose();
  });

  it('assembles one object for every supply instance and exposes gameplay markers', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const world = new World(scene, propModels, createItemInstances());
    expect(world.itemObjects.size).toBe(14);
    expect(world.colliders.length).toBeGreaterThanOrEqual(10);
    expect(scene.getObjectByName('sinking-ship')).toBeDefined();
    expect(scene.getObjectByName('lifeboat')).toBeDefined();
    world.itemObjects.forEach((prop) => {
      expect(prop.scale.toArray()).toEqual([1, 1, 1]);
      expectTestModelTransform(prop);
    });
    world.dispose();
    propModels.dispose();
  });

  it('packs every approved instance and extends into deterministic layers', () => {
    expect(boatStorageTransform(0)).toEqual(boatStorageTransform(0));
    expect(boatStorageTransform(14).position.y)
      .toBeCloseTo(boatStorageTransform(0).position.y + 0.28);
  });

  it('builds fourteen model instances including a distinct scuba set', () => {
    const propModels = createTestPropModels();
    const world = new World(new Scene(), propModels, createItemInstances());
    expect(world.itemObjects.size).toBe(14);
    expect(world.itemObjects.get('scubaSet-1')?.userData.itemType).toBe('scubaSet');
    expect(world.itemObjects.get('scubaSet-1')?.userData.instanceId).toBe('scubaSet-1');
    world.dispose();
    propModels.dispose();
  });

  it('uses the same wave time and amplitude for the ocean and four-point lifeboat pose', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const world = new World(scene, propModels);
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
    const target = buoyancy.sampleTarget(time, 7.6, -6.5, sinking.waveAmplitudeScale);
    const expectedPose = smoothBoatPose(
      { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 },
      target,
      delta,
      7,
    );
    const beacon = scene.getObjectByName('alarm-beacon') as Mesh;
    const emergencySupport = scene.getObjectByName('anchor-support-emergency-tools') as Mesh;
    const emergencyMaterial = emergencySupport.material as MeshStandardMaterial;
    const emergencyIntensity = emergencyMaterial.emissiveIntensity;
    expect(beacon.material).not.toBe(emergencyMaterial);

    world.update(time, delta, sinking, cameraPosition, false);

    const ocean = scene.getObjectByName('procedural-ocean') as Mesh;
    const oceanMaterial = ocean.material as ShaderMaterial;
    expect(oceanMaterial.uniforms.uTime!.value).toBe(time);
    expect(oceanMaterial.uniforms.uAmplitudeScale!.value).toBe(sinking.waveAmplitudeScale);
    expect(world.lifeboat.position.x).toBeCloseTo(7.6 + expectedPose.driftX);
    expect(world.lifeboat.position.y).toBeCloseTo(0.35 + expectedPose.y);
    expect(world.lifeboat.position.z).toBeCloseTo(-6.5 + expectedPose.driftZ);
    expect(world.lifeboat.rotation.x).toBeCloseTo(expectedPose.pitch);
    expect(world.lifeboat.rotation.z).toBeCloseTo(-expectedPose.roll);
    expect(world.lifeboat.scale.toArray()).toEqual([1.15, 1.15, 1.15]);
    expect(world.ship.position.y).toBe(sinking.sinkOffset);
    expect(world.ship.rotation.x).toBe(sinking.pitchRadians);
    expect(world.ship.rotation.z).toBe(sinking.rollRadians);

    const rain = scene.getObjectByName('rain') as Points;
    expect(rain.position.x).toBe(cameraPosition.x);
    expect(rain.position.z).toBe(cameraPosition.z);
    expect((scene.fog as FogExp2).density).toBeCloseTo(0.018 + sinking.progress * 0.009);
    const keyLight = scene.children.find((object) => object instanceof DirectionalLight) as DirectionalLight;
    expect(keyLight.intensity).toBeCloseTo(2.1 - sinking.progress * 0.45);
    expect(beacon).toBeInstanceOf(Mesh);
    const expectedPulse = 0.5 + 0.5 * Math.sin(time * Math.PI * 2 * sinking.alarmRate);
    expect((beacon.material as MeshStandardMaterial).emissiveIntensity)
      .toBeCloseTo(0.25 + expectedPulse * 1.35);
    expect(emergencyMaterial.emissiveIntensity).toBe(emergencyIntensity);
    expect(scene.getObjectByName('sea-spray')).toBeInstanceOf(Points);
    expect(scene.getObjectByName('storm-clouds')).toBeDefined();
    const smoke = scene.getObjectByName('freighter-smoke') as Points;
    const smokePositions = smoke.geometry.getAttribute('position') as BufferAttribute;
    const smokeVersion = smokePositions.version;
    world.update(1, 0.1, { ...sinking, progress: 1 }, cameraPosition, false);
    expect(smokePositions.version).toBeGreaterThan(smokeVersion);
    world.dispose();
    propModels.dispose();
  });

  it('uploads ship and lifeboat exclusions from their current world transforms', () => {
    const scene = new Scene();
    const propModels = createTestPropModels();
    const world = new World(scene, propModels);
    const sinking = getSinkingState(45, 120);

    world.update(2.5, 0.1, sinking, new Vector3(12, 5, -9), false);

    const ocean = scene.getObjectByName('procedural-ocean') as Mesh;
    const uniforms = (ocean.material as ShaderMaterial).uniforms;
    const matrices = uniforms.uExclusionWorldToLocal!.value as Matrix4[];
    const bounds = uniforms.uExclusionBounds!.value as Vector4[];
    expect(uniforms.uExclusionCount!.value).toBe(2);
    expect(bounds.map((value) => value.toArray())).toEqual([
      [-6.05, 6.05, -17.6, 17.6],
      [-1.18, 1.18, -2.48, 2.48],
    ]);
    expect(matrices[0]!.elements).toEqual(world.ship.matrixWorld.clone().invert().elements);
    expect(matrices[1]!.elements).toEqual(world.lifeboat.matrixWorld.clone().invert().elements);
    expect(pointInWaterExclusion(
      world.lifeboat.localToWorld(new Vector3(0.8, 0, 1.5)),
      { worldToLocal: matrices[1]!, bounds: bounds[1]! },
    )).toBe(true);
    expect(pointInWaterExclusion(
      world.lifeboat.localToWorld(new Vector3(1.12, 0, 2.4)),
      { worldToLocal: matrices[1]!, bounds: bounds[1]! },
    )).toBe(true);
    world.dispose();
    propModels.dispose();
  });

  it('slows spray and cloud movement when reduced motion is requested', () => {
    const sinking = getSinkingState(60, 120);
    const propModels = createTestPropModels();
    const regularScene = new Scene();
    const reducedScene = new Scene();
    const regular = new World(regularScene, propModels);
    const reduced = new World(reducedScene, propModels);
    const regularSpray = regularScene.getObjectByName('sea-spray') as Points;
    const reducedSpray = reducedScene.getObjectByName('sea-spray') as Points;
    const regularClouds = regularScene.getObjectByName('storm-clouds') as Group;
    const reducedClouds = reducedScene.getObjectByName('storm-clouds') as Group;
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
    expect(regularClouds.position.x).toBeCloseTo(0.9);
    expect(reducedClouds.position.x).toBeCloseTo(0.3);
    regular.dispose();
    reduced.dispose();
    propModels.dispose();
  });

  it('packs saved instances into lifeboat storage and detaches lost instances', () => {
    const propModels = createTestPropModels();
    const world = new World(new Scene(), propModels, createItemInstances());
    const saved = world.itemObjects.get('flareGun-1')!;
    const lost = world.itemObjects.get('ductTape-1')!;
    const transform = boatStorageTransform(0);

    world.saveItem('flareGun-1', 0);
    world.loseItem('ductTape-1');

    expect(saved.parent?.name).toBe('lifeboat-storage');
    expect(saved.position.toArray()).toEqual(transform.position.toArray());
    expect(saved.rotation.toArray()).toEqual(transform.rotation.toArray());
    expect(saved.scale.toArray()).toEqual([transform.scale, transform.scale, transform.scale]);
    expectTestModelTransform(saved);
    expectTestModelTransform(lost);
    expect(lost.parent).toBeNull();
    world.dispose();
    propModels.dispose();
  });

  it('reattaches landed items to the sinking ship and restores their scale', () => {
    const propModels = createTestPropModels();
    const world = new World(new Scene(), propModels, createItemInstances());
    const landed = world.itemObjects.get('waterJug-1')!;
    landed.removeFromParent();
    landed.scale.setScalar(0.85);

    world.landItem('waterJug-1');

    expect(landed.parent).toBe(world.ship);
    expect(landed.scale.toArray()).toEqual([1, 1, 1]);
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
    const world = new World(scene, propModels);
    const ocean = scene.getObjectByName('procedural-ocean') as Mesh;
    const rain = scene.getObjectByName('rain') as Points;
    const spray = scene.getObjectByName('sea-spray') as Points;
    const clouds = scene.getObjectByName('storm-clouds') as Group;
    const cloudResources = collectRenderResources(clouds);
    expect([...cloudResources.materials].every((material) => material instanceof MeshBasicMaterial)).toBe(true);

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
    expect(propResources).toHaveLength(14);
    propResources.forEach((resources) => {
      expect(resources.geometries.size).toBeGreaterThan(0);
      expect(resources.materials.size).toBeGreaterThan(0);
    });
    expect(lifeboatMeshes.length).toBeGreaterThan(lifeboatResources.geometries.size);
    expect(lifeboatMeshes.length).toBeGreaterThan(lifeboatResources.materials.size);

    const geometryDisposals = observeDisposals([
      ...ownedTask6Geometries,
      ocean.geometry,
      rain.geometry,
      spray.geometry,
      ...cloudResources.geometries,
    ]);
    const ownedMaterialDisposals = observeDisposals([
      ...ownedTask6Materials,
      ocean.material as Material,
      rain.material as Material,
      spray.material as Material,
      ...cloudResources.materials,
    ]);
    world.saveItem('flareGun-1', 0);
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
    expect(scene.getObjectByName('storm-clouds')).toBeUndefined();
    expect(scene.children.some((object) =>
      object instanceof DirectionalLight || object instanceof HemisphereLight)).toBe(false);
    expect(scene.background).toBe(originalBackground);
    expect(scene.fog).toBe(originalFog);
    geometryDisposals.forEach((count) => expect(count).toBe(1));
    ownedMaterialDisposals.forEach((count) => expect(count).toBe(1));
    propModels.dispose();
  });

  it('creates a four-wave subdivided ocean mesh', () => {
    const ocean = new OceanRenderer();
    expect(ocean.mesh.name).toBe('procedural-ocean');
    expect(ocean.mesh.geometry.getAttribute('position').count).toBeGreaterThan(16_000);
    expect(ocean.material.uniforms.uDirections!.value).toHaveLength(4);
    ocean.dispose();
  });

  it('converts linear ocean color before centered display-space dithering', () => {
    const ocean = new OceanRenderer();
    const shader = ocean.material.fragmentShader;
    const linearOutput = shader.indexOf('gl_FragColor = vec4(color, 0.98);');
    const colorSpaceConversion = shader.indexOf('#include <colorspace_fragment>');
    const displayDither = shader.indexOf(
      'gl_FragColor.rgb += orderedDither(gl_FragCoord.xy);',
    );

    expect(linearOutput).toBeGreaterThan(-1);
    expect(colorSpaceConversion).toBeGreaterThan(linearOutput);
    expect(displayDither).toBeGreaterThan(colorSpaceConversion);
    expect(shader).toContain('(threshold - 7.5) / (16.0 * 255.0)');
    ocean.dispose();
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
    const ship = createShip();
    expect(ship.itemAnchors.length).toBeGreaterThanOrEqual(28);
    expect(ship.colliders.length).toBeGreaterThanOrEqual(24);
    expect(ship.playerStart.toArray()).toEqual([0, 3.72, 7.5]);
    expect(ship.evacuationPoint.toArray()).toEqual([5.4, 3.72, -6.5]);
    expect(ship.lifeboatAnchor.toArray()).toEqual([7.6, 0.35, -6.5]);
    expect(ship.waterExclusion).toEqual({ halfWidth: 6.05, halfLength: 17.6 });
    expect(ship.root.getObjectByName('ship-furniture')).toBeDefined();
    expect(ship.root.getObjectByName('freighter-smoke')).toBeDefined();
    ship.dispose();
  });

  it('places all world items on unique authored anchors', () => {
    const propModels = createTestPropModels();
    const world = new World(new Scene(), propModels, createItemInstances(), () => 0.35);
    const referenceShip = createShip();
    const anchorsById = new Map(referenceShip.itemAnchors.map((anchor) => [anchor.id, anchor]));
    const assignments = assignShipItems(createItemInstances(), referenceShip.itemAnchors, () => 0.35);
    const anchorIds = [...world.itemObjects.values()].map((item) => item.userData.shipAnchorId as string);
    expect(anchorIds).toHaveLength(14);
    expect(new Set(anchorIds).size).toBe(14);
    expect(anchorIds.every(Boolean)).toBe(true);
    world.itemObjects.forEach((item, instanceId) => {
      const anchor = anchorsById.get(item.userData.shipAnchorId as string);
      const assignment = assignments.get(instanceId);
      expect(anchor).toBeDefined();
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
    expect(acceptanceBox.min.x).toBeGreaterThanOrEqual(-1.05);
    expect(acceptanceBox.max.x).toBeLessThanOrEqual(1.05);
    expect(acceptanceBox.min.y).toBeGreaterThan(-0.275);
    expect(acceptanceBox.min.z).toBeGreaterThan(-2.375);
    expect(acceptanceBox.max.z).toBeLessThan(2.375);
  });

  it.each([
    ['hull side', new Vector3(1.25, 0, 0)],
    ['endcap', new Vector3(0, 0, 2.55)],
    ['underside', new Vector3(0, -0.4, 0)],
  ])('rejects a thrown item at the lifeboat %s', (_label, point) => {
    expect(createLifeboat().acceptanceBox.containsPoint(point)).toBe(false);
  });
});

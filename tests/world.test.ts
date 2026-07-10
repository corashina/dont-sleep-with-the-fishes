import { describe, expect, it } from 'vitest';
import {
  BufferGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Material,
  Mesh,
  Object3D,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
} from 'three';
import { ITEM_IDS } from '../src/game/ItemState';
import { getSinkingState, type SinkingState } from '../src/game/sinking';
import { BoatBuoyancy, smoothBoatPose } from '../src/ocean/BoatBuoyancy';
import { OceanRenderer } from '../src/ocean/OceanRenderer';
import { DEFAULT_WAVES, sampleWaveField } from '../src/ocean/WaveField';
import type { CollisionBox } from '../src/player/collisions';
import { createLifeboat } from '../src/world/Lifeboat';
import { createProp } from '../src/world/PropFactory';
import { createShip } from '../src/world/Ship';
import { World } from '../src/world/World';

const pointInside = (point: Vector3, box: CollisionBox): boolean =>
  point.x >= box.minX && point.x <= box.maxX &&
  point.y >= box.minY && point.y <= box.maxY &&
  point.z >= box.minZ && point.z <= box.maxZ;

const playerOverlaps = (point: Vector3, radius: number, box: CollisionBox): boolean => {
  if (point.y < box.minY || point.y > box.maxY) return false;
  const closestX = Math.max(box.minX, Math.min(point.x, box.maxX));
  const closestZ = Math.max(box.minZ, Math.min(point.z, box.maxZ));
  return (point.x - closestX) ** 2 + (point.z - closestZ) ** 2 < radius ** 2;
};

const geometrySignature = (id: (typeof ITEM_IDS)[number]): string => {
  const entries: string[] = [];
  createProp(id).traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.computeBoundingBox();
    const bounds = object.geometry.boundingBox;
    if (!bounds) return;
    const size = bounds.getSize(new Vector3());
    const values = [
      size.x, size.y, size.z,
      object.position.x, object.position.y, object.position.z,
      object.rotation.x, object.rotation.y, object.rotation.z,
      object.scale.x, object.scale.y, object.scale.z,
    ].map((value) => Math.round(value * 1_000) / 1_000);
    entries.push(`${object.geometry.type}:${values.join(',')}`);
  });
  return entries.sort().join('|');
};

interface RenderResources {
  geometries: Set<BufferGeometry>;
  materials: Set<Material>;
}

const collectRenderResources = (root: Object3D): RenderResources => {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
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

describe('procedural world builders', () => {
  it('assembles one object for every supply and exposes gameplay markers', () => {
    const scene = new Scene();
    const world = new World(scene);
    expect(world.itemObjects.size).toBe(8);
    expect(world.colliders.length).toBeGreaterThanOrEqual(10);
    expect(scene.getObjectByName('sinking-ship')).toBeDefined();
    expect(scene.getObjectByName('lifeboat')).toBeDefined();
    world.dispose();
  });

  it('uses the same wave time and amplitude for the ocean and four-point lifeboat pose', () => {
    const scene = new Scene();
    const world = new World(scene);
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
    const target = buoyancy.sampleTarget(time, 6.2, -5.8, sinking.waveAmplitudeScale);
    const expectedPose = smoothBoatPose(
      { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 },
      target,
      delta,
      7,
    );

    world.update(time, delta, sinking, cameraPosition, false);

    const ocean = scene.getObjectByName('procedural-ocean') as Mesh;
    const oceanMaterial = ocean.material as ShaderMaterial;
    expect(oceanMaterial.uniforms.uTime!.value).toBe(time);
    expect(oceanMaterial.uniforms.uAmplitudeScale!.value).toBe(sinking.waveAmplitudeScale);
    expect(world.lifeboat.position.x).toBeCloseTo(6.2 + expectedPose.driftX);
    expect(world.lifeboat.position.y).toBeCloseTo(0.35 + expectedPose.y);
    expect(world.lifeboat.position.z).toBeCloseTo(-5.8 + expectedPose.driftZ);
    expect(world.lifeboat.rotation.x).toBeCloseTo(expectedPose.pitch);
    expect(world.lifeboat.rotation.z).toBeCloseTo(-expectedPose.roll);
    expect(world.ship.position.y).toBe(sinking.sinkOffset);
    expect(world.ship.rotation.x).toBe(sinking.pitchRadians);
    expect(world.ship.rotation.z).toBe(sinking.rollRadians);

    const rain = scene.getObjectByName('rain') as Points;
    expect(rain.position.x).toBe(cameraPosition.x);
    expect(rain.position.z).toBe(cameraPosition.z);
    expect((scene.fog as FogExp2).density).toBeCloseTo(0.018 + sinking.progress * 0.009);
    const keyLight = scene.children.find((object) => object instanceof DirectionalLight) as DirectionalLight;
    expect(keyLight.intensity).toBeCloseTo(2.1 - sinking.progress * 0.45);
    world.dispose();
  });

  it('settles saved items into lifeboat slots and detaches lost items', () => {
    const world = new World(new Scene());
    const saved = world.itemObjects.get('flareGun')!;
    const lost = world.itemObjects.get('ductTape')!;

    world.saveItem('flareGun', 0);
    world.loseItem('ductTape');

    expect(saved.parent?.name).toBe('supply-slot-1');
    expect(saved.position.y).toBeGreaterThan(0);
    expect(saved.scale.x).toBeLessThan(0.82);
    world.update(0.3, 0.3, getSinkingState(0, 120), new Vector3(), false);
    expect(saved.position.toArray()).toEqual([0, 0, 0]);
    expect(saved.scale.toArray()).toEqual([0.82, 0.82, 0.82]);
    expect(lost.parent).toBeNull();
    world.dispose();
  });

  it('reattaches landed items to the sinking ship and restores their scale', () => {
    const world = new World(new Scene());
    const landed = world.itemObjects.get('waterJug')!;
    landed.removeFromParent();
    landed.scale.setScalar(0.85);

    world.landItem('waterJug');

    expect(landed.parent).toBe(world.ship);
    expect(landed.scale.toArray()).toEqual([1, 1, 1]);
    world.dispose();
  });

  it.each([1, 2])('restores the scene and disposes all owned resources once after %i dispose call(s)', (disposeCalls) => {
    const scene = new Scene();
    const originalBackground = new Color(0x112233);
    const originalFog = new FogExp2(0x112233, 0.004);
    scene.background = originalBackground;
    scene.fog = originalFog;
    const world = new World(scene);
    const ocean = scene.getObjectByName('procedural-ocean') as Mesh;
    const rain = scene.getObjectByName('rain') as Points;

    const shipMeshes = world.ship.children.filter((child): child is Mesh => child instanceof Mesh);
    const shipGeometries = new Set(shipMeshes.map((mesh) => mesh.geometry));
    const sharedShipMaterials = new Set(shipMeshes.flatMap((mesh) =>
      Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
    const lifeboatMeshes: Mesh[] = [];
    world.lifeboat.traverse((object) => {
      if (object instanceof Mesh) lifeboatMeshes.push(object);
    });
    const lifeboatResources = collectRenderResources(world.lifeboat);
    const propResources = [...world.itemObjects.values()].map(collectRenderResources);
    const propGeometries = new Set(propResources.flatMap((resources) => [...resources.geometries]));
    const propMaterials = new Set(propResources.flatMap((resources) => [...resources.materials]));
    const ownedTask6Geometries = new Set([
      ...shipGeometries,
      ...lifeboatResources.geometries,
      ...propGeometries,
    ]);
    const ownedTask6Materials = new Set([
      ...lifeboatResources.materials,
      ...propMaterials,
    ]);
    expect(shipGeometries.size).toBeGreaterThan(0);
    expect(sharedShipMaterials.size).toBeGreaterThan(0);
    expect(propResources).toHaveLength(ITEM_IDS.length);
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
    ]);
    const ownedMaterialDisposals = observeDisposals([
      ...ownedTask6Materials,
      ocean.material as Material,
      rain.material as Material,
    ]);
    const sharedShipMaterialDisposals = observeDisposals(sharedShipMaterials);

    world.saveItem('flareGun', 0);
    world.loseItem('ductTape');
    expect(world.itemObjects.get('flareGun')!.parent?.name).toBe('supply-slot-1');
    expect(world.itemObjects.get('ductTape')!.parent).toBeNull();
    expect(world.itemObjects.get('cannedFood')!.parent).toBe(world.ship);
    for (let call = 0; call < disposeCalls; call += 1) world.dispose();

    expect(scene.getObjectByName('sinking-ship')).toBeUndefined();
    expect(scene.getObjectByName('lifeboat')).toBeUndefined();
    expect(scene.getObjectByName('procedural-ocean')).toBeUndefined();
    expect(scene.getObjectByName('rain')).toBeUndefined();
    expect(scene.children.some((object) =>
      object instanceof DirectionalLight || object instanceof HemisphereLight)).toBe(false);
    expect(scene.background).toBe(originalBackground);
    expect(scene.fog).toBe(originalFog);
    geometryDisposals.forEach((count) => expect(count).toBe(1));
    ownedMaterialDisposals.forEach((count) => expect(count).toBe(1));
    sharedShipMaterialDisposals.forEach((count) => expect(count).toBe(0));
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

  it.each(ITEM_IDS)('builds a visible mesh for %s', (id) => {
    const prop = createProp(id);
    let meshCount = 0;
    prop.traverse((object) => {
      if (object instanceof Mesh) meshCount += 1;
    });
    expect(prop.userData.itemId).toBe(id);
    expect(meshCount).toBeGreaterThan(0);
  });

  it('gives all eight props distinct procedural geometry signatures', () => {
    const signatures = ITEM_IDS.map(geometrySignature);
    expect(new Set(signatures)).toHaveLength(ITEM_IDS.length);
  });

  it('builds the two-zone ship contract', () => {
    const ship = createShip();
    expect(ship.itemSpawnPoints).toHaveLength(8);
    expect(ship.colliders.length).toBeGreaterThanOrEqual(10);
    expect(ship.playerStart.y).toBeGreaterThan(2);
    expect(ship.evacuationPoint.x).toBeGreaterThan(3);
  });

  it.each([
    ['starboard rail forward span', new Vector3(3.93, 3.72, 2.2)],
    ['port rail stern span', new Vector3(-3.93, 3.72, -10.6)],
    ['bridge console', new Vector3(0, 3.72, 7.1)],
    ['starboard cargo', new Vector3(1.6, 3.72, -5.5)],
    ['port cargo', new Vector3(-1.8, 3.72, -7.5)],
  ])('blocks the planned player height at the %s', (_label, point) => {
    const ship = createShip();
    expect(ship.colliders.some((box) => pointInside(point, box))).toBe(true);
  });

  it('keeps an inboard route within the evacuation threshold', () => {
    const ship = createShip();
    const routeStart = new Vector3(3.15, 3.72, 0);
    const reachablePoint = new Vector3(3.15, 3.72, -5);
    const route = Array.from({ length: 11 }, (_, index) =>
      new Vector3().lerpVectors(routeStart, reachablePoint, index / 10));

    expect(route.every((point) =>
      ship.colliders.every((box) => !playerOverlaps(point, 0.35, box)))).toBe(true);
    expect(reachablePoint.distanceTo(ship.evacuationPoint)).toBeLessThanOrEqual(1.7);
    expect(ship.evacuationPoint.x).toBeGreaterThan(3);
    expect(ship.evacuationPoint.x).toBeLessThan(3.5);
  });

  it('builds exactly five lifeboat supply slots', () => {
    const lifeboat = createLifeboat();
    expect(lifeboat.slots).toHaveLength(5);
    lifeboat.slots.forEach((slot) => {
      let meshCount = 0;
      slot.traverse((object) => {
        if (object instanceof Mesh) meshCount += 1;
      });
      expect(meshCount).toBeGreaterThan(0);
    });
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

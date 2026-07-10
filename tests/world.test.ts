import { describe, expect, it } from 'vitest';
import {
  Color,
  DirectionalLight,
  FogExp2,
  Material,
  Mesh,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
} from 'three';
import { ITEM_IDS } from '../src/game/ItemState';
import type { SinkingState } from '../src/game/sinking';
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

  it('moves saved items into lifeboat slots and removes lost items from interaction', () => {
    const world = new World(new Scene());
    const saved = world.itemObjects.get('flareGun')!;
    const lost = world.itemObjects.get('ductTape')!;

    world.saveItem('flareGun', 0);
    world.loseItem('ductTape');

    expect(saved.parent?.name).toBe('supply-slot-1');
    expect(saved.position.toArray()).toEqual([0, 0, 0]);
    expect(saved.scale.toArray()).toEqual([0.82, 0.82, 0.82]);
    expect(lost.parent).toBeNull();
    expect(world.getInteractiveObjects()).not.toContain(lost);
    world.dispose();
  });

  it('restores the scene and disposes only owned resources exactly once', () => {
    const scene = new Scene();
    const originalBackground = new Color(0x112233);
    const originalFog = new FogExp2(0x112233, 0.004);
    scene.background = originalBackground;
    scene.fog = originalFog;
    const world = new World(scene);
    const ocean = scene.getObjectByName('procedural-ocean') as Mesh;
    const rain = scene.getObjectByName('rain') as Points;
    let oceanGeometryDisposals = 0;
    let rainGeometryDisposals = 0;
    let sharedShipMaterialDisposals = 0;
    ocean.geometry.addEventListener('dispose', () => oceanGeometryDisposals += 1);
    rain.geometry.addEventListener('dispose', () => rainGeometryDisposals += 1);
    let sharedShipMaterial: Material | undefined;
    world.ship.traverse((object) => {
      if (!sharedShipMaterial && object instanceof Mesh) sharedShipMaterial = object.material as Material;
    });
    sharedShipMaterial!.addEventListener('dispose', () => sharedShipMaterialDisposals += 1);

    world.dispose();
    world.dispose();

    expect(scene.getObjectByName('sinking-ship')).toBeUndefined();
    expect(scene.getObjectByName('lifeboat')).toBeUndefined();
    expect(scene.getObjectByName('procedural-ocean')).toBeUndefined();
    expect(scene.getObjectByName('rain')).toBeUndefined();
    expect(scene.children.some((object) => object instanceof DirectionalLight)).toBe(false);
    expect(scene.background).toBe(originalBackground);
    expect(scene.fog).toBe(originalFog);
    expect(oceanGeometryDisposals).toBe(1);
    expect(rainGeometryDisposals).toBe(1);
    expect(sharedShipMaterialDisposals).toBe(0);
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

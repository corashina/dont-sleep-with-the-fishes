// Importance: 5/5. Protects deterministic scavenging physics.
import { Euler, Quaternion } from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  BoatBuoyancy,
  smoothBoatPoseInto,
  type BoatPose,
} from '../src/ocean/BoatBuoyancy';
import {
  DEFAULT_WAVES,
  sampleWaveField,
  sampleWaveFieldInto,
  type WaveSample,
} from '../src/ocean/WaveField';
import {
  ScavengePhysics,
  collisionArcToCuboids,
  collisionBoxToCuboid,
  createScavengeStaticCuboids,
  type PhysicsPose,
} from '../src/physics/ScavengePhysics';
import type { PhysicsRuntime } from '../src/physics/PhysicsRuntime';
import { createShipGeometry } from '../src/world/ShipGeometry';
import { FREIGHTER_DIMENSIONS, SHIP_LAYOUT } from '../src/world/ShipLayout';
import { createShipMaterials } from '../src/world/ShipMaterials';
import { testPhysicsRuntime } from './helpers/physics';

const identityPose = (): PhysicsPose => ({
  translation: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
});

const testRailColliders = [
  { minX: -9.25, maxX: -9, minY: 2.22, maxY: 4.22, minZ: -12, maxZ: 12 },
  { minX: 9, maxX: 9.25, minY: 2.22, maxY: 4.22, minZ: -12, maxZ: 12 },
  { minX: -9, maxX: 9, minY: 2.22, maxY: 4.22, minZ: -12.25, maxZ: -12 },
  { minX: -9, maxX: 9, minY: 2.22, maxY: 4.22, minZ: 12, maxZ: 12.25 },
] as const;

const config = () => ({
  colliders: testRailColliders,
  arcColliders: [],
  safeBounds: { minX: -9, maxX: 9, minZ: -12, maxZ: 12 },
  deckY: 2.22,
  deckBounds: { minX: -10, maxX: 10, minZ: -12.5, maxZ: 12.5 },
  initialShipPose: identityPose(),
  barrelSpawns: [
    { x: -2.5, y: 2.795, z: 3.2 },
    { x: 2.6, y: 2.795, z: -9 },
  ],
});

describe('ScavengePhysics', () => {
  let runtime: PhysicsRuntime;
  beforeAll(async () => { runtime = await testPhysicsRuntime(); });

  it('converts collision boxes to centered cuboids', () => {
    expect(collisionBoxToCuboid({
      minX: -2, maxX: 4, minY: 1, maxY: 3, minZ: -5, maxZ: -1,
    })).toEqual({
      center: { x: 1, y: 2, z: -3 },
      halfExtents: { x: 3, y: 1, z: 2 },
    });
  });

  it('preserves an oriented collision box as one rotated cuboid', () => {
    const cuboid = collisionBoxToCuboid({
      minX: -1.5,
      maxX: 2.5,
      minY: 1,
      maxY: 3,
      minZ: -2.5,
      maxZ: 1.5,
      orientedFootprint: {
        centerX: 0.5,
        centerZ: -0.5,
        halfWidth: 2,
        halfDepth: 0.1,
        rotationY: Math.PI / 4,
      },
    });

    expect(cuboid.center).toEqual({ x: 0.5, y: 2, z: -0.5 });
    expect(cuboid.halfExtents).toEqual({ x: 2, y: 1, z: 0.1 });
    expect(cuboid.rotation).toEqual({
      x: 0,
      y: Math.sin(Math.PI / 8),
      z: 0,
      w: Math.cos(Math.PI / 8),
    });
  });

  it('uses the authored rail colliders without adding a second perimeter boundary', () => {
    const cuboids = createScavengeStaticCuboids(config());
    expect(cuboids).toHaveLength(1 + testRailColliders.length);
    expect(cuboids.slice(1)).toEqual(testRailColliders.map(collisionBoxToCuboid));
  });

  it('aligns the floor cuboid with asymmetric deck bounds', () => {
    const floor = createScavengeStaticCuboids({
      ...config(),
      deckBounds: { minX: -8.125, maxX: 8.125, minZ: -19.525, maxZ: 27.1 },
    })[0]!;

    expect(floor.center.x).toBe(0);
    expect(floor.center.y).toBeCloseTo(2.12);
    expect(floor.center.z).toBeCloseTo(3.7875);
    expect(floor.halfExtents.x).toBeCloseTo(8.125);
    expect(floor.halfExtents.y).toBeCloseTo(0.1);
    expect(floor.halfExtents.z).toBeCloseTo(23.3125);
  });

  it('converts a curved end rail into eight rotated physics segments', () => {
    const cuboids = collisionArcToCuboids({
      centerX: 0,
      centerZ: 22,
      radiusX: 9.725,
      radiusZ: 5.325,
      end: 'bow',
      thickness: 0.25,
      minY: 2.22,
      maxY: 3.22,
    });
    expect(cuboids).toHaveLength(8);
    expect(cuboids.every(({ rotation }) => rotation !== undefined)).toBe(true);
    expect(cuboids[0]!.center.x).toBeGreaterThan(9);
    expect(cuboids[3]!.center.z).toBeGreaterThan(27);
  });

  it('rejects non-positive collider extents', () => {
    expect(() => collisionBoxToCuboid({
      minX: 1, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1,
    })).toThrow('Physics collider must have finite positive extents');
  });

  it('rejects invalid configured colliders before creating a world', () => {
    const createWorld = vi.spyOn(runtime, 'createWorld');
    expect(() => new ScavengePhysics(runtime, {
      ...config(),
      colliders: [{
        minX: 1,
        maxX: 1,
        minY: 0,
        maxY: 1,
        minZ: 0,
        maxZ: 1,
      }],
    })).toThrow('Physics collider must have finite positive extents');
    expect(createWorld).not.toHaveBeenCalled();
    createWorld.mockRestore();
  });

  it('rests on a stationary level deck repeatably', () => {
    const create = () => new ScavengePhysics(runtime, {
      ...config(),
      safeBounds: { minX: -9, maxX: 9, minZ: -26, maxZ: 26 },
      deckBounds: { minX: -10, maxX: 10, minZ: -27.5, maxZ: 27.5 },
    });
    const left = create();
    const right = create();
    for (let frame = 0; frame < 180; frame += 1) {
      left.update(identityPose(), 1 / 60, true);
      right.update(identityPose(), 1 / 60, true);
    }
    expect(left.barrelPoses).toEqual(right.barrelPoses);
    expect(left.barrelPoses).toHaveLength(2);
    expect(left.barrelPoses[0]!.translation.y).toBeCloseTo(2.22 + 0.575, 2);
    expect(left.barrelPoses[1]!.translation.y).toBeCloseTo(2.22 + 0.575, 2);
    left.dispose();
    right.dispose();
  });

  it('spawns both authored barrels without diagnostic objects', () => {
    const physics = new ScavengePhysics(runtime, config());
    expect(physics.barrelPoses[0]!.translation.x).toBeCloseTo(-2.5);
    expect(physics.barrelPoses[0]!.translation.y).toBeCloseTo(2.795);
    expect(physics.barrelPoses[0]!.translation.z).toBeCloseTo(3.2);
    expect(physics.barrelPoses[1]!.translation.x).toBeCloseTo(2.6);
    expect(physics.barrelPoses[1]!.translation.y).toBeCloseTo(2.795);
    expect(physics.barrelPoses[1]!.translation.z).toBeCloseTo(-9);
    expect(physics.barrelPoses[1]!.rotation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    physics.dispose();
  });

  it('moves under a controlled kinematic tilt and remains contained', () => {
    const physics = new ScavengePhysics(runtime, config());
    const tilted: PhysicsPose = {
      translation: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: Math.sin(0.2 / 2), w: Math.cos(0.2 / 2) },
    };
    for (let frame = 0; frame < 300; frame += 1) {
      physics.update(tilted, 1 / 60, true);
    }
    expect(physics.barrelPoses[0]!.translation.x).not.toBeCloseTo(-2.5);
    expect(Math.abs(physics.barrelLocalPositionsForTest[0]!.x)).toBeLessThan(9);
    expect(physics.barrelPoses[1]!.translation.x).not.toBeCloseTo(2.6);
    physics.dispose();
  });

  it('slides strongly but remains contained under the real scavenging wave field', () => {
    const materials = createShipMaterials();
    const ship = createShipGeometry(materials);
    const sample = (time: number, x: number, z: number, scale: number) =>
      sampleWaveField(DEFAULT_WAVES, time, x, z, scale);
    const sampleInto = (
      output: WaveSample,
      time: number,
      x: number,
      z: number,
      scale: number,
    ) => sampleWaveFieldInto(output, DEFAULT_WAVES, time, x, z, scale);
    const buoyancy = new BoatBuoyancy(sample, { length: 38, width: 13 }, sampleInto);
    const current: BoatPose = { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 };
    const target: BoatPose = { ...current };
    const rotation = new Quaternion();
    const pose: PhysicsPose = {
      translation: { x: 0, y: -0.76, z: 0 },
      rotation,
    };
    const shipHalfWidth = FREIGHTER_DIMENSIONS.width / 2;
    const safeBounds = {
      minX: -shipHalfWidth + 0.35,
      maxX: shipHalfWidth - 0.35,
      minZ: -26.7,
      maxZ: 26.7,
    };
    const deckBounds = SHIP_LAYOUT.zones.find(({ id }) => id === 'cargoDeck')!.bounds;
    const physics = new ScavengePhysics(runtime, {
      colliders: ship.shellColliders,
      arcColliders: ship.arcColliders,
      safeBounds,
      deckY: FREIGHTER_DIMENSIONS.deckY,
      deckBounds,
      initialShipPose: pose,
      barrelSpawns: config().barrelSpawns,
    });
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (let frame = 1; frame <= 120 * 60; frame += 1) {
      const time = frame / 60;
      const progress = time / 120;
      const scale = 1 + 0.35 * progress * progress * progress
        * (progress * (progress * 6 - 15) + 10);
      buoyancy.sampleTargetInto(target, time, 0, 0, scale);
      smoothBoatPoseInto(current, current, target, 1 / 60, 2.4);
      rotation.setFromEuler(new Euler(current.pitch, 0, -current.roll));
      (pose.translation as { y: number }).y = current.y - 0.76;
      physics.update(pose, 1 / 60, true);

      const local = physics.barrelLocalPositionsForTest[0]!;
      minX = Math.min(minX, local.x);
      maxX = Math.max(maxX, local.x);
      minY = Math.min(minY, local.y);
      maxY = Math.max(maxY, local.y);
      minZ = Math.min(minZ, local.z);
      maxZ = Math.max(maxZ, local.z);
    }

    const horizontalRange = Math.max(maxX - minX, maxZ - minZ);
    expect(horizontalRange).toBeGreaterThanOrEqual(0.3);
    expect(horizontalRange).toBeLessThan(15);
    expect(maxY - minY).toBeLessThan(0.2);
    expect(minX).toBeGreaterThan(safeBounds.minX);
    expect(maxX).toBeLessThan(safeBounds.maxX);
    expect(minZ).toBeGreaterThan(safeBounds.minZ);
    expect(maxZ).toBeLessThan(safeBounds.maxZ);
    expect(physics.recoveryCountForTest).toBe(0);
    physics.dispose();
    ship.disposeGeometry();
    materials.dispose();
  });

  it('freezes when inactive and disposes repeatedly', () => {
    const world = runtime.createWorld({ x: 0, y: -9.81, z: 0 });
    const free = vi.spyOn(world, 'free');
    const createWorld = vi.spyOn(runtime, 'createWorld').mockReturnValueOnce(world);
    const physics = new ScavengePhysics(runtime, config());
    const before = structuredClone(physics.barrelPoses);
    physics.update(identityPose(), 1, false);
    expect(physics.barrelPoses).toEqual(before);
    physics.dispose();
    expect(() => physics.dispose()).not.toThrow();
    expect(free).toHaveBeenCalledOnce();
    createWorld.mockRestore();
  });

  it('reads the Rapier pose once after all accepted substeps', () => {
    const physics = new ScavengePhysics(runtime, config());
    const internals = physics as unknown as {
      barrelBodies: Array<{
        translation(): { x: number; y: number; z: number };
        rotation(): { x: number; y: number; z: number; w: number };
      }>;
      world: { step(): void };
    };
    const translations = internals.barrelBodies.map((body) => vi.spyOn(body, 'translation'));
    const rotations = internals.barrelBodies.map((body) => vi.spyOn(body, 'rotation'));
    const step = vi.spyOn(internals.world, 'step');
    physics.update(identityPose(), 1 / 20, true);
    expect(step).toHaveBeenCalledTimes(3);
    translations.forEach((translation) => {
      expect(translation).toHaveBeenCalledOnce();
      expect(translation.mock.invocationCallOrder[0]!)
        .toBeGreaterThan(step.mock.invocationCallOrder[2]!);
    });
    rotations.forEach((rotation) => {
      expect(rotation).toHaveBeenCalledOnce();
      expect(rotation.mock.invocationCallOrder[0]!)
        .toBeGreaterThan(step.mock.invocationCallOrder[2]!);
    });
    physics.dispose();
  });

  it.each([
    ['escaped', { translation: { x: 20, y: 3, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }],
    ['non-finite', { translation: { x: Number.NaN, y: 3, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }],
  ] as const)('recovers a %s barrel and clears velocity', (_label, pose) => {
    const physics = new ScavengePhysics(runtime, config());
    physics.setBarrelVelocityForTest({ x: 4, y: 5, z: 6 });
    physics.setBarrelPoseForTest(pose);
    physics.update(identityPose(), 1 / 60, true);
    expect(physics.barrelPoses[0]!.translation.x).toBeCloseTo(-2.5);
    expect(physics.barrelPoses[0]!.translation.y).toBeCloseTo(2.795);
    expect(physics.barrelPoses[0]!.translation.z).toBeCloseTo(3.2);
    expect(physics.recoveryCountForTest).toBe(1);
    const barrelBody = (physics as unknown as {
      barrelBodies: Array<{
        linvel(): { x: number; y: number; z: number };
        angvel(): { x: number; y: number; z: number };
      }>;
    }).barrelBodies[0]!;
    expect(barrelBody.linvel()).toEqual({ x: 0, y: 0, z: 0 });
    expect(barrelBody.angvel()).toEqual({ x: 0, y: 0, z: 0 });
    physics.dispose();
  });

  it.each([
    ['minX', { x: -9 + 0.54, y: 2.22 + 0.55, z: 0 }, { x: -8, y: 0, z: 0 }],
    ['maxX', { x: 9 - 0.54, y: 2.22 + 0.55, z: 0 }, { x: 8, y: 0, z: 0 }],
    ['minZ', { x: 0, y: 2.22 + 0.55, z: -12 + 0.54 }, { x: 0, y: 0, z: -8 }],
    ['maxZ', { x: 0, y: 2.22 + 0.55, z: 12 - 0.54 }, { x: 0, y: 0, z: 8 }],
  ] as const)('contains the barrel at %s', (boundary, translation, velocity) => {
    const physics = new ScavengePhysics(runtime, config());
    const recoveryCount = physics.recoveryCountForTest;
    expect(recoveryCount).toBe(0);
    physics.setBarrelPoseForTest({
      translation,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    });
    physics.setBarrelVelocityForTest(velocity);
    for (let frame = 0; frame < 120; frame += 1) {
      physics.update(identityPose(), 1 / 60, true);
      const local = physics.barrelLocalPositionsForTest[0]!;
      if (boundary === 'minX') expect(local.x).toBeGreaterThanOrEqual(-9);
      if (boundary === 'maxX') expect(local.x).toBeLessThanOrEqual(9);
      if (boundary === 'minZ') expect(local.z).toBeGreaterThanOrEqual(-12);
      if (boundary === 'maxZ') expect(local.z).toBeLessThanOrEqual(12);
    }
    expect(physics.recoveryCountForTest).toBe(recoveryCount);
    physics.dispose();
  });
});

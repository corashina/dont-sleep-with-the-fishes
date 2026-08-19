// Importance: 10/10 (scaled from 5/5). Protects deterministic scavenging physics.
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
  objects: [
    {
      id: 'sphere',
      spawn: { x: -2.5, y: 2.82, z: 3.2 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      profile: {
        collider: { kind: 'sphere' as const, radius: 0.6 },
        mass: 8,
        friction: 0.22,
        restitution: 0.08,
        linearDamping: 0.06,
        angularDamping: 0.025,
      },
    },
    {
      id: 'cylinder',
      spawn: { x: 0, y: 2.78, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      profile: {
        collider: { kind: 'cylinder' as const, halfHeight: 0.56, radius: 0.55 },
        mass: 36,
        friction: 0.30,
        restitution: 0.03,
        linearDamping: 0.08,
        angularDamping: 0.06,
      },
    },
    {
      id: 'cuboid',
      spawn: { x: 2.5, y: 2.75, z: -3.2 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      profile: {
        collider: { kind: 'cuboid' as const, halfExtents: { x: 0.5, y: 0.53, z: 0.5 } },
        mass: 7,
        friction: 0.62,
        restitution: 0.015,
        linearDamping: 0.26,
        angularDamping: 0.32,
      },
    },
  ],
});

function pushingConfig(objectZ = -1.2) {
  const base = config();
  return {
    ...base,
    colliders: [],
    objects: [{
      ...base.objects[2]!,
      id: 'push-box',
      spawn: { x: 0, y: 2.75, z: objectZ },
    }],
  };
}

function pushingWithUnrelatedObjectsConfig() {
  const base = config();
  return {
    ...base,
    colliders: [],
    objects: [
      {
        ...base.objects[2]!,
        id: 'push-box',
        spawn: { x: 0, y: 2.75, z: -1.2 },
      },
      {
        ...base.objects[0]!,
        id: 'moving-sphere',
        spawn: { x: 4, y: 2.82, z: 3 },
      },
      {
        ...base.objects[1]!,
        id: 'recovering-cylinder',
        spawn: { x: -4, y: 2.78, z: 3 },
      },
    ],
  };
}

function drivePlayerIntoObject(
  physics: ScavengePhysics,
  step: number,
  frameCount: number,
): number {
  const current = { x: 0, y: 3.72, z: 0 };
  const startZ = physics.objectLocalPositionsForTest[0]!.z;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const desired = { x: current.x, y: current.y, z: current.z - step };
    physics.resolvePlayerMovement(current, desired);
    current.x = desired.x;
    current.z = desired.z;
    physics.update(identityPose(), 1 / 60, true);
  }
  return Math.abs(physics.objectLocalPositionsForTest[0]!.z - startZ);
}

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
    expect(left.objectPoses).toEqual(right.objectPoses);
    expect(left.objectPoses).toHaveLength(3);
    expect(left.objectPoses[0]!.translation.y).toBeCloseTo(2.22 + 0.6, 2);
    expect(left.objectPoses[1]!.translation.y).toBeCloseTo(2.22 + 0.56, 2);
    expect(left.objectPoses[2]!.translation.y).toBeCloseTo(2.22 + 0.53, 2);
    left.dispose();
    right.dispose();
  });

  it('spawns all configured objects with their rotations', () => {
    const physics = new ScavengePhysics(runtime, config());
    const expected = config().objects.map(({ spawn }) => spawn);
    physics.objectPoses.forEach(({ translation }, index) => {
      expect(translation.x).toBeCloseTo(expected[index]!.x);
      expect(translation.y).toBeCloseTo(expected[index]!.y);
      expect(translation.z).toBeCloseTo(expected[index]!.z);
    });
    expect(physics.objectPoses.every(({ rotation }) => (
      rotation.x === 0 && rotation.y === 0 && rotation.z === 0 && rotation.w === 1
    ))).toBe(true);
    physics.dispose();
  });

  it('blocks player movement until the contacted object moves', () => {
    const physics = new ScavengePhysics(runtime, pushingConfig());
    const current = { x: 0, y: 3.72, z: 0 };
    const desired = { x: 0, y: 3.72, z: -1 };
    physics.resolvePlayerMovement(current, desired);
    expect(desired.z).toBeGreaterThan(-1);
    physics.update(identityPose(), 1 / 60, true);
    expect(physics.objectLocalPositionsForTest[0]!.z).toBeLessThan(-1.2);
    physics.dispose();
  });

  it('preserves unrelated motion and pending recovery during first contact', () => {
    const physics = new ScavengePhysics(runtime, pushingWithUnrelatedObjectsConfig());
    const movingRotation = {
      x: 0,
      y: Math.sin(0.3 / 2),
      z: 0,
      w: Math.cos(0.3 / 2),
    };
    physics.setObjectPoseForTest({
      translation: { x: 4.5, y: 3.1, z: 2.5 },
      rotation: movingRotation,
    }, 1);
    physics.setObjectVelocityForTest({ x: 0.6, y: 0.2, z: -0.4 }, 1);
    physics.setObjectPoseForTest({
      translation: { x: 20, y: 3, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    }, 2);
    physics.setObjectVelocityForTest({ x: 1, y: 2, z: 3 }, 2);
    const bodies = (physics as unknown as {
      objectBodies: Array<{
        translation(): { x: number; y: number; z: number };
        rotation(): { x: number; y: number; z: number; w: number };
        linvel(): { x: number; y: number; z: number };
        angvel(): { x: number; y: number; z: number };
      }>;
    }).objectBodies;
    const movingBody = bodies[1]!;
    const recoveringBody = bodies[2]!;
    const movingBefore = {
      translation: { ...movingBody.translation() },
      rotation: { ...movingBody.rotation() },
      linvel: { ...movingBody.linvel() },
      angvel: { ...movingBody.angvel() },
    };
    const recoveringBefore = {
      translation: { ...recoveringBody.translation() },
      rotation: { ...recoveringBody.rotation() },
      linvel: { ...recoveringBody.linvel() },
      angvel: { ...recoveringBody.angvel() },
    };
    const current = { x: 0, y: 3.72, z: 0 };
    const desired = { x: 0, y: 3.72, z: -1 };

    physics.resolvePlayerMovement(current, desired);

    expect(desired.z).toBeGreaterThan(-1);
    expect({
      translation: movingBody.translation(),
      rotation: movingBody.rotation(),
      linvel: movingBody.linvel(),
      angvel: movingBody.angvel(),
    }).toEqual(movingBefore);
    expect({
      translation: recoveringBody.translation(),
      rotation: recoveringBody.rotation(),
      linvel: recoveringBody.linvel(),
      angvel: recoveringBody.angvel(),
    }).toEqual(recoveringBefore);
    expect(physics.recoveryCountForTest).toBe(0);

    physics.update(identityPose(), 1 / 60, true);

    expect(physics.recoveryCountForTest).toBe(1);
    expect(physics.objectLocalPositionsForTest[2]).toEqual({ x: -4, y: 2.78, z: 3 });
    physics.dispose();
  });

  it('pushes on contact but not at a distance', () => {
    const far = new ScavengePhysics(runtime, pushingConfig(-6));
    expect(drivePlayerIntoObject(far, 0.04, 10)).toBeCloseTo(0, 5);
    far.dispose();

    const contact = new ScavengePhysics(runtime, pushingConfig());
    expect(drivePlayerIntoObject(contact, 0.04, 60)).toBeGreaterThan(0.01);
    contact.dispose();
  });

  it('pushes farther from sprint movement than walk movement', () => {
    const walk = new ScavengePhysics(runtime, pushingConfig());
    const sprint = new ScavengePhysics(runtime, pushingConfig());
    const walkDistance = drivePlayerIntoObject(walk, 0.04, 60);
    const sprintDistance = drivePlayerIntoObject(sprint, 0.08, 60);
    expect(walkDistance).toBeLessThan(1.5);
    expect(sprintDistance).toBeGreaterThan(walkDistance);
    walk.dispose();
    sprint.dispose();
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
    expect(physics.objectPoses[0]!.translation.x).not.toBeCloseTo(-2.5);
    expect(Math.abs(physics.objectLocalPositionsForTest[0]!.x)).toBeLessThan(9);
    expect(physics.objectPoses[2]!.translation.x).not.toBeCloseTo(2.5);
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
      objects: config().objects,
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

      const local = physics.objectLocalPositionsForTest[0]!;
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

  it('tracks inactive ship motion and hands off without drift, teleport, or an impulse spike', () => {
    const world = runtime.createWorld({ x: 0, y: -9.81, z: 0 });
    const free = vi.spyOn(world, 'free');
    const createWorld = vi.spyOn(runtime, 'createWorld').mockReturnValueOnce(world);
    const physics = new ScavengePhysics(runtime, config());
    const movedLocal = { x: -1.7, y: 2.82, z: 2.4 };
    physics.setObjectPoseForTest({
      translation: movedLocal,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    });
    physics.update(identityPose(), 1 / 60, true);
    const preservedLocal = { ...physics.objectLocalPositionsForTest[0]! };
    const introPose: PhysicsPose = {
      translation: { x: 3, y: -1, z: 4 },
      rotation: { x: 0, y: Math.sin(0.25 / 2), z: 0, w: Math.cos(0.25 / 2) },
    };

    physics.update(introPose, 1, false);

    expect(physics.objectLocalPositionsForTest[0]!.x).toBeCloseTo(preservedLocal.x);
    expect(physics.objectLocalPositionsForTest[0]!.y).toBeCloseTo(preservedLocal.y);
    expect(physics.objectLocalPositionsForTest[0]!.z).toBeCloseTo(preservedLocal.z);
    const beforeHandoff = structuredClone(physics.objectPoses[0]!);
    physics.update(introPose, 1 / 60, true);
    const afterHandoff = physics.objectPoses[0]!;
    expect(afterHandoff.translation.x).toBeCloseTo(beforeHandoff.translation.x, 3);
    expect(afterHandoff.translation.z).toBeCloseTo(beforeHandoff.translation.z, 3);
    const body = (physics as unknown as {
      objectBodies: Array<{ linvel(): { x: number; y: number; z: number } }>;
    }).objectBodies[0]!;
    expect(Math.hypot(body.linvel().x, body.linvel().z)).toBeLessThan(0.05);
    physics.dispose();
    expect(() => physics.dispose()).not.toThrow();
    expect(free).toHaveBeenCalledOnce();
    createWorld.mockRestore();
  });

  it('reads the Rapier pose once after all accepted substeps', () => {
    const physics = new ScavengePhysics(runtime, config());
    const internals = physics as unknown as {
      objectBodies: Array<{
        translation(): { x: number; y: number; z: number };
        rotation(): { x: number; y: number; z: number; w: number };
      }>;
      world: { step(): void };
    };
    const translations = internals.objectBodies.map((body) => vi.spyOn(body, 'translation'));
    const rotations = internals.objectBodies.map((body) => vi.spyOn(body, 'rotation'));
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
  ] as const)('recovers an %s object and clears velocity', (_label, pose) => {
    const physics = new ScavengePhysics(runtime, config());
    physics.setObjectVelocityForTest({ x: 4, y: 5, z: 6 });
    physics.setObjectPoseForTest(pose);
    physics.update(identityPose(), 1 / 60, true);
    expect(physics.objectPoses[0]!.translation.x).toBeCloseTo(-2.5);
    expect(physics.objectPoses[0]!.translation.y).toBeCloseTo(2.82);
    expect(physics.objectPoses[0]!.translation.z).toBeCloseTo(3.2);
    expect(physics.recoveryCountForTest).toBe(1);
    const objectBody = (physics as unknown as {
      objectBodies: Array<{
        linvel(): { x: number; y: number; z: number };
        angvel(): { x: number; y: number; z: number };
      }>;
    }).objectBodies[0]!;
    expect(objectBody.linvel()).toEqual({ x: 0, y: 0, z: 0 });
    expect(objectBody.angvel()).toEqual({ x: 0, y: 0, z: 0 });
    physics.dispose();
  });

  it.each([
    ['minX', { x: -9 + 0.54, y: 2.22 + 0.55, z: 0 }, { x: -8, y: 0, z: 0 }],
    ['maxX', { x: 9 - 0.54, y: 2.22 + 0.55, z: 0 }, { x: 8, y: 0, z: 0 }],
    ['minZ', { x: 0, y: 2.22 + 0.55, z: -12 + 0.54 }, { x: 0, y: 0, z: -8 }],
    ['maxZ', { x: 0, y: 2.22 + 0.55, z: 12 - 0.54 }, { x: 0, y: 0, z: 8 }],
  ] as const)('contains the object at %s', (boundary, translation, velocity) => {
    const physics = new ScavengePhysics(runtime, config());
    const recoveryCount = physics.recoveryCountForTest;
    expect(recoveryCount).toBe(0);
    physics.setObjectPoseForTest({
      translation,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    });
    physics.setObjectVelocityForTest(velocity);
    for (let frame = 0; frame < 120; frame += 1) {
      physics.update(identityPose(), 1 / 60, true);
      const local = physics.objectLocalPositionsForTest[0]!;
      if (boundary === 'minX') expect(local.x).toBeGreaterThanOrEqual(-9);
      if (boundary === 'maxX') expect(local.x).toBeLessThanOrEqual(9);
      if (boundary === 'minZ') expect(local.z).toBeGreaterThanOrEqual(-12);
      if (boundary === 'maxZ') expect(local.z).toBeLessThanOrEqual(12);
    }
    expect(physics.recoveryCountForTest).toBe(recoveryCount);
    physics.dispose();
  });
});

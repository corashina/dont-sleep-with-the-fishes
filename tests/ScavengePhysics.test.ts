import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ScavengePhysics,
  collisionBoxToCuboid,
  type PhysicsPose,
} from '../src/physics/ScavengePhysics';
import type { PhysicsRuntime } from '../src/physics/PhysicsRuntime';
import { testPhysicsRuntime } from './helpers/physics';

const identityPose = (): PhysicsPose => ({
  translation: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
});

const config = () => ({
  colliders: [],
  safeBounds: { minX: -9, maxX: 9, minZ: -12, maxZ: 12 },
  deckY: 2.22,
  shipWidth: 20,
  shipLength: 25,
  initialShipPose: identityPose(),
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
      colliders: [],
      safeBounds: { minX: -9, maxX: 9, minZ: -26, maxZ: 26 },
      deckY: 2.22,
      shipWidth: 20,
      shipLength: 55,
      initialShipPose: identityPose(),
    });
    const left = create();
    const right = create();
    for (let frame = 0; frame < 180; frame += 1) {
      left.update(identityPose(), 1 / 60, true);
      right.update(identityPose(), 1 / 60, true);
    }
    expect(left.barrelPose).toEqual(right.barrelPose);
    expect(left.barrelPose.translation.y).toBeCloseTo(2.22 + 0.55, 2);
    left.dispose();
    right.dispose();
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
    expect(physics.barrelPose.translation.x).not.toBeCloseTo(6);
    expect(Math.abs(physics.barrelLocalPositionForTest.x)).toBeLessThan(9);
    physics.dispose();
  });

  it('freezes when inactive and disposes repeatedly', () => {
    const world = runtime.createWorld({ x: 0, y: -9.81, z: 0 });
    const free = vi.spyOn(world, 'free');
    const createWorld = vi.spyOn(runtime, 'createWorld').mockReturnValueOnce(world);
    const physics = new ScavengePhysics(runtime, config());
    const before = structuredClone(physics.barrelPose);
    physics.update(identityPose(), 1, false);
    expect(physics.barrelPose).toEqual(before);
    physics.dispose();
    expect(() => physics.dispose()).not.toThrow();
    expect(free).toHaveBeenCalledOnce();
    createWorld.mockRestore();
  });

  it('reads the Rapier pose once after all accepted substeps', () => {
    const physics = new ScavengePhysics(runtime, config());
    const internals = physics as unknown as {
      barrelBody: {
        translation(): { x: number; y: number; z: number };
        rotation(): { x: number; y: number; z: number; w: number };
      };
      world: { step(): void };
    };
    const translation = vi.spyOn(internals.barrelBody, 'translation');
    const rotation = vi.spyOn(internals.barrelBody, 'rotation');
    const step = vi.spyOn(internals.world, 'step');
    physics.update(identityPose(), 1 / 20, true);
    expect(step).toHaveBeenCalledTimes(3);
    expect(translation).toHaveBeenCalledOnce();
    expect(rotation).toHaveBeenCalledOnce();
    expect(translation.mock.invocationCallOrder[0]!)
      .toBeGreaterThan(step.mock.invocationCallOrder[2]!);
    expect(rotation.mock.invocationCallOrder[0]!)
      .toBeGreaterThan(step.mock.invocationCallOrder[2]!);
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
    expect(physics.barrelPose.translation.x).toBeCloseTo(6);
    expect(physics.barrelPose.translation.y).toBeCloseTo(2.795);
    expect(physics.barrelPose.translation.z).toBeCloseTo(-6);
    expect(physics.recoveryCountForTest).toBe(1);
    const barrelBody = (physics as unknown as {
      barrelBody: {
        linvel(): { x: number; y: number; z: number };
        angvel(): { x: number; y: number; z: number };
      };
    }).barrelBody;
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
      const local = physics.barrelLocalPositionForTest;
      if (boundary === 'minX') expect(local.x).toBeGreaterThanOrEqual(-9);
      if (boundary === 'maxX') expect(local.x).toBeLessThanOrEqual(9);
      if (boundary === 'minZ') expect(local.z).toBeGreaterThanOrEqual(-12);
      if (boundary === 'maxZ') expect(local.z).toBeLessThanOrEqual(12);
    }
    expect(physics.recoveryCountForTest).toBe(recoveryCount);
    physics.dispose();
  });
});

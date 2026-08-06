import { describe, expect, it } from 'vitest';
import { SCAVENGE_PHYSICS_OBJECT_SPECS } from '../src/world/ScavengePhysicsObjectCatalog';

describe('scavenge physics object catalog', () => {
  it('defines seven unique tuned objects', () => {
    expect(SCAVENGE_PHYSICS_OBJECT_SPECS.map(({ id }) => id)).toEqual([
      'barrel', 'pumpkin', 'propaneTank', 'redCan',
      'cargoBox', 'shippingBox', 'package',
    ]);
    expect(SCAVENGE_PHYSICS_OBJECT_SPECS.map(({ mass }) => mass))
      .toEqual([36, 8, 30, 16, 7, 10, 5]);
    expect(SCAVENGE_PHYSICS_OBJECT_SPECS.map(({ friction }) => friction))
      .toEqual([0.30, 0.22, 0.34, 0.40, 0.62, 0.56, 0.68]);
    expect(SCAVENGE_PHYSICS_OBJECT_SPECS.map(({ visualScale }) => visualScale)).toEqual([
      [1, 1, 1],
      [1 / 3, 1.6 / 3, 1 / 3],
      [0.5, 0.5, 0.5],
      [1.129507 / 1.187991, 1.15 / 1.6, 1.129507 / 1.187991],
      [1.5, 1.5, 1.5],
      [0.5, 0.5, 0.5],
      [0.75, 0.75, 0.75],
    ]);
    expect(SCAVENGE_PHYSICS_OBJECT_SPECS.map(({ visualHalfHeight }) => visualHalfHeight))
      .toEqual([0.575, 0.64 / 3, 0.425, 0.575, 0.4125, 0.2875, 0.39375]);
    expect(SCAVENGE_PHYSICS_OBJECT_SPECS.map(({ collider }) => collider.kind))
      .toEqual(['cylinder', 'sphere', 'cylinder', 'cylinder', 'cuboid', 'cuboid', 'cuboid']);
    expect(SCAVENGE_PHYSICS_OBJECT_SPECS.map(({ collider }) => collider)).toEqual([
      { kind: 'cylinder', halfHeight: 0.55775, radius: 0.547811 },
      { kind: 'sphere', radius: 0.6208 / 3 },
      { kind: 'cylinder', halfHeight: 0.41225, radius: 0.2922855 },
      { kind: 'cylinder', halfHeight: 0.55775, radius: 0.547811 },
      { kind: 'cuboid', halfExtents: { x: 0.45365325, y: 0.400125, z: 0.4606335 } },
      { kind: 'cuboid', halfExtents: { x: 0.278875, y: 0.278875, z: 0.278875 } },
      { kind: 'cuboid', halfExtents: { x: 0.458538, y: 0.3819375, z: 0.45351 } },
    ]);
    expect(SCAVENGE_PHYSICS_OBJECT_SPECS.map(({ restitution }) => restitution))
      .toEqual([0.03, 0.08, 0.025, 0.04, 0.015, 0.02, 0.01]);
    expect(SCAVENGE_PHYSICS_OBJECT_SPECS.map(({ linearDamping }) => linearDamping))
      .toEqual([0.08, 0.06, 0.10, 0.14, 0.26, 0.22, 0.30]);
    expect(SCAVENGE_PHYSICS_OBJECT_SPECS.map(({ angularDamping }) => angularDamping))
      .toEqual([0.06, 0.025, 0.08, 0.12, 0.32, 0.28, 0.38]);
  });
});

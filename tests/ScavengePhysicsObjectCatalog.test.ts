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
    expect(SCAVENGE_PHYSICS_OBJECT_SPECS.map(({ collider }) => collider.kind))
      .toEqual(['cylinder', 'sphere', 'cylinder', 'cylinder', 'cuboid', 'cuboid', 'cuboid']);
    expect(SCAVENGE_PHYSICS_OBJECT_SPECS.map(({ collider }) => collider)).toEqual([
      { kind: 'cylinder', halfHeight: 0.55775, radius: 0.547811 },
      { kind: 'sphere', radius: 0.6208 },
      { kind: 'cylinder', halfHeight: 0.8245, radius: 0.584571 },
      { kind: 'cylinder', halfHeight: 0.776, radius: 0.576176 },
      { kind: 'cuboid', halfExtents: { x: 0.604871, y: 0.5335, z: 0.614178 } },
      { kind: 'cuboid', halfExtents: { x: 0.55775, y: 0.55775, z: 0.55775 } },
      { kind: 'cuboid', halfExtents: { x: 0.611384, y: 0.50925, z: 0.60468 } },
    ]);
    expect(SCAVENGE_PHYSICS_OBJECT_SPECS.map(({ restitution }) => restitution))
      .toEqual([0.03, 0.08, 0.025, 0.04, 0.015, 0.02, 0.01]);
    expect(SCAVENGE_PHYSICS_OBJECT_SPECS.map(({ linearDamping }) => linearDamping))
      .toEqual([0.08, 0.06, 0.10, 0.14, 0.26, 0.22, 0.30]);
    expect(SCAVENGE_PHYSICS_OBJECT_SPECS.map(({ angularDamping }) => angularDamping))
      .toEqual([0.06, 0.025, 0.08, 0.12, 0.32, 0.28, 0.38]);
  });
});

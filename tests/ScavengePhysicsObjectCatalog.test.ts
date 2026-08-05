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
  });
});

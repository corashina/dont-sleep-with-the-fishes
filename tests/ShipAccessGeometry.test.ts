// Importance: 10/10. Protects ladder order, climb data, and frozen metadata.
import { describe, expect, it } from 'vitest';
import { BufferGeometry, Group, Mesh } from 'three';
import { SHIP_LAYOUT } from '../src/world/shipLayoutData';
import { addShipAccess } from '../src/world/ShipAccessGeometry';
import type { ShipGeometryBuildContext } from '../src/world/ShipGeometryPrimitives';
import { createShipMaterials } from '../src/world/ShipMaterials';

function createTestContext(): ShipGeometryBuildContext {
  return {
    root: new Group(),
    geometries: new Set<BufferGeometry>(),
    shellColliders: [],
    materials: createShipMaterials(),
  };
}

describe('ship access geometry', () => {
  it('preserves ladder names, exact climb data, deep freezing, and ownership', () => {
    const context = createTestContext();
    try {
      const climbZones = addShipAccess(context, SHIP_LAYOUT);

      expect(context.root.children.map(({ name }) => name)).toEqual([
        'ladder:crew-ladder',
      ]);
      expect(context.root.children[0]!.children.map(({ name }) => name)).toEqual([
        'ladder:crew-ladder:side-rail:port',
        'ladder:crew-ladder:grab-rail:port',
        'ladder:crew-ladder:bracket:port:0',
        'ladder:crew-ladder:bracket:port:1',
        'ladder:crew-ladder:bracket:port:2',
        'ladder:crew-ladder:side-rail:starboard',
        'ladder:crew-ladder:grab-rail:starboard',
        'ladder:crew-ladder:bracket:starboard:0',
        'ladder:crew-ladder:bracket:starboard:1',
        'ladder:crew-ladder:bracket:starboard:2',
        ...Array.from(
          { length: 12 },
          (_, index) => `ladder:crew-ladder:rung:${index}`,
        ),
      ]);
      expect(climbZones).toEqual([{
        id: 'crew-ladder',
        climbX: 0,
        climbZ: 3.8850000000000002,
        outwardX: 0,
        outwardZ: -1,
        bottomEyeY: 3.72,
        topEyeY: 7.36,
        topFloor: { minX: -5.75, maxX: 5.75, minZ: 4.5, maxZ: 13.5 },
        bottomEntry: {
          minX: -0.4,
          maxX: 0.4,
          minZ: 3.4200000000000004,
          maxZ: 4.2700000000000005,
        },
        topEntry: { minX: -0.4, maxX: 0.4, minZ: 4.55, maxZ: 5.4 },
        bottomDismount: [0, 3.5700000000000003],
        topDismount: [0, 5.25],
      }]);
      expect(Object.isFrozen(climbZones)).toBe(true);
      expect(Object.isFrozen(climbZones[0])).toBe(true);
      expect(Object.isFrozen(climbZones[0]!.topFloor)).toBe(true);
      expect(Object.isFrozen(climbZones[0]!.bottomEntry)).toBe(true);
      expect(Object.isFrozen(climbZones[0]!.topEntry)).toBe(true);
      expect(Object.isFrozen(climbZones[0]!.bottomDismount)).toBe(true);
      expect(Object.isFrozen(climbZones[0]!.topDismount)).toBe(true);

      let meshCount = 0;
      const meshGeometries = new Set<BufferGeometry>();
      context.root.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        meshCount += 1;
        meshGeometries.add(object.geometry);
        expect(context.geometries.has(object.geometry)).toBe(true);
      });
      expect(meshCount).toBe(22);
      expect(context.geometries).toHaveLength(1);
      expect(context.geometries).toEqual(meshGeometries);
      expect(context.shellColliders).toEqual([]);
    } finally {
      context.geometries.forEach((geometry) => geometry.dispose());
      context.materials.dispose();
    }
  });
});

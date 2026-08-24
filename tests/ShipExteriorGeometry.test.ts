// Importance: 10/10. Protects exterior order, stack data, rails, and ownership.
import { describe, expect, it } from 'vitest';
import { BufferGeometry, Group, Mesh, Vector3 } from 'three';
import { SHIP_LAYOUT } from '../src/world/shipLayoutData';
import { addShipExterior } from '../src/world/ShipExteriorGeometry';
import type { ShipGeometryBuildContext } from '../src/world/ShipGeometryPrimitives';
import { createShipMaterials } from '../src/world/ShipMaterials';
import { SHIP_SHELL_COLLIDERS_BASE } from './fixtures/shipGeometryBase';

function createTestContext(): ShipGeometryBuildContext {
  return {
    root: new Group(),
    geometries: new Set<BufferGeometry>(),
    shellColliders: [],
    materials: createShipMaterials(),
  };
}

const colliderValues = (context: ShipGeometryBuildContext): readonly (readonly number[])[] =>
  context.shellColliders.map((collider) => [
    collider.minX,
    collider.maxX,
    collider.minY,
    collider.maxY,
    collider.minZ,
    collider.maxZ,
    ...(collider.orientedFootprint ? [
      collider.orientedFootprint.centerX,
      collider.orientedFootprint.centerZ,
      collider.orientedFootprint.halfWidth,
      collider.orientedFootprint.halfDepth,
      collider.orientedFootprint.rotationY,
    ] : []),
  ]);

describe('ship exterior geometry', () => {
  it('preserves detail order, stack outlets, rail colliders, and ownership', () => {
    const context = createTestContext();
    try {
      const stackOutlets = addShipExterior(context, SHIP_LAYOUT);

      expect(context.root.children.map(({ name }) => name)).toEqual([
        'bow-stem',
        'stern-transom',
        'stern-transom-waterline',
        'deck-hatch',
        'deck-hatch-timber-panel',
        'anchor-hawse-port',
        'anchor-hawse-starboard',
        'roof-engine-body',
        'roof-engine-service-panel',
        'roof-engine-vent-1',
        'roof-engine-vent-2',
        'roof-engine-vent-3',
        'roof-engine-crank',
        'smokestack-port',
        'smokestack-port-collar',
        'smokestack-starboard',
        'smokestack-starboard-collar',
        'rail-port--19.025-top',
        ...Array.from({ length: 17 }, (_, index) => `rail-port--19.025-post-${index}`),
        'rail-starboard--19.025-top',
        ...Array.from(
          { length: 9 },
          (_, index) => `rail-starboard--19.025-post-${index}`,
        ),
        'rail-starboard-2-top',
        ...Array.from({ length: 8 }, (_, index) => `rail-starboard-2-post-${index}`),
        ...Array.from({ length: 12 }, (_, index) => `rail-bow-top-${index}`),
        ...Array.from({ length: 13 }, (_, index) => `rail-bow-post-${index}`),
        'rail-stern-top',
        'rail-stern-chamfer-port',
        'rail-stern-chamfer-starboard',
        'rail-stern-post-0',
        'rail-stern-post-1',
      ]);
      expect(context.root.getObjectByName('ship-rails')).toBeUndefined();
      expect(stackOutlets).toEqual([
        new Vector3(-1.35, 11.18, -14.024999999999999),
        new Vector3(1.35, 11.18, -14.024999999999999),
      ]);

      let meshCount = 0;
      const meshGeometries = new Set<BufferGeometry>();
      context.root.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        meshCount += 1;
        meshGeometries.add(object.geometry);
        expect(context.geometries.has(object.geometry)).toBe(true);
      });
      expect(meshCount).toBe(84);
      expect(context.geometries).toHaveLength(8);
      expect(context.geometries).toEqual(meshGeometries);
      expect(colliderValues(context)).toEqual(SHIP_SHELL_COLLIDERS_BASE.slice(19));
    } finally {
      context.geometries.forEach((geometry) => geometry.dispose());
      context.materials.dispose();
    }
  });
});

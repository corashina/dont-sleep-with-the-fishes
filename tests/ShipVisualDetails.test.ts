// Protects the cost of decorative machinery and the cabin trim joins.
import { describe, expect, it } from 'vitest';
import { Box3, BufferGeometry, Group, Mesh, Vector3 } from 'three';
import { createShipMaterials } from '../src/world/ShipMaterials';
import { addShipMachineryDetails } from '../src/world/ShipMachineryDetails';
import { SHIP_LAYOUT } from '../src/world/shipLayoutData';
import { addShipCabinTrim } from '../src/world/ShipCabinTrim';

describe('Dorothy visual detail budgets', () => {
  it('keeps decorative machinery below 1200 triangles and three draw calls', () => {
    const root = new Group();
    const geometries = new Set<BufferGeometry>();
    const materials = createShipMaterials();
    try {
      addShipMachineryDetails({ root, geometries, materials, shellColliders: [] }, SHIP_LAYOUT,
        [new Vector3(-1.35, 11.18, -14.025), new Vector3(1.35, 11.18, -14.025)]);
      const meshes = root.children as Mesh[];
      const triangles = meshes.reduce((total, mesh) => total
        + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3, 0);
      expect(triangles).toBeLessThanOrEqual(1200);
      expect(meshes.length).toBeLessThanOrEqual(3);
    } finally {
      geometries.forEach((geometry) => geometry.dispose());
      materials.dispose();
    }
  });

  it('joins every corner post to continuous roof trim, including wheelhouse chamfers', () => {
    const root = new Group();
    const geometries = new Set<BufferGeometry>();
    const materials = createShipMaterials();
    try {
      for (const zone of SHIP_LAYOUT.zones.filter(({ enclosed }) => enclosed)) {
        addShipCabinTrim({ root, geometries, materials, shellColliders: [] }, zone);
        const fascia = root.getObjectByName(`cabin-roof-trim:${zone.id}`) as Mesh;
        const corners = root.getObjectByName(`cabin-corner-trim:${zone.id}`) as Mesh;
        const roofBounds = new Box3().setFromObject(fascia);
        const cornerBounds = new Box3().setFromObject(corners);
        expect(cornerBounds.max.y).toBeGreaterThan(roofBounds.min.y);
        expect(cornerBounds.max.y).toBeLessThan(roofBounds.max.y);
        expect(fascia.material).toBe(corners.material);
        expect(root.children.filter(({ name }) => name === fascia.name)).toHaveLength(1);
        // Every corner must sit below the ring's footprint, with no protruding cap.
        const positions = corners.geometry.getAttribute('position');
        for (let index = 0; index < positions.count; index += 1) {
          expect(positions.getX(index)).toBeGreaterThanOrEqual(roofBounds.min.x - 1e-5);
          expect(positions.getX(index)).toBeLessThanOrEqual(roofBounds.max.x + 1e-5);
          expect(positions.getZ(index)).toBeGreaterThanOrEqual(roofBounds.min.z - 1e-5);
          expect(positions.getZ(index)).toBeLessThanOrEqual(roofBounds.max.z + 1e-5);
        }
      }
    } finally {
      geometries.forEach((geometry) => geometry.dispose());
      materials.dispose();
    }
  });

});

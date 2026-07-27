import { Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { SHIP_LAYOUT, SHIP_SAIL_CLOTH_MIN_Y } from '../src/world/ShipLayout';
import { createShipMaterials } from '../src/world/ShipMaterials';
import { createShipRigging } from '../src/world/ShipRigging';

describe('ship rigging', () => {
  it('builds one central mast with two distinct tensioned sails', () => {
    const materials = createShipMaterials();
    const rigging = createShipRigging(materials, SHIP_LAYOUT.rigging);
    try {
      expect(rigging.root.getObjectByName('mast:mainmast')).toBeDefined();
      expect(rigging.root.getObjectByName('boom:mainmast')).toBeDefined();
      expect(rigging.root.getObjectByName('stay:mainmast:fore')).toBeDefined();
      expect(rigging.root.getObjectByName('stay:mainmast:aft')).toBeDefined();
      expect(rigging.root.getObjectByName('shroud:mainmast:port')).toBeDefined();
      expect(rigging.root.getObjectByName('shroud:mainmast:starboard')).toBeDefined();
      expect(rigging.root.getObjectByName('shroud-attachment:mainmast:port')).toBeDefined();
      expect(rigging.root.getObjectByName('shroud-attachment:mainmast:starboard')).toBeDefined();
      expect(rigging.root.getObjectByName('sail:mainsail')).toBeInstanceOf(Mesh);
      expect(rigging.root.getObjectByName('sail:staysail')).toBeInstanceOf(Mesh);
      expect(rigging.colliders).toHaveLength(1);
    } finally {
      rigging.disposeGeometry();
      materials.dispose();
    }
  });

  it('adds canvas-edge hems, panel seams, and corner patches to each sail', () => {
    const materials = createShipMaterials();
    const rigging = createShipRigging(materials, SHIP_LAYOUT.rigging);
    try {
      for (const id of ['mainsail', 'staysail']) {
        const sail = rigging.root.getObjectByName(`sail:${id}`) as Mesh;
        expect(sail.geometry.getAttribute('position').count).toBeGreaterThanOrEqual(5);
        ['luff', 'foot', 'leech-1', 'leech-2'].forEach((edge) => {
          const hem = rigging.root.getObjectByName(`sail-hem:${id}:${edge}`) as Mesh;
          expect(hem.material, `${id}:${edge}`).toBe(materials.canvasEdge);
          expect(hem.parent, `${id}:${edge}:parent`).toBe(sail);
        });
        for (let index = 1; index <= 2; index += 1) {
          const seam = rigging.root.getObjectByName(`sail-panel-seam:${id}:${index}`) as Mesh;
          expect(seam.material, `${id}:seam-${index}`).toBe(materials.canvasEdge);
        }
        ['tack', 'clew'].forEach((corner) => {
          const patch = rigging.root.getObjectByName(`sail-corner-patch:${id}:${corner}`) as Mesh;
          expect(patch.material, `${id}:${corner}`).toBe(materials.canvasEdge);
        });
      }
    } finally {
      rigging.disposeGeometry();
      materials.dispose();
    }
  });

  it('keeps every sail vertex above cloth clearance and adds billow depth', () => {
    const materials = createShipMaterials();
    const rigging = createShipRigging(materials, SHIP_LAYOUT.rigging);
    try {
      for (const id of ['mainsail', 'staysail']) {
        const sail = rigging.root.getObjectByName(`sail:${id}`) as Mesh;
        const position = sail.geometry.getAttribute('position');
        const ys = Array.from({ length: position.count }, (_, index) => position.getY(index));
        const xs = Array.from({ length: position.count }, (_, index) => position.getX(index));
        expect(Math.min(...ys)).toBeGreaterThanOrEqual(SHIP_SAIL_CLOTH_MIN_Y);
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.1);
      }
    } finally {
      rigging.disposeGeometry();
      materials.dispose();
    }
  });

  it('animates both sails and restores their neutral rotations for reduced motion', () => {
    const materials = createShipMaterials();
    const rigging = createShipRigging(materials, SHIP_LAYOUT.rigging);
    try {
      const sails = ['mainsail', 'staysail'].map((id) =>
        rigging.root.getObjectByName(`sail:${id}`) as Mesh);
      const neutralRotations = sails.map((sail) => sail.rotation.z);

      rigging.update(0.1, false);
      sails.forEach((sail, index) =>
        expect(sail.rotation.z).not.toBe(neutralRotations[index]));

      rigging.update(0.1, true);
      sails.forEach((sail, index) =>
        expect(sail.rotation.z).toBe(neutralRotations[index]));
    } finally {
      rigging.disposeGeometry();
      materials.dispose();
    }
  });

  it('disposes every unique rig geometry exactly once', () => {
    const materials = createShipMaterials();
    const rigging = createShipRigging(materials, SHIP_LAYOUT.rigging);
    const geometries = new Set<Mesh['geometry']>();
    rigging.root.traverse((object) => {
      if (object instanceof Mesh) geometries.add(object.geometry);
    });
    const disposeCounts = new Map([...geometries].map((geometry) => [geometry, 0]));
    geometries.forEach((geometry) => geometry.addEventListener('dispose', () => {
      disposeCounts.set(geometry, disposeCounts.get(geometry)! + 1);
    }));

    try {
      rigging.disposeGeometry();
      rigging.disposeGeometry();
      expect(disposeCounts.size).toBeGreaterThan(3);
      expect([...disposeCounts.values()].every((count) => count === 1)).toBe(true);
    } finally {
      rigging.disposeGeometry();
      materials.dispose();
    }
  });
});

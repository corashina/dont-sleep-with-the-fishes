import { Mesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { SHIP_LAYOUT, SHIP_SAIL_CLOTH_MIN_Y } from '../src/world/ShipLayout';
import { createShipMaterials } from '../src/world/ShipMaterials';
import { createShipRigging } from '../src/world/ShipRigging';

describe('ship rigging', () => {
  it('builds one central mast with two distinct furled sails', () => {
    const materials = createShipMaterials();
    const rigging = createShipRigging(materials, SHIP_LAYOUT.rigging);
    try {
      expect(rigging.root.getObjectByName('mast:mainmast')).toBeDefined();
      expect(rigging.root.getObjectByName('boom:mainmast')).toBeDefined();
      expect(rigging.root.getObjectByName('stay:mainmast:fore')).toBeUndefined();
      expect(rigging.root.getObjectByName('stay:mainmast:aft')).toBeUndefined();
      expect(rigging.root.getObjectByName('shroud:mainmast:port')).toBeUndefined();
      expect(rigging.root.getObjectByName('shroud:mainmast:starboard')).toBeUndefined();
      expect(rigging.root.getObjectByName('sail:mainsail')).toBeInstanceOf(Mesh);
      expect(rigging.root.getObjectByName('sail:staysail')).toBeInstanceOf(Mesh);
      expect(SHIP_LAYOUT.rigging.masts[0]!.sails.every(({ furled }) => furled)).toBe(true);
      const mast = SHIP_LAYOUT.rigging.masts[0]!;
      const expectedSailMountOffset = mast.baseDiameter / 2 + 0.11 / 2;
      for (const id of ['mainsail', 'staysail']) {
        const sail = rigging.root.getObjectByName(`sail:${id}`) as Mesh;
        expect(sail.rotation.y).toBe(Math.PI / 2);
        expect(sail.position.z).toBeCloseTo(expectedSailMountOffset);
      }
      const boom = rigging.root.getObjectByName('boom:mainmast') as Mesh;
      expect(boom.position.z - boom.scale.z / 2).toBeCloseTo(mast.baseDiameter / 2);
      expect(rigging.colliders).toHaveLength(1);

      expect(mast.stays).toHaveLength(4);
      const expectedAttachmentY = mast.height - 0.18;
      mast.stays.forEach(({ id, anchor }) => {
        const line = rigging.root.getObjectByName(`stay:mainmast:${id}`) as Mesh;
        const fitting = rigging.root.getObjectByName(`stay-attachment:mainmast:${id}`);
        expect(line, id).toBeInstanceOf(Mesh);
        expect(fitting, id).toBeInstanceOf(Mesh);
        line.updateMatrix();
        const endpoints = [
          new Vector3(0, -0.5, 0).applyMatrix4(line.matrix),
          new Vector3(0, 0.5, 0).applyMatrix4(line.matrix),
        ];
        expect(Math.max(...endpoints.map(({ y }) => y))).toBeCloseTo(expectedAttachmentY);
        expect(Math.min(...endpoints.map((point) => point.distanceTo(new Vector3(...anchor)))))
          .toBeCloseTo(0);
      });
    } finally {
      rigging.disposeGeometry();
      materials.dispose();
    }
  });

  it('binds each compact cloth roll with irregular rope ties', () => {
    const materials = createShipMaterials();
    const rigging = createShipRigging(materials, SHIP_LAYOUT.rigging);
    try {
      for (const id of ['mainsail', 'staysail']) {
        const sail = rigging.root.getObjectByName(`sail:${id}`) as Mesh;
        expect(sail.geometry.name).toBe(`furled-sail-geometry:${id}`);
        expect(sail.geometry.getAttribute('position').count).toBeGreaterThan(50);
        const position = sail.geometry.getAttribute('position');
        const nearestMastZ = Math.min(
          ...Array.from({ length: position.count }, (_, index) =>
            Math.abs(position.getZ(index))),
        );
        expect(nearestMastZ).toBeCloseTo(
          SHIP_LAYOUT.rigging.masts[0]!.baseDiameter / 2,
        );
        for (let index = 1; index <= 5; index += 1) {
          const tie = rigging.root.getObjectByName(`sail-furl-tie:${id}:${index}`) as Mesh;
          const tail = rigging.root.getObjectByName(`sail-furl-tail:${id}:${index}`) as Mesh;
          expect(tie.material, `${id}:tie-${index}`).toBe(materials.rope);
          expect(tie.parent, `${id}:tie-${index}:parent`).toBe(sail);
          expect(tail.material, `${id}:tail-${index}`).toBe(materials.rope);
          expect(tail.parent, `${id}:tail-${index}:parent`).toBe(sail);
        }
      }
    } finally {
      rigging.disposeGeometry();
      materials.dispose();
    }
  });

  it('keeps every rolled sail vertex above cloth clearance with a narrow profile', () => {
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
        expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.6);
      }
    } finally {
      rigging.disposeGeometry();
      materials.dispose();
    }
  });

  it('keeps both furled sails settled against their ties', () => {
    const materials = createShipMaterials();
    const rigging = createShipRigging(materials, SHIP_LAYOUT.rigging);
    try {
      const sails = ['mainsail', 'staysail'].map((id) =>
        rigging.root.getObjectByName(`sail:${id}`) as Mesh);
      const neutralRotations = sails.map((sail) => sail.rotation.z);

      rigging.update(0.1);
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

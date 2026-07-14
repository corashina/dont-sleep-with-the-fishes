import { describe, expect, it } from 'vitest';
import { createShipFurniture } from '../src/world/ShipFurniture';
import { createShipMaterials } from '../src/world/ShipMaterials';
import { validateShipItemAnchors } from '../src/world/ShipItemPlacement';

describe('ship furniture', () => {
  it('builds each approved furniture family and a surplus of valid anchors', () => {
    const materials = createShipMaterials();
    const build = createShipFurniture(materials);
    ['bunk', 'desk', 'chair', 'wall-shelf', 'locker', 'workbench', 'equipment-rack', 'cargo-crate']
      .forEach((name) => expect(build.root.getObjectByName(name)).toBeDefined());
    expect(build.anchors.length).toBeGreaterThanOrEqual(24);
    expect(() => validateShipItemAnchors(build.anchors)).not.toThrow();
    expect(build.anchors.filter(({ emergency }) => emergency)).toHaveLength(4);
    expect(new Set(build.anchors.flatMap(({ categories }) => categories))).toEqual(new Set([
      'foodWater', 'medicalEmergency', 'toolsRepair', 'fishingDiving',
    ]));
    build.disposeGeometry();
    materials.dispose();
  });

  it('keeps named route corridors free of furniture colliders', () => {
    const materials = createShipMaterials();
    const build = createShipFurniture(materials);
    const corridorPoints = build.routeClearancePoints;
    expect(corridorPoints.length).toBeGreaterThanOrEqual(12);
    corridorPoints.forEach((point) => expect(build.colliders.every((box) =>
      point.x < box.minX - 0.35 || point.x > box.maxX + 0.35 ||
      point.z < box.minZ - 0.35 || point.z > box.maxZ + 0.35)).toBe(true));
    build.disposeGeometry();
    materials.dispose();
  });
});

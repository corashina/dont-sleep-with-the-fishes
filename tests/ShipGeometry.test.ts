import { Box3, Mesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createShipGeometry, FREIGHTER_DIMENSIONS } from '../src/world/ShipGeometry';
import { createShipMaterials } from '../src/world/ShipMaterials';

describe('freighter geometry', () => {
  it('builds the approved single-level freighter shell and named zones', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const bounds = new Box3().setFromObject(build.root);
    expect(FREIGHTER_DIMENSIONS).toEqual({ width: 12.5, length: 36, deckY: 2 });
    expect(bounds.max.x - bounds.min.x).toBeGreaterThanOrEqual(12);
    expect(bounds.max.z - bounds.min.z).toBeGreaterThanOrEqual(35);
    expect([...build.zoneCenters.keys()].sort()).toEqual([
      'cargoDeck', 'crewCabin', 'lifeboatStation', 'storageRoom', 'wheelhouse',
    ]);
    expect(build.root.getObjectByName('smokestack-port')).toBeInstanceOf(Mesh);
    expect(build.root.getObjectByName('smokestack-starboard')).toBeInstanceOf(Mesh);
    expect(build.root.getObjectByName('alarm-beacon')).toBeInstanceOf(Mesh);
    expect(build.waterExclusion).toEqual({ halfWidth: 6.05, halfLength: 17.6 });
    build.disposeGeometry();
    materials.dispose();
  });

  it('keeps both loop doorways and the lifeboat rail opening clear', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const clearPoints = [
      new Vector3(-3.8, 3.72, 5.2),
      new Vector3(3.8, 3.72, 5.2),
      new Vector3(-4.7, 3.72, -8.2),
      new Vector3(4.7, 3.72, -8.2),
      new Vector3(5.9, 3.72, -6.5),
    ];
    clearPoints.forEach((point) => expect(build.shellColliders.some((box) =>
      point.x >= box.minX && point.x <= box.maxX &&
      point.y >= box.minY && point.y <= box.maxY &&
      point.z >= box.minZ && point.z <= box.maxZ)).toBe(false));
    build.disposeGeometry();
    materials.dispose();
  });
});

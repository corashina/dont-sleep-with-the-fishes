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
    expect([...build.zoneCenters]).toEqual([
      ['crewCabin', new Vector3(0, 3.72, 7.5)],
      ['wheelhouse', new Vector3(0, 3.72, 13.2)],
      ['cargoDeck', new Vector3(0, 3.72, -1.5)],
      ['storageRoom', new Vector3(0, 3.72, -9.2)],
      ['lifeboatStation', new Vector3(5.4, 3.72, -6.5)],
    ]);
    expect(build.stackOutlets).toEqual([
      new Vector3(-1.35, 7.1, -13),
      new Vector3(1.35, 7.1, -13),
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

  it('leaves the wheelhouse aft doorway visibly open', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const doorwayCenter = new Vector3(0, 3.72, 11.4);
    const blockers: string[] = [];
    build.root.traverse((object) => {
      if (object instanceof Mesh && new Box3().setFromObject(object).containsPoint(doorwayCenter)) {
        blockers.push(object.name);
      }
    });
    expect(blockers).toEqual([]);
    build.disposeGeometry();
    materials.dispose();
  });

  it('uses dark material for every interior plank grain strip', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const interiorGrain = build.root.children.filter((object): object is Mesh =>
      object instanceof Mesh && object.name.includes('-floor-grain-'));
    expect(interiorGrain.length).toBeGreaterThan(0);
    interiorGrain.forEach((mesh) => expect(mesh.material).toBe(materials.darkMetal));
    build.disposeGeometry();
    materials.dispose();
  });
});

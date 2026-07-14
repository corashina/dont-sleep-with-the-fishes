import { Box3, Mesh, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { resolveLocalMovement } from '../src/player/collisions';
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

  it.each([
    new Vector3(-6.2, 3.72, 0),
    new Vector3(6.2, 3.72, 4),
  ])('blocks player-height passage through the outer rail at %s', (point) => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    expect(build.shellColliders.some((box) =>
      point.x >= box.minX && point.x <= box.maxX &&
      point.y >= box.minY && point.y <= box.maxY &&
      point.z >= box.minZ && point.z <= box.maxZ)).toBe(true);
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

  it('authors a visible port-side wheelhouse doorway and collides every remaining pane', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const sideDoorCenter = new Vector3(-3.9, 3.72, 12.8);
    const visualBlockers: string[] = [];
    build.root.traverse((object) => {
      if (object instanceof Mesh && new Box3().setFromObject(object).containsPoint(sideDoorCenter)) {
        visualBlockers.push(object.name);
      }
    });
    expect(visualBlockers).toEqual([]);
    expect(build.shellColliders.every((box) => !(
      sideDoorCenter.x >= box.minX && sideDoorCenter.x <= box.maxX
      && sideDoorCenter.y >= box.minY && sideDoorCenter.y <= box.maxY
      && sideDoorCenter.z >= box.minZ && sideDoorCenter.z <= box.maxZ
    ))).toBe(true);

    const windows: Mesh[] = [];
    build.root.traverse((object) => {
      if (object instanceof Mesh && object.name.includes('-window-')) windows.push(object);
    });
    expect(windows.length).toBeGreaterThanOrEqual(6);
    windows.forEach((window) => {
      const center = new Box3().setFromObject(window).getCenter(new Vector3());
      center.y = 3.72;
      expect(build.shellColliders.some((box) =>
        center.x >= box.minX && center.x <= box.maxX
        && center.y >= box.minY && center.y <= box.maxY
        && center.z >= box.minZ && center.z <= box.maxZ), window.name).toBe(true);
    });

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

  it('reuses repeated shell box geometry per build and disposes it once', () => {
    const materials = createShipMaterials();
    const first = createShipGeometry(materials);
    const second = createShipGeometry(materials);
    const firstPlanks = ['deck-plank-0', 'deck-plank-1', 'deck-plank-2']
      .map((name) => first.root.getObjectByName(name) as Mesh);
    const secondPlank = second.root.getObjectByName('deck-plank-0') as Mesh;

    expect(new Set(firstPlanks.map(({ geometry }) => geometry)).size).toBe(1);
    expect(secondPlank.geometry).not.toBe(firstPlanks[0]!.geometry);
    const dispose = vi.spyOn(firstPlanks[0]!.geometry, 'dispose');
    first.disposeGeometry();
    first.disposeGeometry();
    expect(dispose).toHaveBeenCalledTimes(1);

    second.disposeGeometry();
    materials.dispose();
  });

  it.each([
    ['bow', 15.8],
    ['stern', -16.7],
  ] as const)('adds an exact visible and colliding %s transverse railing', (end, z) => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const top = build.root.getObjectByName(`rail-${end}-top`) as Mesh;

    expect(top).toBeInstanceOf(Mesh);
    const bounds = new Box3().setFromObject(top);
    const size = bounds.getSize(new Vector3());
    expect(size.x).toBeCloseTo(12);
    expect(size.y).toBeCloseTo(0.14);
    expect(size.z).toBeCloseTo(0.2);
    expect(bounds.getCenter(new Vector3()).z).toBeCloseTo(z);
    expect(build.shellColliders).toContainEqual({
      minX: -6,
      maxX: 6,
      minY: 2.14,
      maxY: 3.94,
      minZ: z - 0.125,
      maxZ: z + 0.125,
    });
    const blocked = resolveLocalMovement(
      { x: 0, y: 3.72, z: z - Math.sign(z) * 0.8 },
      { x: 0, y: 3.72, z: z + Math.sign(z) * 0.8 },
      0.35,
      build.shellColliders,
    );
    expect(Math.abs(blocked.z - z)).toBeCloseTo(0.475);
    const lifeboatGap = resolveLocalMovement(
      { x: 5.4, y: 3.72, z: -6.5 },
      { x: 6.4, y: 3.72, z: -6.5 },
      0.35,
      build.shellColliders,
    );
    expect(lifeboatGap.x).toBeCloseTo(6.4);

    build.disposeGeometry();
    materials.dispose();
  });
});

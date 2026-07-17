import { Box3, CylinderGeometry, Mesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { resolveLocalMovement } from '../src/player/collisions';
import { createShipGeometry } from '../src/world/ShipGeometry';
import {
  FREIGHTER_DIMENSIONS,
  SHIP_LAYOUT,
  type ShipDoorSpec,
  type ShipLayoutSpec,
} from '../src/world/ShipLayout';
import { createShipMaterials } from '../src/world/ShipMaterials';

describe('freighter geometry', () => {
  interface PointXZ {
    x: number;
    z: number;
  }

  type TriangleXZ = readonly [PointXZ, PointXZ, PointXZ];

  const signedAreaXZ = (polygon: readonly PointXZ[]): number => polygon.reduce(
    (area, point, index) => {
      const next = polygon[(index + 1) % polygon.length]!;
      return area + point.x * next.z - next.x * point.z;
    },
    0,
  ) / 2;

  const edgeSide = (start: PointXZ, end: PointXZ, point: PointXZ): number =>
    (end.x - start.x) * (point.z - start.z)
      - (end.z - start.z) * (point.x - start.x);

  const triangleIntersectionAreaXZ = (subject: TriangleXZ, clip: TriangleXZ): number => {
    let polygon: PointXZ[] = [...subject];
    const clipOrientation = Math.sign(signedAreaXZ(clip)) || 1;
    const epsilon = 1e-10;

    for (let edgeIndex = 0; edgeIndex < clip.length && polygon.length > 0; edgeIndex += 1) {
      const edgeStart = clip[edgeIndex]!;
      const edgeEnd = clip[(edgeIndex + 1) % clip.length]!;
      const input = polygon;
      polygon = [];

      for (let pointIndex = 0; pointIndex < input.length; pointIndex += 1) {
        const current = input[pointIndex]!;
        const previous = input[(pointIndex + input.length - 1) % input.length]!;
        const currentSide = edgeSide(edgeStart, edgeEnd, current);
        const previousSide = edgeSide(edgeStart, edgeEnd, previous);
        const currentInside = clipOrientation * currentSide >= -epsilon;
        const previousInside = clipOrientation * previousSide >= -epsilon;

        if (currentInside !== previousInside) {
          const denominator = previousSide - currentSide;
          const amount = Math.abs(denominator) <= epsilon ? 0 : previousSide / denominator;
          polygon.push({
            x: previous.x + (current.x - previous.x) * amount,
            z: previous.z + (current.z - previous.z) * amount,
          });
        }
        if (currentInside) polygon.push(current);
      }
    }

    return Math.abs(signedAreaXZ(polygon));
  };

  const meshTrianglesXZ = (mesh: Mesh): TriangleXZ[] => {
    mesh.updateMatrixWorld(true);
    const positions = mesh.geometry.getAttribute('position');
    const indices = mesh.geometry.getIndex();
    const indexCount = indices?.count ?? positions.count;
    const triangles: TriangleXZ[] = [];
    for (let index = 0; index < indexCount; index += 3) {
      const vertex = (offset: number): PointXZ => {
        const positionIndex = indices?.getX(index + offset) ?? index + offset;
        const world = mesh.localToWorld(new Vector3().fromBufferAttribute(positions, positionIndex));
        return { x: world.x, z: world.z };
      };
      triangles.push([vertex(0), vertex(1), vertex(2)]);
    }
    return triangles;
  };

  const playerY = FREIGHTER_DIMENSIONS.deckY + 1.5;
  const pointInCollider = (
    build: ReturnType<typeof createShipGeometry>,
    point: Vector3,
  ): boolean => build.shellColliders.some((box) =>
    point.x >= box.minX && point.x <= box.maxX
    && point.y >= box.minY && point.y <= box.maxY
    && point.z >= box.minZ && point.z <= box.maxZ);

  const wallRenderBlockers = (
    build: ReturnType<typeof createShipGeometry>,
    point: Vector3,
  ): string[] => {
    const blockers: string[] = [];
    build.root.updateMatrixWorld(true);
    build.root.traverse((object) => {
      if (!(object instanceof Mesh)
        || !/(wall|sill|header|pillar|window|door-side)/.test(object.name)) return;
      if (new Box3().setFromObject(object).containsPoint(point)) blockers.push(object.name);
    });
    return blockers;
  };

  const doorAxisSamples = (door: ShipDoorSpec): readonly number[] => {
    const center = door.orientation === 'side' ? door.center[1] : door.center[0];
    return [center, center - door.width / 2 + 0.35, center + door.width / 2 - 0.35];
  };

  const doorPoint = (door: ShipDoorSpec, axis: number): Vector3 => door.orientation === 'side'
    ? new Vector3(door.center[0], playerY, axis)
    : new Vector3(axis, playerY, door.center[1]);

  const railColliderAt = (
    build: ReturnType<typeof createShipGeometry>,
    x: number,
    z: number,
    layout: ShipLayoutSpec = SHIP_LAYOUT,
  ) => build.shellColliders.find((box) =>
    x >= box.minX && x <= box.maxX
    && z >= box.minZ && z <= box.maxZ
    && Math.abs(box.minY - FREIGHTER_DIMENSIONS.deckY) < 1e-8
    && Math.abs(box.maxY - (FREIGHTER_DIMENSIONS.deckY + layout.rail.height)) < 1e-8);

  it('builds the approved single-level freighter shell and named zones', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const bounds = new Box3().setFromObject(build.root);
    expect(FREIGHTER_DIMENSIONS).toEqual({ width: 12.5, length: 36, deckY: 2.22 });
    expect(bounds.max.x - bounds.min.x).toBeGreaterThanOrEqual(12);
    expect(bounds.max.z - bounds.min.z).toBeGreaterThanOrEqual(35);
    expect([...build.zoneCenters.keys()].sort()).toEqual([
      'cargoDeck', 'crewCabin', 'lifeboatStation', 'storageWorkroom', 'wheelhouse',
    ]);
    expect([...build.zoneCenters]).toEqual(SHIP_LAYOUT.zones.map((zone) => [
      zone.id,
      new Vector3(
        (zone.bounds.minX + zone.bounds.maxX) / 2,
        FREIGHTER_DIMENSIONS.deckY + 1.5,
        (zone.bounds.minZ + zone.bounds.maxZ) / 2,
      ),
    ]));
    const machineryZ = (SHIP_LAYOUT.machineryClosure.minZ + SHIP_LAYOUT.machineryClosure.maxZ) / 2;
    expect(build.stackOutlets).toEqual([
      new Vector3(-1.35, 7.1, machineryZ),
      new Vector3(1.35, 7.1, machineryZ),
    ]);
    expect(build.root.getObjectByName('smokestack-port')).toBeInstanceOf(Mesh);
    expect(build.root.getObjectByName('smokestack-starboard')).toBeInstanceOf(Mesh);
    expect(build.root.getObjectByName('alarm-beacon')).toBeInstanceOf(Mesh);
    expect(build.waterExclusion).toEqual({ halfWidth: 6.05, halfLength: 17.6 });
    build.disposeGeometry();
    materials.dispose();
  });

  it('grounds both smokestacks and collars on the machinery island', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const island = build.root.getObjectByName('machinery-island');
    expect(island).toBeInstanceOf(Mesh);
    const islandBounds = new Box3().setFromObject(island!);
    const islandTop = islandBounds.max.y;
    expect(islandBounds.min.x).toBeCloseTo(-2.6);
    expect(islandBounds.max.x).toBeCloseTo(2.6);
    expect(islandBounds.max.x - islandBounds.min.x).toBeCloseTo(5.2);
    const machineryCollider = build.shellColliders.find((box) =>
      Math.abs(box.minX - -2.6) < 1e-8
      && Math.abs(box.maxX - 2.6) < 1e-8
      && Math.abs(box.minZ - SHIP_LAYOUT.machineryClosure.minZ) < 1e-8
      && Math.abs(box.maxZ - SHIP_LAYOUT.machineryClosure.maxZ) < 1e-8);
    expect(machineryCollider).toBeDefined();

    (['port', 'starboard'] as const).forEach((side, index) => {
      const stack = build.root.getObjectByName(`smokestack-${side}`);
      const collar = build.root.getObjectByName(`smokestack-${side}-collar`);
      expect(stack, side).toBeInstanceOf(Mesh);
      expect(collar, side).toBeInstanceOf(Mesh);
      const stackBounds = new Box3().setFromObject(stack!);
      const collarBounds = new Box3().setFromObject(collar!);
      expect(collar!.geometry).toBeInstanceOf(CylinderGeometry);
      const collarRadius = (collar!.geometry as CylinderGeometry).parameters.radiusTop;

      expect(stackBounds.min.y, `${side} stack base`).toBeCloseTo(islandTop);
      expect(collarBounds.min.y, `${side} collar base`).toBeCloseTo(islandTop);
      expect(stackBounds.max.y, `${side} outlet`).toBeCloseTo(build.stackOutlets[index]!.y);
      const outerEdgeClearance = side === 'port'
        ? collar!.position.x - collarRadius - islandBounds.min.x
        : islandBounds.max.x - collar!.position.x - collarRadius;
      expect(outerEdgeClearance, `${side} collar outer-edge clearance`).toBeCloseTo(0.53);
    });

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
    new Vector3(-6, 2.72, 0),
    new Vector3(6, 2.72, 4),
  ])('blocks passage through the waist-height outer rail at %s', (point) => {
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

  it('builds exactly five non-overlapping finished floor surfaces at deck height', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const expectedNames = [
      'floor-crewCabin',
      'floor-wheelhouse',
      'floor-cargoDeck',
      'floor-storageWorkroom',
      'floor-lifeboatStation',
    ] as const;
    const descendantMeshes: Mesh[] = [];
    build.root.traverse((object) => {
      if (object instanceof Mesh) descendantMeshes.push(object);
    });
    const floors = descendantMeshes.filter(({ name }) => name.startsWith('floor-'));

    expect(floors).toHaveLength(expectedNames.length);
    expect(floors.map(({ name }) => name).sort()).toEqual([...expectedNames].sort());
    expect(descendantMeshes.filter(({ name }) => /plank|grain/i.test(name))).toEqual([]);

    build.root.updateMatrixWorld(true);
    floors.forEach((floor) => {
      const bounds = new Box3().setFromObject(floor);
      expect(bounds.min.y).toBeCloseTo(2.22);
      expect(bounds.max.y).toBeCloseTo(2.22);
    });

    const floorTriangles = floors.map((floor) => meshTrianglesXZ(floor));
    for (let first = 0; first < floors.length; first += 1) {
      for (let second = first + 1; second < floors.length; second += 1) {
        const intersectsInPositiveArea = floorTriangles[first]!.some((firstTriangle) =>
          floorTriangles[second]!.some((secondTriangle) =>
            triangleIntersectionAreaXZ(firstTriangle, secondTriangle) > 1e-8));
        expect(
          intersectsInPositiveArea,
          `${floors[first]!.name} intersects ${floors[second]!.name} in positive X/Z area`,
        ).toBe(false);
      }
    }

    build.disposeGeometry();
    materials.dispose();
  });

  it.each(SHIP_LAYOUT.doors)('$id leaves all player-radius doorway samples open and keeps both jambs solid', (door) => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);

    doorAxisSamples(door).forEach((axis) => {
      const point = doorPoint(door, axis);
      expect(pointInCollider(build, point), `${door.id} collider at ${axis}`).toBe(false);
      expect(wallRenderBlockers(build, point), `${door.id} render at ${axis}`).toEqual([]);
    });

    const center = door.orientation === 'side' ? door.center[1] : door.center[0];
    [center - door.width / 2 - 0.02, center + door.width / 2 + 0.02]
      .forEach((axis) => {
        const point = doorPoint(door, axis);
        expect(pointInCollider(build, point), `${door.id} jamb collider at ${axis}`).toBe(true);
        expect(wallRenderBlockers(build, point).length, `${door.id} jamb render at ${axis}`)
          .toBeGreaterThan(0);
      });

    build.disposeGeometry();
    materials.dispose();
  });

  it('seals every enclosed-room corner visually and physically', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);

    SHIP_LAYOUT.zones.filter(({ enclosed }) => enclosed).forEach((zone) => {
      zone.polygon.forEach(([x, z], index) => {
        const name = `${zone.id}-corner-${index}`;
        const cap = build.root.getObjectByName(name);
        expect(cap, name).toBeInstanceOf(Mesh);
        expect(new Box3().setFromObject(cap!).containsPoint(new Vector3(x, playerY, z)), name)
          .toBe(true);
        expect(pointInCollider(build, new Vector3(x, playerY, z)), name).toBe(true);
      });
    });

    build.disposeGeometry();
    materials.dispose();
  });

  it('aligns every enclosed wall, corner, and roof at the wheelhouse height', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const roofOverhang = 0.175;

    SHIP_LAYOUT.zones.filter(({ enclosed }) => enclosed).forEach((zone) => {
      const roof = build.root.getObjectByName(`${zone.id}-roof`);
      expect(roof, zone.id).toBeInstanceOf(Mesh);
      const bounds = new Box3().setFromObject(roof!);

      expect(bounds.min.x, `${zone.id} min x`).toBeCloseTo(zone.bounds.minX - roofOverhang);
      expect(bounds.max.x, `${zone.id} max x`).toBeCloseTo(zone.bounds.maxX + roofOverhang);
      expect(bounds.min.z, `${zone.id} min z`).toBeCloseTo(zone.bounds.minZ - roofOverhang);
      expect(bounds.max.z, `${zone.id} max z`).toBeCloseTo(zone.bounds.maxZ + roofOverhang);
      expect.soft(bounds.min.y, `${zone.id} roof bottom`).toBeCloseTo(5.62);
      expect.soft(bounds.max.y, `${zone.id} roof top`).toBeCloseTo(5.86);

      zone.polygon.forEach((_, index) => {
        const cornerName = `${zone.id}-corner-${index}`;
        const corner = build.root.getObjectByName(cornerName);
        expect(corner, cornerName).toBeInstanceOf(Mesh);
        expect.soft(new Box3().setFromObject(corner!).max.y, `${cornerName} top`).toBeCloseTo(5.62);
      });
    });

    ['crew-cabin-wall-', 'storage-workroom-wall-'].forEach((prefix) => {
      const solidWalls: Mesh[] = [];
      build.root.traverse((object) => {
        if (object instanceof Mesh && object.name.startsWith(prefix)) solidWalls.push(object);
      });
      expect(solidWalls.length, prefix).toBeGreaterThan(0);
      solidWalls.forEach((wall) => {
        expect.soft(new Box3().setFromObject(wall).max.y, `${wall.name} top`).toBeCloseTo(5.62);
      });
    });

    build.disposeGeometry();
    materials.dispose();
  });

  it('uses one compact stern island and keeps every end-deck target open', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const closure = SHIP_LAYOUT.machineryClosure;
    const island = build.root.getObjectByName('machinery-island');
    expect(island).toBeInstanceOf(Mesh);
    expect(new Box3().setFromObject(island!).min.x).toBeCloseTo(closure.minX);
    expect(new Box3().setFromObject(island!).max.x).toBeCloseTo(closure.maxX);
    expect(build.root.getObjectByName('machinery-closure-port')).toBeUndefined();
    expect(build.root.getObjectByName('machinery-closure-center')).toBeUndefined();
    expect(build.root.getObjectByName('machinery-closure-starboard')).toBeUndefined();

    const cargoFloor = build.root.getObjectByName('floor-cargoDeck');
    expect(cargoFloor).toBeInstanceOf(Mesh);
    const cargoBounds = new Box3().setFromObject(cargoFloor!);
    SHIP_LAYOUT.targets.filter(({ kind }) => kind === 'endDeck').forEach((target) => {
      const deckPoint = new Vector3(target.position[0], FREIGHTER_DIMENSIONS.deckY, target.position[1]);
      expect(cargoBounds.containsPoint(deckPoint), target.id).toBe(true);
      expect(pointInCollider(build, new Vector3(deckPoint.x, playerY, deckPoint.z)), target.id)
        .toBe(false);
    });

    build.disposeGeometry();
    materials.dispose();
  });

  it('omits the paired deck artifacts and keeps the remaining weathering', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const meshNames: string[] = [];
    build.root.traverse((object) => {
      if (object instanceof Mesh) meshNames.push(object.name);
    });

    expect(meshNames.filter((name) => name.startsWith('deck-drain-'))).toEqual([]);
    expect(meshNames.filter((name) => name.startsWith('rust-streak-deck-drain-')))
      .toEqual([]);
    expect(build.root.getObjectByName('rust-streak-lifeboat-rail-opening'))
      .toBeInstanceOf(Mesh);
    expect(build.root.getObjectByName('rust-streak-port-stack-collar')).toBeInstanceOf(Mesh);
    expect(build.root.getObjectByName('rust-streak-starboard-stack-collar'))
      .toBeInstanceOf(Mesh);

    build.disposeGeometry();
    materials.dispose();
  });

  it('uses a 1.05-high rail from deck Y and leaves only the approved starboard interval open', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const opening = SHIP_LAYOUT.rail.starboardOpening;
    const openingMin = opening.centerZ - opening.width / 2;
    const openingMax = opening.centerZ + opening.width / 2;
    const railX = SHIP_LAYOUT.rail.innerFaceX + 0.125;
    const railMeshes = build.root.children.filter((object): object is Mesh =>
      object instanceof Mesh && object.name.startsWith('rail-'));
    const railBounds = railMeshes.reduce(
      (combined, mesh) => combined.union(new Box3().setFromObject(mesh)),
      new Box3(),
    );
    expect(railBounds.min.y).toBeCloseTo(FREIGHTER_DIMENSIONS.deckY);
    expect(railBounds.max.y).toBeCloseTo(FREIGHTER_DIMENSIONS.deckY + SHIP_LAYOUT.rail.height);
    expect(railBounds.max.y - railBounds.min.y).toBeCloseTo(1.05);

    [openingMin + 0.01, opening.centerZ, openingMax - 0.01].forEach((z) => {
      expect(railColliderAt(build, railX, z), `starboard rail collider at ${z}`).toBeUndefined();
      expect(railMeshes.some((mesh) => new Box3().setFromObject(mesh)
        .containsPoint(new Vector3(railX, FREIGHTER_DIMENSIONS.deckY + 0.5, z)))).toBe(false);
    });
    [openingMin - 0.01, openingMax + 0.01, 0].forEach((z) => {
      expect(railColliderAt(build, railX, z), `starboard rail collider at ${z}`).toBeDefined();
    });
    expect(railColliderAt(build, -railX, opening.centerZ), 'full port rail').toBeDefined();
    expect(railColliderAt(build, 0, 17.4), 'bow rail').toBeDefined();
    expect(railColliderAt(build, 0, -17.4), 'stern rail').toBeDefined();

    build.disposeGeometry();
    materials.dispose();
  });

  it('derives doors, rails, and the compact machinery island from a supplied layout', () => {
    const movedDoorCenter = 7.4;
    const modified: ShipLayoutSpec = {
      ...SHIP_LAYOUT,
      doors: SHIP_LAYOUT.doors.map((door) => door.id === 'cabin-port-door'
        ? { ...door, center: [door.center[0], movedDoorCenter] as const }
        : door),
      rail: {
        height: 1.1,
        innerFaceX: 5.75,
        starboardOpening: { centerZ: -5.5, width: 3 },
      },
      machineryClosure: { minX: -2, maxX: 2, minZ: -15, maxZ: -11 },
    };
    const materials = createShipMaterials();
    const build = createShipGeometry(materials, modified);
    const movedDoor = modified.doors.find(({ id }) => id === 'cabin-port-door')!;
    const oldDoor = SHIP_LAYOUT.doors.find(({ id }) => id === 'cabin-port-door')!;

    expect(pointInCollider(build, doorPoint(movedDoor, movedDoorCenter))).toBe(false);
    expect(pointInCollider(build, doorPoint(oldDoor, oldDoor.center[1]))).toBe(true);
    const railX = modified.rail.innerFaceX + 0.125;
    expect(railColliderAt(build, railX, -5.5, modified)).toBeUndefined();
    expect(railColliderAt(build, railX, -7.5, modified)).toBeDefined();
    const railMeshes = build.root.children.filter((object): object is Mesh =>
      object instanceof Mesh && object.name.startsWith('rail-'));
    const railBounds = railMeshes.reduce(
      (combined, mesh) => combined.union(new Box3().setFromObject(mesh)),
      new Box3(),
    );
    expect(railBounds.max.y).toBeCloseTo(FREIGHTER_DIMENSIONS.deckY + 1.1);
    const closureCenter = build.root.getObjectByName('machinery-island')!;
    const closureBounds = new Box3().setFromObject(closureCenter);
    expect(closureBounds.min.x).toBeCloseTo(-2);
    expect(closureBounds.max.x).toBeCloseTo(2);
    expect(closureBounds.min.z).toBeCloseTo(-15);
    expect(closureBounds.max.z).toBeCloseTo(-11);

    build.disposeGeometry();
    materials.dispose();
  });

  it.each([
    ['bow', 1],
    ['stern', -1],
  ] as const)('adds a rounded visible and colliding %s end railing', (end, direction) => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const topSegments = build.root.children.filter((object): object is Mesh =>
      object instanceof Mesh && object.name.startsWith(`rail-${end}-top-`));

    expect(topSegments).toHaveLength(12);
    const bounds = topSegments.reduce(
      (combined, segment) => combined.union(new Box3().setFromObject(segment)),
      new Box3(),
    );
    const size = bounds.getSize(new Vector3());
    expect(size.x).toBeGreaterThan(12);
    expect(size.x).toBeLessThan(12.3);
    expect(size.y).toBeCloseTo(0.14);
    expect(size.z).toBeGreaterThan(3.9);
    expect(Math.abs(direction > 0 ? bounds.max.z : bounds.min.z)).toBeGreaterThan(17);
    expect(Math.abs(direction > 0 ? bounds.max.z : bounds.min.z)).toBeLessThan(17.8);
    const blocked = resolveLocalMovement(
      { x: 0, y: FREIGHTER_DIMENSIONS.deckY + 0.5, z: direction * 15.2 },
      { x: 0, y: FREIGHTER_DIMENSIONS.deckY + 0.5, z: direction * 18 },
      0.35,
      build.shellColliders,
    );
    expect(Math.abs(blocked.z)).toBeGreaterThan(15);
    expect(Math.abs(blocked.z)).toBeLessThan(17.2);
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

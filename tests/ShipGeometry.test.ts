import {
  Box3,
  CylinderGeometry,
  ExtrudeGeometry,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import { resolveArcMovement, resolveLocalMovement } from '../src/player/collisions';
import { createShipGeometry } from '../src/world/ShipGeometry';
import {
  FREIGHTER_DIMENSIONS,
  SHIP_LAYOUT,
  type ShipDoorSpec,
  type ShipLayoutSpec,
} from '../src/world/ShipLayout';
import { createShipMaterials } from '../src/world/ShipMaterials';

describe('freighter geometry', () => {  interface PointXZ {
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

  const overlappingVolume = (left: Mesh, right: Mesh): number => {
    const leftBounds = new Box3().setFromObject(left);
    const rightBounds = new Box3().setFromObject(right);
    const overlapX = Math.max(
      0,
      Math.min(leftBounds.max.x, rightBounds.max.x)
        - Math.max(leftBounds.min.x, rightBounds.min.x),
    );
    const overlapY = Math.max(
      0,
      Math.min(leftBounds.max.y, rightBounds.max.y)
        - Math.max(leftBounds.min.y, rightBounds.min.y),
    );
    const overlapZ = Math.max(
      0,
      Math.min(leftBounds.max.z, rightBounds.max.z)
        - Math.max(leftBounds.min.z, rightBounds.min.z),
    );
    return overlapX * overlapY * overlapZ;
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

  it('separates white structure, timber floors, lower hull, and canvas', () => {
    const materials = createShipMaterials();
    try {
      expect(materials.upperHull.color.getHex()).toBe(0xd8dedb);
      expect(materials.paintedSteel.color.getHex()).toBe(0xd5dbd8);
      expect(materials.plainPaintedSteel.color.getHex()).toBe(0xcbd2cf);
      expect(materials.darkHull.color.getHex()).toBe(0x172b38);
      expect(materials.waterline.color.getHex()).toBe(0x243f4c);
      expect(materials.canvas.color.getHex()).toBe(0xb9cad0);
      expect(materials.canvasEdge.color.getHex()).toBe(0x647b82);
      expect(materials.timberFloor.metalness).toBe(0);
      expect(materials.crewFloor).toBe(materials.timberFloor);
      expect(materials.wheelhouseFloor).toBe(materials.timberFloor);
      expect(materials.cargoFloor).toBe(materials.timberFloor);
      expect(materials.storageFloor).toBe(materials.timberFloor);
      expect(materials.lifeboatFloor).not.toBe(materials.timberFloor);
    } finally {
      materials.dispose();
    }
  });

  it('builds a 20 by 55 layered hull with timber deck', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials, SHIP_LAYOUT);
    try {
      const deck = build.root.getObjectByName('floor-cargoDeck') as Mesh;
      const upperHull = build.root.getObjectByName('upper-hull') as Mesh;
      const waterline = build.root.getObjectByName('waterline-band') as Mesh;
      const size = new Box3().setFromObject(build.root).getSize(new Vector3());
      expect(size.x).toBeGreaterThanOrEqual(20);
      expect(size.z).toBeGreaterThanOrEqual(55);
      expect(deck.material).toBe(materials.timberFloor);
      expect(upperHull.material).toBe(materials.upperHull);
      expect(waterline.material).toBe(materials.waterline);
    } finally {
      build.disposeGeometry();
      materials.dispose();
    }
  });

  it('keeps the approved passage physically empty', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials, SHIP_LAYOUT);
    try {
      const crew = SHIP_LAYOUT.zones.find(({ id }) => id === 'crewCabin')!.bounds;
      const wheelhouse = SHIP_LAYOUT.zones.find(({ id }) => id === 'wheelhouse')!.bounds;
      expect(wheelhouse.minZ - crew.maxZ).toBeCloseTo(3.5);
      for (const collider of build.shellColliders) {
        const occupiesPassage = collider.maxZ > crew.maxZ
          && collider.minZ < wheelhouse.minZ
          && collider.minX < 1.1
          && collider.maxX > -1.1;
        expect(occupiesPassage).toBe(false);
      }
    } finally {
      build.disposeGeometry();
      materials.dispose();
    }
  });

  it('adds authored exterior construction details', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials, SHIP_LAYOUT);
    try {
      [
        'bow-stem',
        'stern-transom',
        'deck-hatch',
        'anchor-hawse-port',
        'anchor-hawse-starboard',
      ].forEach((name) => expect(build.root.getObjectByName(name), name).toBeDefined());
      const ribs = build.root.children.filter(({ name }) => name.startsWith('upper-hull-rib-'));
      expect(ribs).toHaveLength(8);
    } finally {
      build.disposeGeometry();
      materials.dispose();
    }
  });

  it('keeps both loop doorways and the lifeboat rail opening clear', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const clearPoints = [
      new Vector3(-4.6, 3.72, 7.4),
      new Vector3(4.6, 3.72, 7.4),
      new Vector3(-4.7, 3.72, -10.6),
      new Vector3(4.7, 3.72, -10.6),
      new Vector3(7.1, 3.72, 0),
    ];
    clearPoints.forEach((point) => expect(build.shellColliders.some((box) =>
      point.x >= box.minX && point.x <= box.maxX &&
      point.y >= box.minY && point.y <= box.maxY &&
      point.z >= box.minZ && point.z <= box.maxZ)).toBe(false));
    build.disposeGeometry();
    materials.dispose();
  });

  it('does not place an alarm cylinder on the wheelhouse roof', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);

    expect(build.root.getObjectByName('alarm-beacon')).toBeUndefined();

    build.disposeGeometry();
    materials.dispose();
  });

  it('cuts paired framed round portholes into the transverse cabin walls', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const expected = [
      { zoneId: 'crewCabin', edge: 'aft', index: 1, x: -2.2, z: 4.5 },
      { zoneId: 'crewCabin', edge: 'aft', index: 2, x: 2.2, z: 4.5 },
      { zoneId: 'crewCabin', edge: 'forward', index: 1, x: -2.2, z: 13.5 },
      { zoneId: 'crewCabin', edge: 'forward', index: 2, x: 2.2, z: 13.5 },
      { zoneId: 'storageWorkroom', edge: 'aft', index: 1, x: -2.2, z: -17.4 },
      { zoneId: 'storageWorkroom', edge: 'aft', index: 2, x: 2.2, z: -17.4 },
      { zoneId: 'storageWorkroom', edge: 'forward', index: 1, x: -2.2, z: -10.65 },
      { zoneId: 'storageWorkroom', edge: 'forward', index: 2, x: 2.2, z: -10.65 },
    ] as const;

    expected.forEach(({ zoneId, edge, index, x, z }) => {
      const porthole = build.root.getObjectByName(`porthole:${zoneId}:${edge}:${index}`)!;
      expect(porthole.position.toArray()).toEqual([
        x,
        FREIGHTER_DIMENSIONS.deckY + 2.08,
        z,
      ]);
      expect(porthole.children.filter(({ name }) => name.endsWith(':glass'))).toHaveLength(2);
      expect(porthole.children.filter(({ name }) => name.endsWith(':frame'))).toHaveLength(2);
      expect(porthole.children.filter(({ name }) => name.includes(':bolt-'))).toHaveLength(16);
      expect(pointInCollider(build, porthole.position)).toBe(true);
    });

    const portholeWalls = build.root.children.filter((object): object is Mesh =>
      object instanceof Mesh
      && object.geometry instanceof ExtrudeGeometry
      && /^(crew-cabin|storage-workroom)-wall-(aft|forward)-/.test(object.name));
    expect(portholeWalls).toHaveLength(4);
    portholeWalls.forEach((wall) => {
      const geometry = wall.geometry as ExtrudeGeometry;
      const shapes = Array.isArray(geometry.parameters.shapes)
        ? geometry.parameters.shapes
        : [geometry.parameters.shapes];
      expect(shapes).toHaveLength(1);
      expect(shapes[0]!.holes).toHaveLength(2);
    });

    build.disposeGeometry();
    materials.dispose();
  });

  it.each([
    new Vector3(-9.575, 2.72, 0),
    new Vector3(9.575, 2.72, 4),
  ])('blocks passage through the waist-height outer rail at %s', (point) => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    expect(build.shellColliders.some((box) =>
      point.x >= box.minX && point.x <= box.maxX &&
      point.y >= box.minY && point.y <= box.maxY &&
      point.z >= box.minZ && point.z <= box.maxZ)).toBe(true);
    build.disposeGeometry();
    materials.dispose();
  });it.each(SHIP_LAYOUT.doors)('$id leaves all player-radius doorway samples open and keeps both jambs solid', (door) => {
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

  it('builds flush enclosed-room corners without protruding cap colliders or mesh overlap', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    SHIP_LAYOUT.zones.filter(({ enclosed }) => enclosed).forEach((zone) => {
      const prefix = zone.id === 'crewCabin' ? 'crew-cabin'
        : zone.id === 'storageWorkroom' ? 'storage-workroom' : 'wheelhouse';
      const roof = build.root.getObjectByName(`${zone.id}-roof`)!;
      const roofBounds = new Box3().setFromObject(roof);
      expect(roofBounds.min.x, `${zone.id} roof minX`).toBeCloseTo(
        zone.bounds.minX,
      );
      expect(roofBounds.max.x, `${zone.id} roof maxX`).toBeCloseTo(
        zone.bounds.maxX,
      );
      expect(roofBounds.min.z, `${zone.id} roof minZ`).toBeCloseTo(
        zone.bounds.minZ,
      );
      expect(roofBounds.max.z, `${zone.id} roof maxZ`).toBeCloseTo(
        zone.bounds.maxZ,
      );
      const roomColliders = build.shellColliders.filter((box) =>
        Math.abs(box.minY - FREIGHTER_DIMENSIONS.deckY) < 1e-8
        && Math.abs(box.maxY - roofBounds.min.y) < 1e-8
        && box.minX < zone.bounds.maxX
        && box.maxX > zone.bounds.minX
        && box.minZ < zone.bounds.maxZ
        && box.maxZ > zone.bounds.minZ);
      expect(roomColliders.length, `${zone.id} wall colliders`).toBeGreaterThan(0);
      roomColliders.forEach((box) => {
        expect(box.minX, `${zone.id} minX`).toBeGreaterThanOrEqual(
          zone.bounds.minX - 1e-8,
        );
        expect(box.maxX, `${zone.id} maxX`).toBeLessThanOrEqual(
          zone.bounds.maxX + 1e-8,
        );
        expect(box.minZ, `${zone.id} minZ`).toBeGreaterThanOrEqual(
          zone.bounds.minZ - 1e-8,
        );
        expect(box.maxZ, `${zone.id} maxZ`).toBeLessThanOrEqual(
          zone.bounds.maxZ + 1e-8,
        );
      });
      expect(Math.min(...roomColliders.map(({ minX }) => minX))).toBeCloseTo(
        zone.bounds.minX,
      );
      expect(Math.max(...roomColliders.map(({ maxX }) => maxX))).toBeCloseTo(
        zone.bounds.maxX,
      );
      expect(Math.min(...roomColliders.map(({ minZ }) => minZ))).toBeCloseTo(
        zone.bounds.minZ,
      );
      expect(Math.max(...roomColliders.map(({ maxZ }) => maxZ))).toBeCloseTo(
        zone.bounds.maxZ,
      );

      const structuralMeshes = build.root.children.filter((object): object is Mesh =>
        object instanceof Mesh
        && (
          object.name.startsWith(`${prefix}-wall-`)
          || object.name === `${zone.id}-roof`
          || (zone.id === 'wheelhouse'
            && (
              object.name.startsWith('wheelhouse-front-pillar-')
              || object.name.startsWith('wheelhouse-front-window-')
            ))
        ));
      structuralMeshes.forEach((left, index) => {
        structuralMeshes.slice(index + 1).forEach((right) => {
          expect(
            overlappingVolume(left, right),
            `${left.name} overlaps ${right.name}`,
          ).toBeLessThan(1e-8);
        });
      });
      zone.polygon.forEach((_, index) => {
        expect(build.root.getObjectByName(`${zone.id}-corner-${index}`)).toBeUndefined();
      });
    });

    build.disposeGeometry();
    materials.dispose();
  });

  it('keeps room roofs and chimney-housing parts flush without intersecting volumes', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const roofs = SHIP_LAYOUT.zones.filter(({ enclosed }) => enclosed)
      .map(({ id }) => build.root.getObjectByName(`${id}-roof`) as Mesh);
    const machineryParts = build.root.children.filter((object): object is Mesh =>
      object instanceof Mesh
      && (
        object.name === 'machinery-island'
        || object.name.startsWith('smokestack-')
        || object.name.startsWith('rust-streak-')
      ));

    roofs.forEach((left, index) => {
      roofs.slice(index + 1).forEach((right) => {
        expect(overlappingVolume(left, right), `${left.name} overlaps ${right.name}`)
          .toBeLessThan(1e-8);
      });
    });
    machineryParts.forEach((left, index) => {
      machineryParts.slice(index + 1).forEach((right) => {
        expect(overlappingVolume(left, right), `${left.name} overlaps ${right.name}`)
          .toBeLessThan(1e-8);
      });
    });

    build.disposeGeometry();
    materials.dispose();
  });

  it('exports bow and stern rail arcs separately from shell box colliders', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const cargo = SHIP_LAYOUT.zones.find(({ id }) => id === 'cargoDeck')!.bounds;
    const centerY = FREIGHTER_DIMENSIONS.deckY + SHIP_LAYOUT.rail.height / 2;

    expect(build.arcColliders).toEqual([
      {
        centerX: 0,
        centerZ: cargo.maxZ - 5.2,
        radiusX: SHIP_LAYOUT.rail.innerFaceX + 0.125,
        radiusZ: 5.2,
        end: 'bow',
        thickness: 0.25,
        minY: FREIGHTER_DIMENSIONS.deckY,
        maxY: FREIGHTER_DIMENSIONS.deckY + SHIP_LAYOUT.rail.height,
      },
      {
        centerX: 0,
        centerZ: cargo.minZ + 5.2,
        radiusX: SHIP_LAYOUT.rail.innerFaceX + 0.125,
        radiusZ: 5.2,
        end: 'stern',
        thickness: 0.25,
        minY: FREIGHTER_DIMENSIONS.deckY,
        maxY: FREIGHTER_DIMENSIONS.deckY + SHIP_LAYOUT.rail.height,
      },
    ]);
    [cargo.maxZ, cargo.minZ].forEach((z) => {
      expect(railColliderAt(build, 0, z), `box collider at center point ${z}`).toBeUndefined();
      expect(pointInCollider(build, new Vector3(0, centerY, z)), `shell box at ${z}`).toBe(false);
    });

    build.disposeGeometry();
    materials.dispose();
  });

  it('derives doors, rails, and the compact machinery island from a supplied layout', () => {
    const movedDoorCenter = 8.8;
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
    const posts = build.root.children.filter((object): object is Mesh =>
      object instanceof Mesh && object.name.startsWith(`rail-${end}-post-`));

    expect(topSegments).toHaveLength(12);
    expect(posts).toHaveLength(13);
    const bounds = topSegments.reduce(
      (combined, segment) => combined.union(new Box3().setFromObject(segment)),
      new Box3(),
    );
    const size = bounds.getSize(new Vector3());
    expect(size.x).toBeGreaterThan(19.4);
    expect(size.x).toBeLessThan(19.8);
    expect(size.y).toBeCloseTo(0.14);
    expect(size.z).toBeGreaterThan(5.1);
    expect(Math.abs(direction > 0 ? bounds.max.z : bounds.min.z)).toBeGreaterThan(27);
    expect(Math.abs(direction > 0 ? bounds.max.z : bounds.min.z)).toBeLessThan(27.2);
    const arc = build.arcColliders.find((candidate) => candidate.end === end);
    expect(arc).toBeDefined();
    const blocked = resolveArcMovement(
      { x: 0, y: FREIGHTER_DIMENSIONS.deckY + 0.5, z: direction * 24 },
      { x: 0, y: FREIGHTER_DIMENSIONS.deckY + 0.5, z: direction * 28 },
      0.35,
      arc!,
    );
    expect(Math.abs(blocked.z)).toBeGreaterThan(25);
    expect(Math.abs(blocked.z)).toBeLessThan(26.8);
    const lifeboatGap = resolveLocalMovement(
      { x: 7.1, y: 3.72, z: 0 },
      { x: 8.1, y: 3.72, z: 0 },
      0.35,
      build.shellColliders,
    );
    expect(lifeboatGap.x).toBeCloseTo(8.1);

    build.disposeGeometry();
    materials.dispose();
  });
});

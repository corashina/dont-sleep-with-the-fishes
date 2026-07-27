import {
  Box3,
  CylinderGeometry,
  ExtrudeGeometry,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import {
  PLAYER_BODY_HEIGHT,
  resolveArcMovement,
  resolveLocalMovement,
} from '../src/player/collisions';
import { createShipGeometry } from '../src/world/ShipGeometry';
import {
  FREIGHTER_DIMENSIONS,
  PLAYER_LAYOUT_RADIUS,
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
      if (new Box3().setFromObject(object).expandByScalar(1e-7).containsPoint(point)) {
        blockers.push(object.name);
      }
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

  const renderedWallPoint = (door: ShipDoorSpec, axis: number): Vector3 => {
    const point = doorPoint(door, axis);
    if (door.orientation === 'aft') point.z += 0.11;
    else point.x += door.side === 'port' ? 0.11 : -0.11;
    return point;
  };

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
      const lowerHull = build.root.getObjectByName('main-hull-body') as Mesh;
      const upperHull = build.root.getObjectByName('upper-hull') as Mesh;
      const waterline = build.root.getObjectByName('waterline-band') as Mesh;
      const size = new Box3().setFromObject(build.root).getSize(new Vector3());
      expect(size.x).toBeGreaterThanOrEqual(20);
      expect(size.z).toBeGreaterThanOrEqual(55);
      expect(deck.material).toBe(materials.timberFloor);
      expect(upperHull.material).toBe(materials.upperHull);
      expect(waterline.material).toBe(materials.waterline);
      const upperHullBounds = new Box3().setFromObject(upperHull);
      expect(upperHullBounds.max.y).toBeCloseTo(2.15);
      expect(upperHullBounds.max.y - upperHullBounds.min.y).toBeGreaterThanOrEqual(0.8);
      expect(new Box3().setFromObject(waterline).max.y).toBeLessThanOrEqual(
        upperHullBounds.min.y + 0.05,
      );
      const lowerHullBounds = new Box3().setFromObject(lowerHull);
      expect(upperHullBounds.max.x).toBeGreaterThan(lowerHullBounds.max.x);
      expect(upperHullBounds.max.z).toBeGreaterThan(lowerHullBounds.max.z);
    } finally {
      build.disposeGeometry();
      materials.dispose();
    }
  });

  it('extends the underwater hull through a deep chine to a narrow keel', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials, SHIP_LAYOUT);
    try {
      const hull = build.root.getObjectByName('main-hull-body') as Mesh;
      const positions = hull.geometry.getAttribute('position');
      const widthsByLocalY = new Map<number, { minX: number; maxX: number }>();
      for (let index = 0; index < positions.count; index += 1) {
        const y = Math.round(positions.getY(index) * 1000) / 1000;
        const bounds = widthsByLocalY.get(y) ?? {
          minX: Number.POSITIVE_INFINITY,
          maxX: Number.NEGATIVE_INFINITY,
        };
        bounds.minX = Math.min(bounds.minX, positions.getX(index));
        bounds.maxX = Math.max(bounds.maxX, positions.getX(index));
        widthsByLocalY.set(y, bounds);
      }
      const profile = [...widthsByLocalY.entries()]
        .sort(([firstY], [secondY]) => secondY - firstY);

      expect(profile).toHaveLength(3);
      expect(profile[0]![1].maxX - profile[0]![1].minX).toBeCloseTo(20);
      expect(profile[1]![1].maxX - profile[1]![1].minX).toBeGreaterThan(13);
      expect(profile[1]![1].maxX - profile[1]![1].minX).toBeLessThan(16);
      expect(profile[2]![1].maxX - profile[2]![1].minX).toBeLessThan(3.5);
      expect(profile[0]![0] - profile[2]![0]).toBeGreaterThanOrEqual(4.5);
      expect(build.waterExclusion.minimumLocalY).toBeCloseTo(
        hull.position.y + profile[2]![0],
      );
    } finally {
      build.disposeGeometry();
      materials.dispose();
    }
  });

  it('keeps the painted upper hull below the timber deck surface', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials, SHIP_LAYOUT);
    try {
      const upperHull = build.root.getObjectByName('upper-hull') as Mesh;
      const timberDeck = build.root.getObjectByName('timber-deck') as Mesh;
      const upperHullTop = new Box3().setFromObject(upperHull).max.y;
      const timberDeckTop = new Box3().setFromObject(timberDeck).max.y;

      expect(upperHullTop).toBeLessThanOrEqual(timberDeckTop - 0.02);
    } finally {
      build.disposeGeometry();
      materials.dispose();
    }
  });

  it('joins the finished deck and lifeboat stripe cleanly to the white rail edge', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials, SHIP_LAYOUT);
    try {
      const timberDeckBounds = new Box3().setFromObject(
        build.root.getObjectByName('timber-deck')!,
      );
      const cargoFloorBounds = new Box3().setFromObject(
        build.root.getObjectByName('floor-cargoDeck')!,
      );
      const stationFloorBounds = new Box3().setFromObject(
        build.root.getObjectByName('floor-lifeboatStation')!,
      );
      const stripeBounds = new Box3().setFromObject(
        build.root.getObjectByName('lifeboat-station-emergency-border')!,
      );

      expect(cargoFloorBounds.min.x).toBeCloseTo(timberDeckBounds.min.x);
      expect(cargoFloorBounds.max.x).toBeCloseTo(timberDeckBounds.max.x);
      expect(cargoFloorBounds.min.z).toBeCloseTo(timberDeckBounds.min.z);
      expect(cargoFloorBounds.max.z).toBeCloseTo(timberDeckBounds.max.z);
      expect(stationFloorBounds.max.x).toBeCloseTo(timberDeckBounds.max.x);
      expect(stripeBounds.max.x).toBeCloseTo(timberDeckBounds.max.x);

      const portRails = build.root.children.filter(({ name }) => name.startsWith('rail-port-'));
      const starboardRails = build.root.children.filter(({ name }) =>
        name.startsWith('rail-starboard-'));
      portRails.forEach((rail) => expect(
        new Box3().setFromObject(rail).max.x,
        rail.name,
      ).toBeLessThanOrEqual(timberDeckBounds.min.x));
      starboardRails.forEach((rail) => expect(
        new Box3().setFromObject(rail).min.x,
        rail.name,
      ).toBeGreaterThanOrEqual(timberDeckBounds.max.x));
    } finally {
      build.disposeGeometry();
      materials.dispose();
    }
  });

  it('renders room panels as textured weathered warm white', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials, SHIP_LAYOUT);
    try {
      const crewWall = build.root.children.find((object): object is Mesh =>
        object instanceof Mesh && object.name.startsWith('crew-cabin-wall-'))!;
      const wheelhouseSill = build.root.children.find((object): object is Mesh =>
        object instanceof Mesh && /^wheelhouse-wall-.*-sill$/.test(object.name))!;
      expect(crewWall.material).toBe(materials.paintedPanel);
      expect(wheelhouseSill.material).toBe(materials.paintedPanel);
      expect(materials.paintedPanel.map?.name).toBe('paintedPanel-color');
      expect(materials.paintedPanel.roughness).toBeGreaterThanOrEqual(0.9);

      const bytes = materials.paintedPanel.map!.image.data as Uint8Array;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let offset = 0; offset < bytes.length; offset += 4) {
        red += bytes[offset]!;
        green += bytes[offset + 1]!;
        blue += bytes[offset + 2]!;
      }
      const pixels = bytes.length / 4;
      expect(red / pixels).toBeGreaterThan(195);
      expect(green / pixels).toBeGreaterThan(190);
      expect(red).toBeGreaterThan(blue);
    } finally {
      build.disposeGeometry();
      materials.dispose();
    }
  });

  it('builds the deck hatch mesh and collider from layout-owned spatial data', () => {
    const materials = createShipMaterials();
    const layout = {
      ...SHIP_LAYOUT,
      deckHatch: {
        ...SHIP_LAYOUT.deckHatch,
        position: [4.2, 2.22, -6.5] as const,
        size: [1.2, 0.16, 1.6] as const,
        colliderSize: [1.1, 0.14, 1.5] as const,
      },
    };
    const build = createShipGeometry(materials, layout);
    try {
      const hatch = build.root.getObjectByName('deck-hatch') as Mesh;
      expect(hatch.position.x).toBe(4.2);
      expect(hatch.position.y).toBeCloseTo(2.3);
      expect(hatch.position.z).toBe(-6.5);
      expect(hatch.scale.toArray()).toEqual([1.2, 0.16, 1.6]);
      const collider = build.shellColliders.find((candidate) =>
        candidate.minX > 3.6 && candidate.maxX < 4.8
        && candidate.minZ < -7.2 && candidate.maxZ > -5.8)!;
      expect(collider.minX).toBeCloseTo(3.65);
      expect(collider.maxX).toBeCloseTo(4.75);
      expect(collider.minY).toBeCloseTo(2.22);
      expect(collider.maxY).toBeCloseTo(2.36);
      expect(collider.minZ).toBeCloseTo(-7.25);
      expect(collider.maxZ).toBeCloseTo(-5.75);
    } finally {
      build.disposeGeometry();
      materials.dispose();
    }
  });

  it('seats wheelhouse sill, brackets, and fasteners on the rendered front wall face', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials, SHIP_LAYOUT);
    try {
      const wheelhouse = SHIP_LAYOUT.zones.find(({ id }) => id === 'wheelhouse')!.bounds;
      [
        'wheelhouse-front-sill-band',
        'wheelhouse-header-bracket-port',
        'wheelhouse-header-bracket-starboard',
        ...Array.from({ length: 5 }, (_, index) => `wheelhouse-front-fastener-${index + 1}`),
      ].forEach((name) => {
        const detail = build.root.getObjectByName(name) as Mesh;
        expect(new Box3().setFromObject(detail).min.z, name).toBeCloseTo(wheelhouse.maxZ);
      });
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

  it('renders the passage-facing walls inside the approved room bounds', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials, SHIP_LAYOUT);
    try {
      const crew = SHIP_LAYOUT.zones.find(({ id }) => id === 'crewCabin')!.bounds;
      const wheelhouse = SHIP_LAYOUT.zones.find(({ id }) => id === 'wheelhouse')!.bounds;
      const passageWalls = [
        {
          prefix: 'crew-cabin-wall-forward-',
          expectedBoundary: crew.maxZ,
          boundary: 'max',
        },
        {
          prefix: 'wheelhouse-wall-aft-',
          expectedBoundary: wheelhouse.minZ,
          boundary: 'min',
        },
      ] as const;

      passageWalls.forEach(({ prefix, expectedBoundary, boundary }) => {
        const walls = build.root.children.filter((object): object is Mesh =>
          object instanceof Mesh && object.name.startsWith(prefix));
        expect(walls.length, prefix).toBeGreaterThan(0);
        const bounds = walls.reduce(
          (combined, wall) => combined.union(new Box3().setFromObject(wall)),
          new Box3(),
        );
        expect(bounds[boundary].z, prefix).toBeCloseTo(expectedBoundary);
      });
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
      const sideFittings = build.root.children.filter(({ name }) =>
        name.startsWith('upper-hull-rib-') || name.startsWith('hull-rib-fastener-'));
      expect(sideFittings).toHaveLength(0);
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
      { zoneId: 'crewCabin', edge: 'aft', index: 1, x: -2.2, z: 4.61 },
      { zoneId: 'crewCabin', edge: 'aft', index: 2, x: 2.2, z: 4.61 },
      { zoneId: 'crewCabin', edge: 'forward', index: 1, x: -2.2, z: 13.39 },
      { zoneId: 'crewCabin', edge: 'forward', index: 2, x: 2.2, z: 13.39 },
      { zoneId: 'storageWorkroom', edge: 'aft', index: 1, x: -2.2, z: -17.29 },
      { zoneId: 'storageWorkroom', edge: 'aft', index: 2, x: 2.2, z: -17.29 },
      { zoneId: 'storageWorkroom', edge: 'forward', index: 1, x: -2.2, z: -10.76 },
      { zoneId: 'storageWorkroom', edge: 'forward', index: 2, x: 2.2, z: -10.76 },
    ] as const;

    expected.forEach(({ zoneId, edge, index, x, z }) => {
      const porthole = build.root.getObjectByName(`porthole:${zoneId}:${edge}:${index}`)!;
      expect(porthole.position.toArray()).toEqual([
        x,
        FREIGHTER_DIMENSIONS.deckY + PLAYER_BODY_HEIGHT,
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
    new Vector3(-9.75, 2.72, 0),
    new Vector3(9.75, 2.72, 4),
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
        expect(
          wallRenderBlockers(build, renderedWallPoint(door, axis)).length,
          `${door.id} jamb render at ${axis}`,
        )
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

  it('turns only the two inner room roofs into timber balconies', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);

    expect((build.root.getObjectByName('balcony:crew-balcony:deck') as Mesh).material)
      .toBe(materials.timberFloor);
    expect((build.root.getObjectByName('balcony:storage-balcony:deck') as Mesh).material)
      .toBe(materials.timberFloor);
    expect(build.root.getObjectByName('balcony:wheelhouse:deck')).toBeUndefined();

    build.disposeGeometry();
    materials.dispose();
  });

  it.each([
    ['crew-ladder', 0, 4.5, -1],
    ['storage-ladder', 0, -10.65, 1],
  ] as const)('centers %s on its mast-facing wall', (id, x, wallZ, outwardZ) => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const ladder = build.root.getObjectByName(`ladder:${id}`)!;

    expect(ladder.position.x).toBeCloseTo(x);
    expect(Math.sign(ladder.position.z - wallZ)).toBe(outwardZ);
    expect(build.climbZones.find((zone) => zone.id === id)).toBeDefined();

    build.disposeGeometry();
    materials.dispose();
  });

  it.each(SHIP_LAYOUT.balconies)(
    'builds $id with white coamings and posts, dark rails, and a centered opening',
    (balcony) => {
      const materials = createShipMaterials();
      const build = createShipGeometry(materials);
      const zone = SHIP_LAYOUT.zones.find(({ id }) => id === balcony.zoneId)!;
      const prefix = `balcony:${balcony.id}:`;
      const openingEdge = balcony.edge;
      const coamings = build.root.children.filter((object): object is Mesh =>
        object instanceof Mesh && object.name.startsWith(`${prefix}coaming:`));
      const posts = build.root.children.filter((object): object is Mesh =>
        object instanceof Mesh && object.name.startsWith(`${prefix}post:`));
      const topRails = build.root.children.filter((object): object is Mesh =>
        object instanceof Mesh && object.name.startsWith(`${prefix}top-rail:`));
      const openingCoamings = coamings.filter(({ name }) =>
        name.startsWith(`${prefix}coaming:${openingEdge}:`));
      const openingRails = topRails.filter(({ name }) =>
        name.startsWith(`${prefix}top-rail:${openingEdge}:`));

      expect(coamings).toHaveLength(5);
      expect(coamings.every(({ material }) =>
        material === materials.paintedPanel || material === materials.paintedSteel)).toBe(true);
      expect(posts.length).toBeGreaterThanOrEqual(10);
      expect(posts.every(({ material }) => material === materials.paintedSteel)).toBe(true);
      expect(topRails).toHaveLength(5);
      expect(topRails.every(({ material }) => material === materials.darkMetal)).toBe(true);
      expect(openingCoamings).toHaveLength(2);
      expect(openingRails).toHaveLength(2);

      const left = new Box3().setFromObject(openingCoamings[0]!);
      const right = new Box3().setFromObject(openingCoamings[1]!);
      const gapMin = Math.min(left.max.x, right.max.x);
      const gapMax = Math.max(left.min.x, right.min.x);
      expect(gapMin).toBeCloseTo(-balcony.openingWidth / 2);
      expect(gapMax).toBeCloseTo(balcony.openingWidth / 2);
      expect(gapMax - gapMin).toBeGreaterThanOrEqual(PLAYER_LAYOUT_RADIUS * 2);

      const deck = build.root.getObjectByName(`${prefix}deck`) as Mesh;
      const deckBounds = new Box3().setFromObject(deck);
      const railSampleY = deckBounds.max.y + balcony.railHeight / 2;
      const openingZ = balcony.edge === 'aft' ? zone.bounds.minZ : zone.bounds.maxZ;
      const oppositeZ = balcony.edge === 'aft' ? zone.bounds.maxZ : zone.bounds.minZ;
      expect(pointInCollider(build, new Vector3(0, railSampleY, openingZ))).toBe(false);
      expect(pointInCollider(build, new Vector3(zone.bounds.minX, railSampleY, openingZ)))
        .toBe(true);
      expect(pointInCollider(build, new Vector3(zone.bounds.maxX, railSampleY, openingZ)))
        .toBe(true);
      expect(pointInCollider(build, new Vector3(0, railSampleY, oppositeZ))).toBe(true);
      expect(pointInCollider(build, new Vector3(zone.bounds.minX, railSampleY, 0.5 * (
        zone.bounds.minZ + zone.bounds.maxZ
      )))).toBe(true);
      expect(pointInCollider(build, new Vector3(zone.bounds.maxX, railSampleY, 0.5 * (
        zone.bounds.minZ + zone.bounds.maxZ
      )))).toBe(true);

      build.disposeGeometry();
      materials.dispose();
    },
  );

  it.each(SHIP_LAYOUT.ladders)(
    'builds $id with timber rungs, metal rails and brackets, and geometry-derived climb heights',
    (ladderSpec) => {
      const materials = createShipMaterials();
      const build = createShipGeometry(materials);
      const balcony = SHIP_LAYOUT.balconies.find(({ ladderId }) => ladderId === ladderSpec.id)!;
      const ladder = build.root.getObjectByName(`ladder:${ladderSpec.id}`)!;
      const rungs = ladder.children.filter((object): object is Mesh =>
        object instanceof Mesh && object.name.startsWith(`ladder:${ladderSpec.id}:rung:`));
      const sideRails = ladder.children.filter((object): object is Mesh =>
        object instanceof Mesh && object.name.startsWith(`ladder:${ladderSpec.id}:side-rail:`));
      const brackets = ladder.children.filter((object): object is Mesh =>
        object instanceof Mesh && object.name.startsWith(`ladder:${ladderSpec.id}:bracket:`));
      const grabRails = ladder.children.filter((object): object is Mesh =>
        object instanceof Mesh && object.name.startsWith(`ladder:${ladderSpec.id}:grab-rail:`));
      const deck = build.root.getObjectByName(`balcony:${balcony.id}:deck`) as Mesh;
      const deckBounds = new Box3().setFromObject(deck);
      const zone = build.climbZones.find(({ id }) => id === ladderSpec.id)!;
      const room = SHIP_LAYOUT.zones.find(({ id }) => id === ladderSpec.zoneId)!;
      const wallZ = ladderSpec.edge === 'aft' ? room.bounds.minZ : room.bounds.maxZ;
      const outwardZ = ladderSpec.edge === 'aft' ? -1 : 1;
      const bottomEntryZ = (zone.bottomEntry.minZ + zone.bottomEntry.maxZ) / 2;
      const topEntryZ = (zone.topEntry.minZ + zone.topEntry.maxZ) / 2;

      expect(rungs.length).toBeGreaterThan(8);
      expect(rungs.every(({ material }) => material === materials.timber)).toBe(true);
      expect(sideRails).toHaveLength(2);
      expect(sideRails.every(({ material }) => material === materials.darkMetal)).toBe(true);
      expect(brackets.length).toBeGreaterThanOrEqual(4);
      expect(brackets.every(({ material }) => material === materials.exposedMetal)).toBe(true);
      build.root.updateMatrixWorld(true);
      brackets.forEach((bracket) => {
        const bracketBounds = new Box3().setFromObject(bracket);
        const wallContactZ = outwardZ < 0 ? bracketBounds.max.z : bracketBounds.min.z;
        expect(wallContactZ, `${bracket.name} wall contact`).toBeCloseTo(wallZ);
      });
      expect(grabRails).toHaveLength(2);
      expect(grabRails.every(({ material }) => material === materials.exposedMetal)).toBe(true);
      expect(zone.bottomEyeY).toBeCloseTo(FREIGHTER_DIMENSIONS.deckY + PLAYER_BODY_HEIGHT);
      expect(zone.topEyeY).toBeCloseTo(deckBounds.max.y + PLAYER_BODY_HEIGHT);
      expect(zone.climbX).toBeCloseTo(ladder.position.x);
      expect(zone.climbZ).toBeCloseTo(ladder.position.z);
      expect(zone.outwardX).toBe(0);
      expect(zone.outwardZ).toBe(outwardZ);
      expect((bottomEntryZ - wallZ) * outwardZ).toBeGreaterThan(0);
      expect((topEntryZ - wallZ) * outwardZ).toBeLessThan(0);
      expect((zone.bottomDismount[1] - wallZ) * outwardZ).toBeGreaterThan(0);
      expect((zone.topDismount[1] - wallZ) * outwardZ).toBeLessThan(0);
      expect(zone.bottomEntry.maxX - zone.bottomEntry.minX)
        .toBeLessThanOrEqual(balcony.openingWidth - PLAYER_LAYOUT_RADIUS * 2);
      expect(Object.isFrozen(zone)).toBe(true);
      expect(Object.isFrozen(zone.bottomEntry)).toBe(true);
      expect(Object.isFrozen(zone.topEntry)).toBe(true);

      build.disposeGeometry();
      materials.dispose();
    },
  );

  it('keeps balcony layers, rails, room roofs, and chimney volumes flush or separate', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const chimneyParts = build.root.children.filter((object): object is Mesh =>
      object instanceof Mesh
      && (object.name === 'machinery-island' || object.name.startsWith('smokestack-')));

    SHIP_LAYOUT.balconies.forEach((balcony) => {
      const roof = build.root.getObjectByName(`${balcony.zoneId}-roof`) as Mesh;
      const deck = build.root.getObjectByName(`balcony:${balcony.id}:deck`) as Mesh;
      const rails = build.root.children.filter((object): object is Mesh =>
        object instanceof Mesh
        && (
          object.name.startsWith(`balcony:${balcony.id}:coaming:`)
          || object.name.startsWith(`balcony:${balcony.id}:post:`)
          || object.name.startsWith(`balcony:${balcony.id}:top-rail:`)
        ));

      expect(overlappingVolume(roof, deck)).toBeLessThan(1e-8);
      rails.forEach((rail) => {
        expect(overlappingVolume(deck, rail), `${deck.name} overlaps ${rail.name}`)
          .toBeLessThan(1e-8);
        chimneyParts.forEach((chimney) => {
          expect(overlappingVolume(rail, chimney), `${rail.name} overlaps ${chimney.name}`)
            .toBeLessThan(1e-8);
        });
      });
    });

    build.disposeGeometry();
    materials.dispose();
  });

  it('disposes added balcony and ladder geometries exactly once', () => {
    const materials = createShipMaterials();
    const build = createShipGeometry(materials);
    const geometries = new Set(
      build.root.children
        .filter((object): object is Mesh =>
          object instanceof Mesh
          && (object.name.startsWith('balcony:') || object.name.startsWith('ladder:')))
        .map(({ geometry }) => geometry),
    );
    build.root.traverse((object) => {
      if (object instanceof Mesh && object.name.startsWith('ladder:')) geometries.add(object.geometry);
    });
    const disposeCalls = new Map([...geometries].map((geometry) => {
      let calls = 0;
      const original = geometry.dispose.bind(geometry);
      geometry.dispose = () => {
        calls += 1;
        original();
      };
      return [geometry, () => calls] as const;
    }));

    expect(geometries.size).toBeGreaterThan(0);
    build.disposeGeometry();
    build.disposeGeometry();
    disposeCalls.forEach((calls) => expect(calls()).toBe(1));
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
        radiusZ: 5.325,
        end: 'bow',
        thickness: 0.25,
        minY: FREIGHTER_DIMENSIONS.deckY,
        maxY: FREIGHTER_DIMENSIONS.deckY + SHIP_LAYOUT.rail.height,
      },
      {
        centerX: 0,
        centerZ: cargo.minZ + 5.2,
        radiusX: SHIP_LAYOUT.rail.innerFaceX + 0.125,
        radiusZ: 5.325,
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
    expect(size.x).toBeGreaterThan(19.8);
    expect(size.x).toBeLessThan(20.1);
    expect(size.y).toBeCloseTo(0.14);
    expect(size.z).toBeGreaterThan(5.1);
    expect(Math.abs(direction > 0 ? bounds.max.z : bounds.min.z)).toBeGreaterThan(27);
    expect(Math.abs(direction > 0 ? bounds.max.z : bounds.min.z)).toBeLessThan(27.4);
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

// Importance: 5/5. Protects valid player navigation and containment.
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import {
  findSupportEyeHeight,
  MAX_JUMPABLE_SUPPORT_HEIGHT,
  PLAYER_BODY_HEIGHT,
  movementAxes,
  resolveArcMovement,
  resolveLocalMovement,
} from '../src/player/collisions';
import type { CollisionArc, CollisionBox } from '../src/player/collisions';
import { createTestShip } from './helpers/shipFurniture';
import {
  FREIGHTER_DIMENSIONS,
  PLAYER_LAYOUT_RADIUS,
  SHIP_LAYOUT,
} from '../src/world/ShipLayout';

const PLAYER_Y = FREIGHTER_DIMENSIONS.deckY + 1.5;
const RAIL_SAMPLE_Y = FREIGHTER_DIMENSIONS.deckY + SHIP_LAYOUT.rail.height / 2;
const EXTERIOR_ROUTE_X = SHIP_LAYOUT.rail.innerFaceX - PLAYER_LAYOUT_RADIUS - 0.025;

const layoutTarget = (id: string): Vector3 => {
  const position = SHIP_LAYOUT.targets.find((candidate) => candidate.id === id)!.position;
  return new Vector3(position[0], PLAYER_Y, position[1]);
};

const furniturePoint = (id: string, y: number): Vector3 => {
  const position = SHIP_LAYOUT.furniture.find((candidate) => candidate.id === id)!.position;
  return new Vector3(position[0], y, position[2]);
};

const laneCenter = (id: string): Vector3 => {
  const bounds = SHIP_LAYOUT.lanes.find((candidate) => candidate.id === id)!.bounds;
  return new Vector3(
    (bounds.minX + bounds.maxX) / 2,
    PLAYER_Y,
    (bounds.minZ + bounds.maxZ) / 2,
  );
};

const arc = (end: CollisionArc['end']): CollisionArc => ({
  centerX: 0,
  centerZ: end === 'bow' ? 14 : -14,
  radiusX: 6,
  radiusZ: 4,
  end,
  thickness: 0.25,
  minY: 2,
  maxY: 4,
});

const layoutDoor = (id: string) => {
  const door = SHIP_LAYOUT.doors.find((candidate) => candidate.id === id);
  if (!door) throw new Error(`Missing layout door ${id}`);
  return door;
};

const pointInside = (point: Vector3, box: CollisionBox): boolean =>
  point.x >= box.minX && point.x <= box.maxX &&
  point.y >= box.minY && point.y <= box.maxY &&
  point.z >= box.minZ && point.z <= box.maxZ;

const playerOverlaps = (point: Vector3, radius: number, box: CollisionBox): boolean => {
  const playerFeetY = point.y - PLAYER_BODY_HEIGHT;
  if (playerFeetY >= box.maxY || point.y <= box.minY) return false;
  const closestX = Math.max(box.minX, Math.min(point.x, box.maxX));
  const closestZ = Math.max(box.minZ, Math.min(point.z, box.maxZ));
  return (point.x - closestX) ** 2 + (point.z - closestZ) ** 2 < radius ** 2;
};

const followPath = (
  start: Vector3,
  waypoints: readonly Vector3[],
  colliders: readonly CollisionBox[],
): Vector3 => {
  let current = start.clone();
  for (const waypoint of waypoints) {
    const segment = waypoint.clone().sub(current);
    const steps = Math.max(1, Math.ceil(segment.length() / 0.1));
    const segmentStart = current.clone();
    for (let step = 1; step <= steps; step += 1) {
      const desired = segmentStart.clone().lerp(waypoint, step / steps);
      const resolved = resolveLocalMovement(current, desired, 0.35, colliders);
      current = new Vector3(resolved.x, resolved.y, resolved.z);
    }
    expect(current.distanceTo(waypoint), `blocked before ${waypoint.toArray()}`).toBeLessThan(0.02);
  }
  return current;
};

describe('player movement helpers', () => {
  it('normalizes diagonal keyboard movement', () => {
    const axes = movementAxes(new Set(['KeyW', 'KeyD']));

    expect(Math.hypot(axes.x, axes.z)).toBeCloseTo(1);
    expect(axes.x).toBeGreaterThan(0);
    expect(axes.z).toBeLessThan(0);
  });

  it('resolves a circle out of a wall box', () => {
    const result = resolveLocalMovement(
      { x: 0, y: 3.7, z: 0 },
      { x: 1.2, y: 3.7, z: 0 },
      0.35,
      [{ minX: 1, maxX: 2, minY: 2, maxY: 5, minZ: -2, maxZ: 2 }],
    );

    expect(result.x).toBeCloseTo(0.65);
    expect(result.z).toBeCloseTo(0);
  });

  it('resolves axes independently so diagonal movement can slide', () => {
    const result = resolveLocalMovement(
      { x: 0, y: 3.7, z: 0 },
      { x: 1.2, y: 3.7, z: 1.2 },
      0.35,
      [{ minX: 1, maxX: 2, minY: 2, maxY: 5, minZ: 1, maxZ: 2 }],
    );

    expect(result.x).toBeCloseTo(1.2);
    expect(result.z).toBeCloseTo(0.65);
  });

  it('slides along a single oriented wall box', () => {
    const rotationY = Math.PI / 4;
    const halfWidth = 2;
    const halfDepth = 0.1;
    const extent = (halfWidth + halfDepth) / Math.SQRT2;
    const result = resolveLocalMovement(
      { x: -1 / Math.SQRT2, y: 3.7, z: -1 / Math.SQRT2 },
      { x: 1 / Math.SQRT2, y: 3.7, z: -1 / Math.SQRT2 },
      0.35,
      [{
        minX: -extent,
        maxX: extent,
        minY: 2,
        maxY: 5,
        minZ: -extent,
        maxZ: extent,
        orientedFootprint: {
          centerX: 0,
          centerZ: 0,
          halfWidth,
          halfDepth,
          rotationY,
        },
      }],
    );

    expect(result.x).toBeCloseTo((1 - 0.45) / Math.SQRT2);
    expect(result.z).toBeCloseTo((-1 - 0.45) / Math.SQRT2);
  });

  it('does not collide with vertically separate boxes', () => {
    const result = resolveLocalMovement(
      { x: 0, y: 3.7, z: 0 },
      { x: 1.2, y: 3.7, z: 0 },
      0.35,
      [{ minX: 1, maxX: 2, minY: 7, maxY: 9, minZ: -2, maxZ: 2 }],
    );

    expect(result.x).toBeCloseTo(1.2);
  });

  it.each([
    ['bow', 17, 20, 17.525],
    ['stern', -17, -20, -17.525],
  ] as const)('stops an outward center approach at the %s rail', (end, startZ, targetZ, expectedZ) => {
    const result = resolveArcMovement(
      { x: 0, y: 3.7, z: startZ },
      { x: 0, y: 3.7, z: targetZ },
      0.35,
      arc(end),
    );

    expect(result.x).toBeCloseTo(0);
    expect(result.z).toBeCloseTo(expectedZ);
  });

  it.each([
    ['bow port', 'bow', -2, -3, 17, 18.5, -1],
    ['bow starboard', 'bow', 2, 3, 17, 18.5, 1],
    ['stern port', 'stern', -2, -3, -17, -18.5, -1],
    ['stern starboard', 'stern', 2, 3, -17, -18.5, 1],
  ] as const)(
    'retains tangential progress around the %s shoulder',
    (_label, end, startX, targetX, startZ, targetZ, direction) => {
      const result = resolveLocalMovement(
        { x: startX, y: 3.7, z: startZ },
        { x: targetX, y: 3.7, z: targetZ },
        0.35,
        [],
        [arc(end)],
      );

      expect(direction * result.x).toBeGreaterThan(direction * startX);
      expect(Math.abs(result.z)).toBeLessThan(Math.abs(targetZ));
    },
  );

  it('does not tunnel through a bow arc during a sprint-sized step', () => {
    const result = resolveLocalMovement(
      { x: 0, y: 3.7, z: 14 },
      { x: 0, y: 3.7, z: 24 },
      0.35,
      [],
      [arc('bow')],
    );

    expect(result.z).toBeCloseTo(17.525);
  });

  it('rechecks boxes after arc projection at a side-rail junction', () => {
    const result = resolveLocalMovement(
      { x: 2, y: 3.7, z: 16.5 },
      { x: 3, y: 3.7, z: 18.5 },
      0.35,
      [{ minX: 2.5, maxX: 2.6, minY: 2, maxY: 4, minZ: 17.05, maxZ: 17.2 }],
      [arc('bow')],
    );

    expect(result.z).toBeCloseTo(16.7);
  });

  it('ignores an arc above the player body', () => {
    const result = resolveLocalMovement(
      { x: 0, y: 6, z: 17 },
      { x: 0, y: 6, z: 20 },
      0.35,
      [],
      [arc('bow')],
    );

    expect(result).toEqual({ x: 0, y: 6, z: 20 });
  });

  it.each([
    ['bow then stern', ['bow', 'stern']],
    ['stern then bow', ['stern', 'bow']],
  ] as const)('leaves midship side movement unchanged with %s arcs', (_label, ends) => {
    const desired = { x: 5.526, y: 3.7, z: 0 };
    const result = resolveLocalMovement(
      { x: 5.4, y: 3.7, z: -0.2 },
      desired,
      0.35,
      [],
      ends.map((end) => arc(end)),
    );

    expect(result).toEqual(desired);
  });

  it('selects the highest collider top within the 0.6-unit support limit', () => {
    const deckEyeHeight = 3.72;
    const deckFeetY = deckEyeHeight - PLAYER_BODY_HEIGHT;
    const boxes: CollisionBox[] = [
      { minX: -0.8, maxX: 0.8, minY: deckFeetY, maxY: deckFeetY + 0.3, minZ: -0.8, maxZ: 0.8 },
      { minX: -0.6, maxX: 0.6, minY: deckFeetY, maxY: deckFeetY + 0.6, minZ: -0.6, maxZ: 0.6 },
    ];

    expect(MAX_JUMPABLE_SUPPORT_HEIGHT).toBe(0.6);
    expect(findSupportEyeHeight({ x: 0, z: 0 }, 0.35, deckEyeHeight, boxes))
      .toBeCloseTo(deckEyeHeight + 0.6);
  });

  it('keeps the deck as support for a taller object', () => {
    const deckEyeHeight = 3.72;
    const deckFeetY = deckEyeHeight - PLAYER_BODY_HEIGHT;
    const tall: CollisionBox = {
      minX: -0.6, maxX: 0.6,
      minY: deckFeetY, maxY: deckFeetY + 0.61,
      minZ: -0.6, maxZ: 0.6,
    };

    expect(findSupportEyeHeight({ x: 0, z: 0 }, 0.35, deckEyeHeight, [tall]))
      .toBe(deckEyeHeight);
  });

  it('rejects a low support when another collider would contain the player body', () => {
    const deckEyeHeight = 3.72;
    const deckFeetY = deckEyeHeight - PLAYER_BODY_HEIGHT;
    const support: CollisionBox = {
      minX: -0.6, maxX: 0.6,
      minY: deckFeetY, maxY: deckFeetY + 0.6,
      minZ: -0.6, maxZ: 0.6,
    };
    const obstruction: CollisionBox = {
      minX: -0.6, maxX: 0.6,
      minY: deckFeetY + 0.9, maxY: deckFeetY + 2.2,
      minZ: -0.6, maxZ: 0.6,
    };

    expect(findSupportEyeHeight(
      { x: 0, z: 0 }, 0.35, deckEyeHeight, [support, obstruction],
    )).toBe(deckEyeHeight);
  });

  it('allows a standing player through the production midship rail opening', () => {
    const ship = createTestShip();
    const currentX = SHIP_LAYOUT.rail.innerFaceX - 1.1;
    const desiredX = SHIP_LAYOUT.rail.innerFaceX + 0.2;
    try {
      const result = resolveLocalMovement(
        { x: currentX, y: PLAYER_Y, z: SHIP_LAYOUT.rail.starboardOpening.centerZ },
        { x: desiredX, y: PLAYER_Y, z: SHIP_LAYOUT.rail.starboardOpening.centerZ },
        PLAYER_LAYOUT_RADIUS,
        ship.colliders,
      );
      expect(result.x).toBeCloseTo(desiredX);
    } finally {
      ship.dispose();
    }
  });

  it('blocks a standing player at the adjacent production waist rail', () => {
    const ship = createTestShip();
    const currentX = SHIP_LAYOUT.rail.innerFaceX - 1.1;
    const desiredX = SHIP_LAYOUT.rail.innerFaceX + 0.2;
    const railZ = SHIP_LAYOUT.rail.starboardOpening.centerZ
      + SHIP_LAYOUT.rail.starboardOpening.width / 2 + 2;
    try {
      const result = resolveLocalMovement(
        { x: currentX, y: PLAYER_Y, z: railZ },
        { x: desiredX, y: PLAYER_Y, z: railZ },
        PLAYER_LAYOUT_RADIUS,
        ship.colliders,
      );
      expect(result.x).toBeLessThan(SHIP_LAYOUT.rail.innerFaceX);
    } finally {
      ship.dispose();
    }
  });

  it.each([
    ['port waist rail', new Vector3(-SHIP_LAYOUT.rail.innerFaceX, RAIL_SAMPLE_Y, 0)],
    ['starboard waist rail forward', new Vector3(SHIP_LAYOUT.rail.innerFaceX, RAIL_SAMPLE_Y, 4)],
    ['storage workbench', furniturePoint('workbench-port', 2.72)],
  ])('blocks the planned collision sample at the %s', (_label, point) => {
    const ship = createTestShip();
    try {
      const blocksPlayer = _label === 'stern machinery'
        ? ship.colliders.some((box) => playerOverlaps(point, PLAYER_LAYOUT_RADIUS, box))
        : ship.colliders.some((box) => pointInside(point, box));
      expect(blocksPlayer).toBe(true);
    } finally {
      ship.dispose();
    }
  });

  it('keeps both full exterior side routes clear of the assembled ship by player radius', () => {
    const ship = createTestShip();
    const exteriorLanes = ['port-exterior-main', 'starboard-exterior-main']
      .map((id) => SHIP_LAYOUT.lanes.find((candidate) => candidate.id === id)!);
    const minZ = Math.max(...exteriorLanes.map(({ bounds }) => bounds.minZ));
    const maxZ = Math.min(...exteriorLanes.map(({ bounds }) => bounds.maxZ));
    const intervalCount = Math.ceil(
      (maxZ - minZ) / (PLAYER_LAYOUT_RADIUS * 2),
    );
    const sideRouteSamples = Array.from({ length: intervalCount + 1 }, (_, index) =>
      minZ + (maxZ - minZ) * index / intervalCount)
      .flatMap((z) => [
        new Vector3(-EXTERIOR_ROUTE_X, PLAYER_Y, z),
        new Vector3(EXTERIOR_ROUTE_X, PLAYER_Y, z),
      ]);
    const loopTargets = [
      'port-loop-forward',
      'port-loop-aft',
      'starboard-loop-forward',
      'starboard-loop-aft',
    ].map(layoutTarget);
    try {
      [...sideRouteSamples, ...loopTargets].forEach((point) => expect(
        ship.colliders.every((box) => !playerOverlaps(point, 0.35, box)),
        `${point.x},${point.z}`,
      ).toBe(true));
    } finally {
      ship.dispose();
    }
  });

  it.each([
    ['port', -1],
    ['starboard', 1],
  ] as const)('crosses the %s storage doorway at player radius', (_side, direction) => {
    const ship = createTestShip();
    const door = layoutDoor(direction < 0 ? 'storage-port-door' : 'storage-starboard-door');
    const doorZ = door.center[1];
    try {
      const outside = new Vector3(direction * EXTERIOR_ROUTE_X, PLAYER_Y, doorZ);
      const inside = new Vector3(door.center[0] - direction * 0.55, PLAYER_Y, doorZ);
      const roomLoop = layoutTarget(direction < 0
        ? 'workroom-loop-port'
        : 'workroom-loop-starboard');
      followPath(outside, [inside, roomLoop], ship.colliders);
      followPath(roomLoop, [inside, outside], ship.colliders);
    } finally {
      ship.dispose();
    }
  });

  it('traverses storage, exterior, cabin, and wheelhouse as connected rooms', () => {
    const ship = createTestShip();
    try {
      followPath(layoutTarget('storage-port-door-inside'), [
        layoutTarget('storage-port-door-outside'),
        layoutTarget('port-loop-aft'),
        layoutTarget('port-loop-forward'),
        layoutTarget('cabin-port-door-outside'),
        layoutTarget('cabin-port-door-inside'),
        layoutTarget('start'),
        layoutTarget('cabin-port-door-inside'),
        layoutTarget('cabin-port-door-outside'),
        layoutTarget('port-loop-forward'),
        layoutTarget('wheelhouse-aft-door-outside'),
        layoutTarget('wheelhouse-aft-door-inside'),
        layoutTarget('wheelhouse-loop-port'),
      ], ship.colliders);
    } finally {
      ship.dispose();
    }
  });

  it('crosses the clear crew-cabin to wheelhouse passage longitudinally', () => {
    const ship = createTestShip();
    try {
      followPath(
        new Vector3(0, PLAYER_Y, 14.1),
        [new Vector3(0, PLAYER_Y, 16.4)],
        ship.colliders,
      );
    } finally {
      ship.dispose();
    }
  });

  it('crosses both wheelhouse doors and closes the exterior circuit', () => {
    const ship = createTestShip();
    const start = layoutTarget('starboard-loop-forward');
    try {
      followPath(layoutTarget('wheelhouse-aft-door-outside'), [
        layoutTarget('wheelhouse-aft-door-inside'),
        layoutTarget('wheelhouse-aft-door-outside'),
      ], ship.colliders);
      followPath(layoutTarget('wheelhouse-port-door-outside'), [
        layoutTarget('wheelhouse-port-door-inside'),
        layoutTarget('wheelhouse-port-door-outside'),
      ], ship.colliders);
      const end = followPath(start, [
        new Vector3(6.2, PLAYER_Y, 22),
        layoutTarget('bow-starboard'),
        layoutTarget('bow-center'),
        layoutTarget('bow-port'),
        layoutTarget('port-loop-forward'),
        new Vector3(
          -EXTERIOR_ROUTE_X,
          PLAYER_Y,
          laneCenter('forward-room-passage').z,
        ),
        layoutTarget('port-loop-forward'),
        layoutTarget('port-loop-aft'),
        layoutTarget('storage-port-door-outside'),
        layoutTarget('storage-port-door-inside'),
        layoutTarget('workroom-loop-port'),
        layoutTarget('workroom-loop-starboard'),
        layoutTarget('storage-starboard-door-inside'),
        layoutTarget('storage-starboard-door-outside'),
        layoutTarget('starboard-loop-aft'),
        start,
      ], ship.colliders);
      expect(end.distanceTo(start)).toBeLessThan(0.02);
    } finally {
      ship.dispose();
    }
  });

  it('follows both authored routes around each room island layout', () => {
    const ship = createTestShip();
    const point = (x: number, z: number) => new Vector3(x, PLAYER_Y, z);
    try {
      const crewMiddle = point(0, 9.6);
      followPath(crewMiddle, [
        point(-2.7, 9.6), point(-2.7, 6), point(2.7, 6), point(2.7, 9.6), crewMiddle,
      ], ship.colliders);
      followPath(crewMiddle, [
        point(-1.9, 9.6), point(-1.9, 11.6), point(1.9, 11.6), point(1.9, 9.6), crewMiddle,
      ], ship.colliders);

      const wheelhousePort = laneCenter('wheelhouse-loop-port');
      const wheelhouseStarboard = laneCenter('wheelhouse-loop-starboard');
      followPath(wheelhousePort, [
        point(0.35, 17.9), point(3, 17.9), point(0.35, 17.9), wheelhousePort,
      ], ship.colliders);
      followPath(wheelhousePort, [
        point(0.35, 21.1), point(1.4, 21.1), wheelhouseStarboard,
      ], ship.colliders);

      const workroomMiddle = point(0, -13.8);
      followPath(workroomMiddle, [
        point(-0.7, -13.8), point(-0.7, -16.5), point(0.7, -16.5),
        point(0.7, -13.8), workroomMiddle,
      ], ship.colliders);
      followPath(workroomMiddle, [
        point(-0.7, -13.8), point(-0.7, -11.3), point(0.7, -11.3),
        point(0.7, -13.8), workroomMiddle,
      ], ship.colliders);
    } finally {
      ship.dispose();
    }
  });

  it.each([
    [
      'starboard side window',
      new Vector3(4.7, PLAYER_Y, 18),
      new Vector3(5.8, PLAYER_Y, 18),
      'x',
    ],
    [
      'port forward window',
      new Vector3(-5, PLAYER_Y, 12),
      new Vector3(-6.1, PLAYER_Y, 12),
      'x',
    ],
    [
      'front window',
      new Vector3(1.5, PLAYER_Y, 21.2),
      new Vector3(1.5, PLAYER_Y, 22.5),
      'z',
    ],
  ] as const)('blocks radius movement through the %s', (_label, current, desired, axis) => {
    const ship = createTestShip();
    try {
      const result = resolveLocalMovement(current, desired, 0.35, ship.colliders);
      expect(result[axis]).not.toBeCloseTo(desired[axis]);
    } finally {
      ship.dispose();
    }
  });

  it('reaches all approved bow and stern deck targets with player-radius collision', () => {
    const ship = createTestShip();
    try {
      followPath(layoutTarget('port-loop-forward'), [
        layoutTarget('wheelhouse-port-door-outside'),
        new Vector3(
          layoutTarget('wheelhouse-port-door-outside').x,
          PLAYER_Y,
          SHIP_LAYOUT.zones.find(({ id }) => id === 'wheelhouse')!.bounds.maxZ
            + PLAYER_LAYOUT_RADIUS + 0.1,
        ),
        laneCenter('bow-port-approach'),
        layoutTarget('bow-port'),
        layoutTarget('bow-center'),
        layoutTarget('bow-starboard'),
      ], ship.colliders);
      followPath(layoutTarget('port-loop-aft'), [
        layoutTarget('storage-port-door-outside'),
        new Vector3(
          -EXTERIOR_ROUTE_X,
          PLAYER_Y,
          SHIP_LAYOUT.zones.find(({ id }) => id === 'storageWorkroom')!.bounds.minZ
            - PLAYER_LAYOUT_RADIUS,
        ),
        laneCenter('stern-port-approach'),
        new Vector3(-6.25, PLAYER_Y, -24.1),
        new Vector3(-6.25, PLAYER_Y, -25.2),
        layoutTarget('stern-port'),
        layoutTarget('stern-center'),
        layoutTarget('stern-starboard'),
      ], ship.colliders);
    } finally {
      ship.dispose();
    }
  });
});

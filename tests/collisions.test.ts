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
    try {
      const result = resolveLocalMovement(
        { x: 7.1, y: PLAYER_Y, z: 0 },
        { x: 8.1, y: PLAYER_Y, z: 0 },
        PLAYER_LAYOUT_RADIUS,
        ship.colliders,
      );
      expect(result.x).toBeCloseTo(8.1);
    } finally {
      ship.dispose();
    }
  });

  it('blocks a standing player at the adjacent production waist rail', () => {
    const ship = createTestShip();
    try {
      const result = resolveLocalMovement(
        { x: 7.1, y: PLAYER_Y, z: 4 },
        { x: 8.1, y: PLAYER_Y, z: 4 },
        PLAYER_LAYOUT_RADIUS,
        ship.colliders,
      );
      expect(result.x).toBeLessThan(7.7);
    } finally {
      ship.dispose();
    }
  });

  it.each([
    ['port waist rail', new Vector3(-SHIP_LAYOUT.rail.innerFaceX, RAIL_SAMPLE_Y, 0)],
    ['starboard waist rail forward', new Vector3(SHIP_LAYOUT.rail.innerFaceX, RAIL_SAMPLE_Y, 4)],
    ['wheelhouse console', new Vector3(0, 2.72, 16.6)],
    ['storage workbench', new Vector3(-2.8, 2.72, -12.72)],
    ['stern machinery', new Vector3(0, 3.72, -16.2)],
  ])('blocks the planned collision sample at the %s', (_label, point) => {
    const ship = createTestShip();
    try {
      expect(ship.colliders.some((box) => pointInside(point, box))).toBe(true);
    } finally {
      ship.dispose();
    }
  });

  it('keeps the assembled shell and furniture clear of the approved loop by player radius', () => {
    const ship = createTestShip();
    const loopCenters = [-10, -8.2, -6.5, -4, 0, 2, 5.2, 8.2, 10.4, 12]
      .flatMap((z) => [
        new Vector3(-EXTERIOR_ROUTE_X, PLAYER_Y, z),
        new Vector3(EXTERIOR_ROUTE_X, PLAYER_Y, z),
      ]);
    try {
      loopCenters.forEach((point) => expect(
        ship.colliders.every((box) => !playerOverlaps(point, 0.35, box)),
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
      followPath(outside, [inside, new Vector3(0, PLAYER_Y, doorZ)], ship.colliders);
      followPath(new Vector3(0, PLAYER_Y, doorZ), [inside, outside], ship.colliders);
    } finally {
      ship.dispose();
    }
  });

  it('traverses storage, exterior, cabin, and wheelhouse as connected rooms', () => {
    const ship = createTestShip();
    const storagePort = layoutDoor('storage-port-door');
    const cabinPort = layoutDoor('cabin-port-door');
    const wheelhouseAft = layoutDoor('wheelhouse-aft-door');
    const wheelhousePort = layoutDoor('wheelhouse-port-door');
    const storageZ = storagePort.center[1];
    const cabinZ = cabinPort.center[1] - cabinPort.width / 2 + PLAYER_LAYOUT_RADIUS + 0.15;
    const wheelhouseAftZ = wheelhouseAft.center[1];
    try {
      followPath(new Vector3(0, PLAYER_Y, storageZ), [
        new Vector3(storagePort.center[0] + 0.55, PLAYER_Y, storageZ),
        new Vector3(storagePort.center[0] - 0.55, PLAYER_Y, storageZ),
        new Vector3(-EXTERIOR_ROUTE_X, PLAYER_Y, storageZ),
        new Vector3(-EXTERIOR_ROUTE_X, PLAYER_Y, cabinZ),
        new Vector3(cabinPort.center[0] - 0.55, PLAYER_Y, cabinZ),
        new Vector3(cabinPort.center[0] + 0.55, PLAYER_Y, cabinZ),
        new Vector3(cabinPort.center[0] + 0.55, PLAYER_Y, 7.5),
        new Vector3(0, PLAYER_Y, 7.5),
        new Vector3(cabinPort.center[0] + 0.55, PLAYER_Y, 7.5),
        new Vector3(cabinPort.center[0] + 0.55, PLAYER_Y, cabinZ),
        new Vector3(cabinPort.center[0] - 0.55, PLAYER_Y, cabinZ),
        new Vector3(-EXTERIOR_ROUTE_X, PLAYER_Y, cabinZ),
        new Vector3(-EXTERIOR_ROUTE_X, PLAYER_Y, wheelhouseAftZ - 0.5),
        new Vector3(wheelhouseAft.center[0], PLAYER_Y, wheelhouseAftZ - 0.5),
        new Vector3(wheelhouseAft.center[0], PLAYER_Y, wheelhouseAftZ),
        new Vector3(wheelhouseAft.center[0], PLAYER_Y, wheelhouseAftZ + 0.55),
        new Vector3(-1.5, PLAYER_Y, wheelhouseAftZ + 0.55),
        new Vector3(-1.5, PLAYER_Y, wheelhousePort.center[1]),
      ], ship.colliders);
    } finally {
      ship.dispose();
    }
  });

  it('enters one wheelhouse door, exits the second, and closes the exterior circuit', () => {
    const ship = createTestShip();
    const target = (id: string): Vector3 => {
      const position = SHIP_LAYOUT.targets.find((candidate) => candidate.id === id)!.position;
      return new Vector3(position[0], PLAYER_Y, position[1]);
    };
    const wheelhouseAft = layoutDoor('wheelhouse-aft-door');
    const wheelhousePort = layoutDoor('wheelhouse-port-door');
    const storagePort = layoutDoor('storage-port-door');
    const storageStarboard = layoutDoor('storage-starboard-door');
    const storageDetourZ = storagePort.center[1] - 0.45;
    const start = new Vector3(EXTERIOR_ROUTE_X, PLAYER_Y, wheelhouseAft.center[1] - 0.5);
    try {
      const end = followPath(start, [
        target('bow-starboard'),
        target('bow-center'),
        target('bow-port'),
        new Vector3(-EXTERIOR_ROUTE_X, PLAYER_Y, wheelhouseAft.center[1] - 0.5),
        new Vector3(wheelhouseAft.center[0], PLAYER_Y, wheelhouseAft.center[1] - 0.5),
        new Vector3(wheelhouseAft.center[0], PLAYER_Y, wheelhouseAft.center[1]),
        new Vector3(wheelhouseAft.center[0], PLAYER_Y, wheelhouseAft.center[1] + 0.55),
        new Vector3(-1.5, PLAYER_Y, wheelhouseAft.center[1] + 0.55),
        new Vector3(-1.5, PLAYER_Y, wheelhousePort.center[1]),
        new Vector3(wheelhousePort.center[0] + 0.55, PLAYER_Y, wheelhousePort.center[1]),
        new Vector3(wheelhousePort.center[0] - 0.55, PLAYER_Y, wheelhousePort.center[1]),
        new Vector3(-EXTERIOR_ROUTE_X, PLAYER_Y, wheelhousePort.center[1]),
        new Vector3(-EXTERIOR_ROUTE_X, PLAYER_Y, storagePort.center[1]),
        new Vector3(storagePort.center[0] - 0.55, PLAYER_Y, storagePort.center[1]),
        new Vector3(storagePort.center[0] + 0.55, PLAYER_Y, storagePort.center[1]),
        new Vector3(storagePort.center[0] + 0.55, PLAYER_Y, storageDetourZ),
        new Vector3(0, PLAYER_Y, storageDetourZ),
        new Vector3(storageStarboard.center[0] - 0.55, PLAYER_Y, storageDetourZ),
        new Vector3(storageStarboard.center[0] - 0.55, PLAYER_Y, storageStarboard.center[1]),
        new Vector3(storageStarboard.center[0] + 0.55, PLAYER_Y, storageStarboard.center[1]),
        new Vector3(EXTERIOR_ROUTE_X, PLAYER_Y, storageStarboard.center[1]),
        start,
      ], ship.colliders);
      expect(end.distanceTo(start)).toBeLessThan(0.02);
    } finally {
      ship.dispose();
    }
  });

  it.each([
    ['starboard side window', new Vector3(3.2, 3.72, 13), new Vector3(5.2, 3.72, 13), 'x'],
    ['port forward window', new Vector3(-3.2, 3.72, 13), new Vector3(-5.2, 3.72, 13), 'x'],
    ['front window', new Vector3(0, 3.72, 16.5), new Vector3(0, 3.72, 18.2), 'z'],
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
    const target = (id: string): Vector3 => {
      const position = SHIP_LAYOUT.targets.find((candidate) => candidate.id === id)!.position;
      return new Vector3(position[0], PLAYER_Y, position[1]);
    };
    try {
      followPath(new Vector3(-EXTERIOR_ROUTE_X, PLAYER_Y, 12), [
        target('bow-port'),
        target('bow-center'),
        target('bow-starboard'),
      ], ship.colliders);
      followPath(new Vector3(-EXTERIOR_ROUTE_X, PLAYER_Y, -12), [
        target('stern-port'),
        target('stern-center'),
        target('stern-starboard'),
      ], ship.colliders);
    } finally {
      ship.dispose();
    }
  });
});

import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { movementAxes, resolveLocalMovement } from '../src/player/collisions';
import type { CollisionBox } from '../src/player/collisions';
import { createShip } from '../src/world/Ship';

const pointInside = (point: Vector3, box: CollisionBox): boolean =>
  point.x >= box.minX && point.x <= box.maxX &&
  point.y >= box.minY && point.y <= box.maxY &&
  point.z >= box.minZ && point.z <= box.maxZ;

const playerOverlaps = (point: Vector3, radius: number, box: CollisionBox): boolean => {
  if (point.y < box.minY || point.y > box.maxY) return false;
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
    ['port outer hull', new Vector3(-6.2, 3.72, 0)],
    ['starboard outer hull forward', new Vector3(6.2, 3.72, 4)],
    ['wheelhouse console', new Vector3(0, 3.72, 14.5)],
    ['storage workbench', new Vector3(-4.4, 3.72, -9.4)],
    ['stern machinery', new Vector3(0, 3.72, -13)],
  ])('blocks the planned player height at the %s', (_label, point) => {
    const ship = createShip();
    try {
      expect(ship.colliders.some((box) => pointInside(point, box))).toBe(true);
    } finally {
      ship.dispose();
    }
  });

  it('keeps the assembled shell and furniture clear of the approved loop by player radius', () => {
    const ship = createShip();
    const loopCenters = [-10, -8.2, -6.5, -4, 0, 2, 5.2, 8.2, 10.4, 12, 14.5]
      .flatMap((z) => [
        new Vector3(-5.6, 3.72, z),
        new Vector3(5.6, 3.72, z),
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
    const ship = createShip();
    try {
      const outside = new Vector3(direction * 5.6, 3.72, -8.2);
      const inside = new Vector3(direction * 3.3, 3.72, -8.2);
      followPath(outside, [inside, new Vector3(0, 3.72, -8.2)], ship.colliders);
      followPath(new Vector3(0, 3.72, -8.2), [inside, outside], ship.colliders);
    } finally {
      ship.dispose();
    }
  });

  it('traverses storage, exterior, cabin, and wheelhouse as connected rooms', () => {
    const ship = createShip();
    try {
      followPath(new Vector3(0, 3.72, -8.2), [
        new Vector3(-3.3, 3.72, -8.2),
        new Vector3(-5.6, 3.72, -8.2),
        new Vector3(-5.6, 3.72, 4.5),
        new Vector3(-3.3, 3.72, 4.5),
        new Vector3(0, 3.72, 4.5),
        new Vector3(0, 3.72, 7.5),
        new Vector3(0, 3.72, 4.5),
        new Vector3(-3.3, 3.72, 4.5),
        new Vector3(-5.6, 3.72, 4.5),
        new Vector3(-5.6, 3.72, 10.975),
        new Vector3(0, 3.72, 10.975),
        new Vector3(0, 3.72, 11.4),
        new Vector3(0, 3.72, 11.95),
        new Vector3(-1.5, 3.72, 11.95),
        new Vector3(-1.5, 3.72, 13.2),
      ], ship.colliders);
    } finally {
      ship.dispose();
    }
  });

  it('enters one wheelhouse door, exits the second, and closes the exterior circuit', () => {
    const ship = createShip();
    const start = new Vector3(5.6, 3.72, 10.975);
    try {
      const end = followPath(start, [
        new Vector3(0, 3.72, 10.975),
        new Vector3(0, 3.72, 11.4),
        new Vector3(0, 3.72, 11.95),
        new Vector3(-1.5, 3.72, 11.95),
        new Vector3(-1.5, 3.72, 12.8),
        new Vector3(-3.3, 3.72, 12.8),
        new Vector3(-5.6, 3.72, 12.8),
        new Vector3(-5.6, 3.72, -8.2),
        new Vector3(-3.3, 3.72, -8.2),
        new Vector3(0, 3.72, -8.2),
        new Vector3(3.3, 3.72, -8.2),
        new Vector3(5.6, 3.72, -8.2),
        start,
      ], ship.colliders);
      expect(end.distanceTo(start)).toBeLessThan(0.02);
    } finally {
      ship.dispose();
    }
  });

  it.each([
    ['starboard side window', new Vector3(3.2, 3.72, 14.4), new Vector3(5.2, 3.72, 14.4), 'x'],
    ['port forward window', new Vector3(-3.2, 3.72, 14.6), new Vector3(-5.2, 3.72, 14.6), 'x'],
    ['front window', new Vector3(0, 3.72, 15.1), new Vector3(0, 3.72, 16.4), 'z'],
  ] as const)('blocks radius movement through the %s', (_label, current, desired, axis) => {
    const ship = createShip();
    try {
      const result = resolveLocalMovement(current, desired, 0.35, ship.colliders);
      expect(result[axis]).not.toBeCloseTo(desired[axis]);
    } finally {
      ship.dispose();
    }
  });
});

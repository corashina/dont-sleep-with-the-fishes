import { describe, expect, it } from 'vitest';
import { movementAxes, resolveLocalMovement } from '../src/player/collisions';
import { createShip } from '../src/world/Ship';

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

  it('cannot cross the bridge console in one large movement', () => {
    const console = createShip().colliders.find((box) =>
      box.minX === -1.25 && box.maxX === 1.25 && box.minZ === 6.65 && box.maxZ === 7.55)!;

    const result = resolveLocalMovement(
      { x: 0, y: 3.72, z: 8.4 },
      { x: 0, y: 3.72, z: 5 },
      0.35,
      [console],
    );

    expect(result.z).toBeCloseTo(7.9);
  });

  it('cannot cross a thin rail in one very large movement', () => {
    const rail = createShip().colliders.find((box) =>
      box.minX === 3.76 && box.maxX === 3.94 && box.minZ === -10.7 && box.maxZ === 2.3)!;

    const result = resolveLocalMovement(
      { x: 0, y: 3.72, z: 0 },
      { x: 50, y: 3.72, z: 0 },
      0.35,
      [rail],
    );

    expect(result.x).toBeCloseTo(3.41);
  });
});

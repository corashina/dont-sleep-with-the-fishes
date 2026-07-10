import { describe, expect, it } from 'vitest';
import { Mesh, Vector3 } from 'three';
import { ITEM_IDS } from '../src/game/ItemState';
import type { CollisionBox } from '../src/player/collisions';
import { createLifeboat } from '../src/world/Lifeboat';
import { createProp } from '../src/world/PropFactory';
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

const geometrySignature = (id: (typeof ITEM_IDS)[number]): string => {
  const entries: string[] = [];
  createProp(id).traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.computeBoundingBox();
    const bounds = object.geometry.boundingBox;
    if (!bounds) return;
    const size = bounds.getSize(new Vector3());
    const values = [
      size.x, size.y, size.z,
      object.position.x, object.position.y, object.position.z,
      object.rotation.x, object.rotation.y, object.rotation.z,
      object.scale.x, object.scale.y, object.scale.z,
    ].map((value) => Math.round(value * 1_000) / 1_000);
    entries.push(`${object.geometry.type}:${values.join(',')}`);
  });
  return entries.sort().join('|');
};

describe('procedural world builders', () => {
  it.each(ITEM_IDS)('builds a visible mesh for %s', (id) => {
    const prop = createProp(id);
    let meshCount = 0;
    prop.traverse((object) => {
      if (object instanceof Mesh) meshCount += 1;
    });
    expect(prop.userData.itemId).toBe(id);
    expect(meshCount).toBeGreaterThan(0);
  });

  it('gives all eight props distinct procedural geometry signatures', () => {
    const signatures = ITEM_IDS.map(geometrySignature);
    expect(new Set(signatures)).toHaveLength(ITEM_IDS.length);
  });

  it('builds the two-zone ship contract', () => {
    const ship = createShip();
    expect(ship.itemSpawnPoints).toHaveLength(8);
    expect(ship.colliders.length).toBeGreaterThanOrEqual(10);
    expect(ship.playerStart.y).toBeGreaterThan(2);
    expect(ship.evacuationPoint.x).toBeGreaterThan(3);
  });

  it.each([
    ['starboard rail forward span', new Vector3(3.93, 3.72, 2.2)],
    ['port rail stern span', new Vector3(-3.93, 3.72, -10.6)],
    ['bridge console', new Vector3(0, 3.72, 7.1)],
    ['starboard cargo', new Vector3(1.6, 3.72, -5.5)],
    ['port cargo', new Vector3(-1.8, 3.72, -7.5)],
  ])('blocks the planned player height at the %s', (_label, point) => {
    const ship = createShip();
    expect(ship.colliders.some((box) => pointInside(point, box))).toBe(true);
  });

  it('keeps an inboard route within the evacuation threshold', () => {
    const ship = createShip();
    const routeStart = new Vector3(3.15, 3.72, 0);
    const reachablePoint = new Vector3(3.15, 3.72, -5);
    const route = Array.from({ length: 11 }, (_, index) =>
      new Vector3().lerpVectors(routeStart, reachablePoint, index / 10));

    expect(route.every((point) =>
      ship.colliders.every((box) => !playerOverlaps(point, 0.35, box)))).toBe(true);
    expect(reachablePoint.distanceTo(ship.evacuationPoint)).toBeLessThanOrEqual(1.7);
    expect(ship.evacuationPoint.x).toBeGreaterThan(3);
    expect(ship.evacuationPoint.x).toBeLessThan(3.5);
  });

  it('builds exactly five lifeboat supply slots', () => {
    const lifeboat = createLifeboat();
    expect(lifeboat.slots).toHaveLength(5);
    lifeboat.slots.forEach((slot) => {
      let meshCount = 0;
      slot.traverse((object) => {
        if (object instanceof Mesh) meshCount += 1;
      });
      expect(meshCount).toBeGreaterThan(0);
    });
  });

  it('limits acceptance to the lifeboat interior above its floor', () => {
    const { acceptanceBox } = createLifeboat();
    expect(acceptanceBox.containsPoint(new Vector3(0, 0, 0))).toBe(true);
    expect(acceptanceBox.min.x).toBeGreaterThanOrEqual(-1.05);
    expect(acceptanceBox.max.x).toBeLessThanOrEqual(1.05);
    expect(acceptanceBox.min.y).toBeGreaterThan(-0.275);
    expect(acceptanceBox.min.z).toBeGreaterThan(-2.375);
    expect(acceptanceBox.max.z).toBeLessThan(2.375);
  });

  it.each([
    ['hull side', new Vector3(1.25, 0, 0)],
    ['endcap', new Vector3(0, 0, 2.55)],
    ['underside', new Vector3(0, -0.4, 0)],
  ])('rejects a thrown item at the lifeboat %s', (_label, point) => {
    expect(createLifeboat().acceptanceBox.containsPoint(point)).toBe(false);
  });
});

import { Box3, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  ITEM_DEFINITIONS,
  type ItemId,
  type ItemInstance,
  type ItemInstanceId,
} from '../src/game/ItemState';
import {
  boatSupplyTransform,
  boatStorageSurface,
  boatStorageTransform,
  type BoatStorageTransform,
} from '../src/world/BoatStorage';
import {
  LIFEBOAT_DISPLAY_SHELF_SURFACE_Y,
  LIFEBOAT_FLOOR_SURFACE_Y,
  lifeboatHullHalfWidthAt,
} from '../src/world/Lifeboat';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';

function item(type: ItemId, index = 1): ItemInstance {
  return {
    instanceId: `${type}-${index}` as ItemInstanceId,
    type,
  };
}

function transformedBounds(type: ItemId, transform: BoatStorageTransform): Box3 {
  const modelBounds = ITEM_MODEL_SPECS[type].normalizedBounds;
  const bounds = new Box3(
    new Vector3(...modelBounds.min),
    new Vector3(...modelBounds.max),
  ).applyMatrix4(new Matrix4().makeRotationFromEuler(transform.rotation));
  bounds.min.multiplyScalar(transform.scale).add(transform.position);
  bounds.max.multiplyScalar(transform.scale).add(transform.position);
  return bounds;
}

function storageBounds(instance: ItemInstance): Box3 {
  return transformedBounds(instance.type, boatStorageTransform(instance));
}

describe('BoatStorage', () => {
  it('rests the map on the display bench', () => {
    const map = boatStorageTransform(item('map'));

    expect(boatStorageSurface(item('map'))).toBe('shelf');
    expect(map.position.z).toBeGreaterThanOrEqual(-1.82);
    expect(map.position.z).toBeLessThanOrEqual(-1.34);
    expect(map.rotation.x).toBe(0);
    expect(storageBounds(item('map')).min.y)
      .toBeCloseTo(LIFEBOAT_DISPLAY_SHELF_SURFACE_Y);
  });

  it('stacks the third food above two cans on the floor', () => {
    const food = [1, 2, 3].map((index) => (
      boatStorageTransform(item('cannedFood', index))
    ));
    const bait = boatStorageTransform(item('baitTin'));
    const averageFoodX = food.reduce((sum, transform) => sum + transform.position.x, 0)
      / food.length;

    expect(food.every((_, index) => boatStorageSurface(item('cannedFood', index + 1)) === 'floor'))
      .toBe(true);
    expect(averageFoodX).toBeCloseTo(0);
    expect(food.every(({ position }) => position.z > bait.position.z)).toBe(true);
    expect(food[0]!.position.x).toBeLessThan(food[1]!.position.x);
    expect(food[2]!.position.x).toBeCloseTo(
      (food[0]!.position.x + food[1]!.position.x) / 2,
    );
    expect(food[0]!.position.y).toBeCloseTo(food[1]!.position.y);
    expect(transformedBounds('cannedFood', food[2]!).min.y)
      .toBeGreaterThan(transformedBounds('cannedFood', food[0]!).max.y);
    food.slice(0, 2).forEach((_, index) => {
      expect(storageBounds(item('cannedFood', index + 1)).min.y)
        .toBeCloseTo(LIFEBOAT_FLOOR_SURFACE_Y);
    });
  });

  it('places three bait jars beside each other on the bench', () => {
    const bait = [0, 1, 2].map((index) => boatSupplyTransform('baitTin', index));
    const otherItems = (Object.keys(ITEM_DEFINITIONS) as ItemId[])
      .filter((type) => type !== 'baitTin' && type !== 'carlitos')
      .flatMap((type) => Array.from(
        { length: ITEM_DEFINITIONS[type].spawnCount },
        (_, index) => item(type, index + 1),
      ));

    expect(bait[0]!.position.x).toBeLessThan(bait[1]!.position.x);
    expect(bait[1]!.position.x).toBeLessThan(bait[2]!.position.x);
    expect(bait[0]!.position.y).toBeCloseTo(bait[1]!.position.y);
    expect(bait[1]!.position.y).toBeCloseTo(bait[2]!.position.y);
    for (let left = 0; left < bait.length; left += 1) {
      expect(transformedBounds('baitTin', bait[left]!).min.y)
        .toBeCloseTo(LIFEBOAT_DISPLAY_SHELF_SURFACE_Y);
      for (let right = left + 1; right < bait.length; right += 1) {
        expect(
          transformedBounds('baitTin', bait[left]!)
            .intersectsBox(transformedBounds('baitTin', bait[right]!)),
        ).toBe(false);
      }
      for (const other of otherItems) {
        expect(
          transformedBounds('baitTin', bait[left]!)
            .intersectsBox(storageBounds(other)),
          `baitTin-${left + 1} overlaps ${other.instanceId}`,
        ).toBe(false);
      }
    }
  });

  it('supports the map, tape, and compass on the bench', () => {
    const compass = boatStorageTransform(item('compass'));
    const ductTape = boatStorageTransform(item('ductTape'));
    const map = boatStorageTransform(item('map'));

    expect(map.rotation.x).toBe(0);
    expect(ductTape.rotation.x).toBe(Math.PI / 2);
    expect(compass.rotation.x).toBe(0);
    for (const id of ['map', 'ductTape', 'compass'] as const) {
      expect(storageBounds(item(id)).min.y)
        .toBeCloseTo(LIFEBOAT_DISPLAY_SHELF_SURFACE_Y);
    }
  });

  it('points the spyglass toward the player', () => {
    const spyglass = boatStorageTransform(item('spyglass'));

    expect(spyglass.rotation.y).toBeCloseTo(Math.PI + 0.14);
  });

  it('places a compact shotgun beside a clear flare gun', () => {
    const flareGun = boatStorageTransform(item('flareGun'));
    const shotgun = boatStorageTransform(item('shotgun'));

    expect(boatStorageSurface(item('flareGun'))).toBe('floor');
    expect(Math.abs(shotgun.rotation.y)).toBeLessThan(0.25);
    expect(flareGun.position.distanceTo(shotgun.position)).toBeLessThan(0.5);
    expect(storageBounds(item('flareGun')).intersectsBox(storageBounds(item('shotgun'))))
      .toBe(false);
  });

  it('leans the upright anchor right and the swim ring left', () => {
    const anchor = boatStorageTransform(item('anchor'));
    const anchorBounds = storageBounds(item('anchor'));
    const anchorHullEdge = lifeboatHullHalfWidthAt(anchor.position.z)!;
    const swimRing = boatStorageTransform(item('swimRing'));

    expect(anchor.position.x).toBeGreaterThan(1);
    expect(anchor.rotation.x).toBe(0);
    expect(anchor.rotation.z).toBeLessThan(0);
    expect(anchorBounds.max.x).toBeLessThan(anchorHullEdge - 0.03);
    expect(swimRing.position.x).toBeLessThan(-1);
    expect(Math.abs(swimRing.rotation.z)).toBeGreaterThan(0.7);
    expect(storageBounds(item('anchor')).min.y).toBeCloseTo(LIFEBOAT_FLOOR_SURFACE_Y);
    expect(storageBounds(item('swimRing')).min.y).toBeCloseTo(LIFEBOAT_FLOOR_SURFACE_Y);
  });

  it('stands the scuba gear clear of the right hull wall', () => {
    const scuba = boatStorageTransform(item('scubaSet'));
    const bounds = storageBounds(item('scubaSet'));
    const hullEdge = lifeboatHullHalfWidthAt(scuba.position.z)!;

    expect(scuba.position.z).toBeLessThan(-0.4);
    expect(scuba.rotation.x).toBe(0);
    expect(scuba.rotation.z).toBe(0);
    expect(bounds.max.x).toBeLessThanOrEqual(hullEdge - 0.20);
    expect(hullEdge - bounds.max.x).toBeLessThan(0.26);
    expect(bounds.min.y).toBeCloseTo(LIFEBOAT_FLOOR_SURFACE_Y);
  });

  it('aims the flashlight and umbrella handles toward the player', () => {
    const flashlight = boatStorageTransform(item('flashlight'));
    const umbrella = boatStorageTransform(item('umbrella'));

    expect(flashlight.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(umbrella.rotation.x).toBe(0);
    expect(umbrella.rotation.y).toBeCloseTo(-Math.PI / 4);
    expect(umbrella.rotation.z).toBeCloseTo(-42.7 * Math.PI / 180);
  });

  it('keeps every stored item bound clear of other items', () => {
    const instances = (Object.keys(ITEM_DEFINITIONS) as ItemId[])
      .flatMap((type) => Array.from(
        { length: ITEM_DEFINITIONS[type].spawnCount },
        (_, index) => item(type, index + 1),
      ))
      .filter(({ type }) => type !== 'carlitos');

    for (let left = 0; left < instances.length; left += 1) {
      for (let right = left + 1; right < instances.length; right += 1) {
        const first = instances[left]!;
        const second = instances[right]!;
        const firstBounds = storageBounds(first);
        const secondBounds = storageBounds(second);
        expect(
          firstBounds.intersectsBox(secondBounds),
          `${first.instanceId} ${JSON.stringify([firstBounds.min.toArray(), firstBounds.max.toArray()])}`
          + ` overlaps ${second.instanceId} ${JSON.stringify([secondBounds.min.toArray(), secondBounds.max.toArray()])}`,
        ).toBe(false);
      }
    }
  });
});

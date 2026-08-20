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
  LIFEBOAT_STARBOARD_EDGE_SHELF_SURFACE_Y,
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
  it('centers the map ahead and places the energy bar between bait and compass', () => {
    const map = boatStorageTransform(item('map'));
    const energyBar = boatStorageTransform(item('energyBar'));
    const bait = boatStorageTransform(item('baitTin'));
    const compass = boatStorageTransform(item('compass'));

    expect(boatStorageSurface(item('map'))).toBe('shelf');
    expect(boatStorageSurface(item('energyBar'))).toBe('shelf');
    expect(map.position.z).toBeCloseTo(0.65);
    expect(map.position.x).toBe(0);
    expect(energyBar.position.z).toBeCloseTo(-1.64);
    expect(energyBar.position.x).toBeGreaterThan(bait.position.x);
    expect(energyBar.position.x).toBeLessThan(compass.position.x);
    expect(map.rotation.x).toBe(0);
    expect(map.rotation.y).toBe(0);
    expect(energyBar.rotation.y).toBeCloseTo(Math.PI);
    expect(storageBounds(item('map')).min.y)
      .toBeCloseTo(LIFEBOAT_DISPLAY_SHELF_SURFACE_Y);
    expect(storageBounds(item('energyBar')).min.y)
      .toBeCloseTo(LIFEBOAT_DISPLAY_SHELF_SURFACE_Y);
    expect(storageBounds(item('map')).min.z).toBeGreaterThanOrEqual(0.54);
    expect(storageBounds(item('energyBar')).intersectsBox(storageBounds(item('baitTin'))))
      .toBe(false);
    expect(storageBounds(item('energyBar')).intersectsBox(storageBounds(item('compass'))))
      .toBe(false);
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

  it('groups three bait jars in a tight circle on the bench', () => {
    const bait = [0, 1, 2].map((index) => boatSupplyTransform('baitTin', index));
    const otherItems = (Object.keys(ITEM_DEFINITIONS) as ItemId[])
      .filter((type) => type !== 'baitTin' && type !== 'carlitos')
      .flatMap((type) => Array.from(
        { length: ITEM_DEFINITIONS[type].spawnCount },
        (_, index) => item(type, index + 1),
    ));

    expect(bait[0]!.position.x).toBeLessThan(bait[1]!.position.x);
    expect(bait[2]!.position.x).toBeCloseTo(
      (bait[0]!.position.x + bait[1]!.position.x) / 2,
    );
    expect(bait[2]!.position.x).toBeCloseTo(0);
    expect(bait[2]!.position.z).toBeLessThan(bait[0]!.position.z);
    expect(bait[0]!.position.z).toBeCloseTo(bait[1]!.position.z);
    expect(bait[0]!.position.y).toBeCloseTo(bait[1]!.position.y);
    expect(bait[1]!.position.y).toBeCloseTo(bait[2]!.position.y);
    for (let left = 0; left < bait.length; left += 1) {
      expect(transformedBounds('baitTin', bait[left]!).min.y)
        .toBeCloseTo(LIFEBOAT_DISPLAY_SHELF_SURFACE_Y);
      for (let right = left + 1; right < bait.length; right += 1) {
        expect(
          transformedBounds('baitTin', bait[left]!)
            .intersectsBox(transformedBounds('baitTin', bait[right]!)),
          `baitTin-${left + 1} overlaps baitTin-${right + 1}`,
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
    const bait = boatStorageTransform(item('baitTin'));
    const spyglass = boatStorageTransform(item('spyglass'));
    const energyBar = boatStorageTransform(item('energyBar'));
    const compassFaceNormal = new Vector3(0, 0, 1).applyEuler(compass.rotation);

    expect(map.rotation.x).toBe(0);
    expect(ductTape.rotation.x).toBe(Math.PI / 2);
    expect(compass.rotation.x).toBeCloseTo(Math.PI / 2);
    expect(compass.rotation.y).toBe(energyBar.rotation.y);
    expect(compass.rotation.z).toBeCloseTo(0.16);
    expect(compassFaceNormal.y).toBeCloseTo(1);
    expect(ductTape.position.x).toBeGreaterThan(spyglass.position.x);
    expect(ductTape.position.x).toBeLessThan(bait.position.x);
    for (const id of ['map', 'ductTape', 'compass'] as const) {
      expect(storageBounds(item(id)).min.y)
        .toBeCloseTo(LIFEBOAT_DISPLAY_SHELF_SURFACE_Y);
    }
  });

  it('points the spyglass toward the player', () => {
    const spyglass = boatStorageTransform(item('spyglass'));

    expect(spyglass.rotation.y).toBeCloseTo(Math.PI + 0.14);
  });

  it('leans the upright shotgun against the left hull and keeps the flare gun on the widened edge shelf', () => {
    const flareGun = boatStorageTransform(item('flareGun'));
    const shotgun = boatStorageTransform(item('shotgun'));
    const shotgunBounds = storageBounds(item('shotgun'));
    const shotgunHullEdge = lifeboatHullHalfWidthAt(shotgun.position.z)!;
    const shotgunWallGap = shotgunBounds.min.x + shotgunHullEdge;
    const shotgunModelBounds = ITEM_MODEL_SPECS.shotgun.normalizedBounds;
    const shotgunMatrix = new Matrix4().makeRotationFromEuler(shotgun.rotation);
    const shotgunBarrel = new Vector3(0, 0, shotgunModelBounds.min[2])
      .applyMatrix4(shotgunMatrix)
      .multiplyScalar(shotgun.scale)
      .add(shotgun.position);
    const shotgunStock = new Vector3(0, 0, shotgunModelBounds.max[2])
      .applyMatrix4(shotgunMatrix)
      .multiplyScalar(shotgun.scale)
      .add(shotgun.position);

    expect(boatStorageSurface(item('flareGun'))).toBe('edgeShelf');
    expect(boatStorageSurface(item('shotgun'))).toBe('floor');
    expect(shotgun.position.x).toBeLessThan(-1);
    expect(shotgun.position.z).toBeCloseTo(-0.55);
    expect(shotgun.rotation.x).toBeCloseTo(Math.PI / 2);
    expect(shotgun.rotation.y).toBeCloseTo(0.20);
    expect(shotgun.rotation.z).toBe(0);
    expect(shotgunBarrel.y).toBeGreaterThan(shotgunStock.y);
    expect(shotgunBarrel.x).toBeLessThan(shotgunStock.x);
    expect(shotgunBarrel.x).toBeGreaterThan(-shotgunHullEdge + 0.12);
    expect(shotgunBarrel.x).toBeLessThan(-shotgunHullEdge + 0.16);
    expect(shotgunWallGap).toBeGreaterThan(0.11);
    expect(shotgunWallGap).toBeLessThan(0.13);
    const aimedYaw = Math.PI / 2 + 0.22;
    const flareAim = new Vector3(1, 0, 0).applyEuler(flareGun.rotation);
    expect(flareGun.position.x).toBeCloseTo(-1.38);
    expect(flareGun.position.z).toBeCloseTo(-0.34);
    expect(flareGun.rotation.x).toBe(0);
    expect(flareGun.rotation.y).toBeCloseTo(-Math.PI / 2 + 0.22);
    expect(flareGun.rotation.z).toBeCloseTo(Math.PI);
    expect(flareAim.x).toBeCloseTo(Math.cos(aimedYaw));
    expect(flareAim.y).toBeCloseTo(0);
    expect(flareAim.z).toBeCloseTo(-Math.sin(aimedYaw));
    expect(storageBounds(item('flareGun')).intersectsBox(storageBounds(item('shotgun'))))
      .toBe(false);
    for (const id of ['shotgun', 'flareGun'] as const) {
      const transform = boatStorageTransform(item(id));
      const bounds = storageBounds(item(id));
      const hullEdge = lifeboatHullHalfWidthAt(transform.position.z)!;
      expect(bounds.min.x).toBeGreaterThan(-hullEdge + 0.05);
      expect(bounds.max.x).toBeLessThan(hullEdge - 0.05);
      expect(bounds.min.y).toBeCloseTo(
        id === 'flareGun'
          ? LIFEBOAT_STARBOARD_EDGE_SHELF_SURFACE_Y
          : LIFEBOAT_FLOOR_SURFACE_Y,
      );
    }
  });

  it('leans the visible anchor against the right hull and moves the swim ring aft', () => {
    const anchor = boatStorageTransform(item('anchor'));
    const anchorBounds = storageBounds(item('anchor'));
    const anchorHullEdge = lifeboatHullHalfWidthAt(anchor.position.z)!;
    const anchorWallGap = anchorHullEdge - anchorBounds.max.x;
    const anchorModelBounds = ITEM_MODEL_SPECS.anchor.normalizedBounds;
    const anchorMatrix = new Matrix4().makeRotationFromEuler(anchor.rotation);
    const anchorTop = new Vector3(0, anchorModelBounds.max[1], 0)
      .applyMatrix4(anchorMatrix)
      .multiplyScalar(anchor.scale)
      .add(anchor.position);
    const anchorBottom = new Vector3(0, anchorModelBounds.min[1], 0)
      .applyMatrix4(anchorMatrix)
      .multiplyScalar(anchor.scale)
      .add(anchor.position);
    const swimRing = boatStorageTransform(item('swimRing'));

    expect(anchor.position.x).toBeGreaterThan(1);
    expect(anchor.position.z).toBeCloseTo(-0.50);
    expect(anchor.rotation.x).toBe(0);
    expect(anchor.rotation.y).toBeCloseTo(0.30);
    expect(anchor.rotation.z).toBeCloseTo(-0.20);
    expect(anchorTop.x).toBeGreaterThan(anchorBottom.x);
    expect(anchorWallGap).toBeGreaterThan(0.03);
    expect(anchorWallGap).toBeLessThan(0.06);
    expect(swimRing.position.x).toBeLessThan(-1);
    expect(swimRing.position.z).toBeCloseTo(-1.00);
    expect(Math.abs(swimRing.rotation.z)).toBeGreaterThan(0.7);
    expect(storageBounds(item('anchor')).min.y).toBeCloseTo(LIFEBOAT_FLOOR_SURFACE_Y);
    expect(storageBounds(item('swimRing')).min.y).toBeCloseTo(LIFEBOAT_FLOOR_SURFACE_Y);
  });

  it('places bottled paper on the right shelf opposite the flare gun', () => {
    const bottledPaper = boatStorageTransform(item('bottledPaper'));
    const flareGun = boatStorageTransform(item('flareGun'));

    expect(boatStorageSurface(item('bottledPaper'))).toBe('edgeShelf');
    expect(bottledPaper.position.x).toBeCloseTo(1.38);
    expect(bottledPaper.position.z).toBeCloseTo(-0.34);
    expect(bottledPaper.rotation.y).toBeCloseTo(Math.PI);
    expect(storageBounds(item('bottledPaper')).min.y)
      .toBeCloseTo(LIFEBOAT_STARBOARD_EDGE_SHELF_SURFACE_Y);
    expect(storageBounds(item('bottledPaper')).intersectsBox(storageBounds(item('flareGun'))))
      .toBe(false);
    expect(bottledPaper.position.x).toBeCloseTo(-flareGun.position.x);
  });

  it('stands the scuba gear clear of the right hull wall', () => {
    const scuba = boatStorageTransform(item('scubaSet'));
    const bounds = storageBounds(item('scubaSet'));
    const hullEdge = lifeboatHullHalfWidthAt(scuba.position.z)!;

    expect(scuba.position.z).toBeCloseTo(-1.15);
    expect(scuba.rotation.x).toBe(0);
    expect(scuba.rotation.z).toBe(0);
    expect(bounds.max.x).toBeLessThanOrEqual(hullEdge - 0.20);
    expect(hullEdge - bounds.max.x).toBeLessThan(0.26);
    expect(bounds.min.y).toBeCloseTo(LIFEBOAT_FLOOR_SURFACE_Y);
  });

  it('points the flashlight and leans the umbrella toward the player', () => {
    const flashlight = boatStorageTransform(item('flashlight'));
    const umbrella = boatStorageTransform(item('umbrella'));

    expect(flashlight.rotation.y).toBeCloseTo(-Math.PI / 2);
    expect(umbrella.rotation.x).toBe(0);
    expect(umbrella.rotation.y).toBeCloseTo(-Math.PI / 2);
    expect(umbrella.rotation.z).toBeCloseTo(-Math.PI / 4);
    expect(umbrella.position.x).toBeCloseTo(0.55);
    expect(umbrella.position.z).toBeCloseTo(-0.90);
    expect(storageBounds(item('umbrella')).min.y).toBeCloseTo(LIFEBOAT_FLOOR_SURFACE_Y);
  });

  it('places the medical kit below the left bench and umbrella clear of the hull', () => {
    const medicalKit = boatStorageTransform(item('medicalKit'));
    const umbrella = boatStorageTransform(item('umbrella'));
    const umbrellaBounds = storageBounds(item('umbrella'));

    expect(medicalKit.position.x).toBeLessThan(0);
    expect(medicalKit.position.z).toBeLessThan(-0.9);
    expect(umbrella.position.x).toBeGreaterThan(0);
    expect(umbrella.position.z).toBeLessThan(-0.8);
    expect(umbrellaBounds.min.z).toBeGreaterThan(-1.30);
    expect(storageBounds(item('medicalKit')).intersectsBox(umbrellaBounds)).toBe(false);
  });

  it('groups the bucket with the umbrella and scuba gear, with the net below the left bench', () => {
    const fishingNet = boatStorageTransform(item('fishingNet'));
    const fishingNetMatrix = new Matrix4().makeRotationFromEuler(fishingNet.rotation);
    const fishingNetHandle = new Vector3(0, 0.09468515, 0.81206911)
      .applyMatrix4(fishingNetMatrix)
      .multiplyScalar(fishingNet.scale)
      .add(fishingNet.position);
    const fishingNetBasket = new Vector3(0, -0.14109812, -0.56816162)
      .applyMatrix4(fishingNetMatrix)
      .multiplyScalar(fishingNet.scale)
      .add(fishingNet.position);
    const bucket = boatStorageTransform(item('bucket'));
    const umbrella = boatStorageTransform(item('umbrella'));
    const scuba = boatStorageTransform(item('scubaSet'));

    expect(ITEM_MODEL_SPECS.fishingNet.targetLongestDimension).toBeCloseTo(1.64);
    expect(fishingNet.position.x).toBeCloseTo(-0.96);
    expect(fishingNet.position.z).toBeCloseTo(-1.15);
    expect(fishingNet.rotation.x).toBeCloseTo(11 * Math.PI / 180);
    expect(fishingNetHandle.y).toBeCloseTo(LIFEBOAT_FLOOR_SURFACE_Y);
    expect(fishingNetBasket.y).toBeGreaterThan(fishingNetHandle.y);
    expect(fishingNetBasket.y - LIFEBOAT_FLOOR_SURFACE_Y).toBeLessThan(0.005);
    expect(bucket.position.x).toBeGreaterThan(umbrella.position.x);
    expect(bucket.position.x).toBeLessThan(scuba.position.x);
    expect(bucket.position.x).toBeCloseTo(1.03);
    expect(bucket.position.z).toBeCloseTo(-1.00);
    expect(bucket.position.z).toBeLessThan(umbrella.position.z);
    expect(storageBounds(item('bucket')).intersectsBox(storageBounds(item('umbrella'))))
      .toBe(false);
    expect(storageBounds(item('bucket')).intersectsBox(storageBounds(item('scubaSet'))))
      .toBe(false);
    expect(storageBounds(item('fishingNet')).intersectsBox(storageBounds(item('medicalKit'))))
      .toBe(false);
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

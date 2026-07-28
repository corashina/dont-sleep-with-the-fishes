import {
  Box2,
  Box3,
  Matrix4,
  Quaternion,
  Vector2,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import {
  ITEM_DEFINITIONS,
  ITEM_IDS,
  createItemInstances,
  type ItemId,
  type ItemInstance,
  type ItemInstanceId,
} from '../src/game/ItemState';
import {
  boatStorageSurface,
  boatStorageTransform,
  boatSupplyTransform,
} from '../src/world/BoatStorage';
import {
  LIFEBOAT_DISPLAY_SHELF_SURFACE_Y,
  LIFEBOAT_FLOOR_SURFACE_Y,
  lifeboatHullHalfWidthAt,
} from '../src/world/Lifeboat';
import {
  boatStorageEnvelopesOverlap,
} from './helpers/boatStorage';
import { PRODUCTION_NORMALIZED_PROP_BOUNDS } from './helpers/productionPropModels';

const SHELF_IDS = new Set<ItemId>([
  'baitTin',
  'cannedFood',
  'energyBar',
  'map',
  'compass',
  'ductTape',
  'flashlight',
  'flareGun',
  'spyglass',
  'bottledPaper',
  'medicalKit',
]);

const FLOOR_IDS = new Set<ItemId>([
  'bucket',
  'fishingNet',
  'scubaSet',
  'anchor',
  'umbrella',
  'swimRing',
  'harpoonGun',
]);

function productionBounds(instance: ItemInstance): Box3 {
  const fixture = PRODUCTION_NORMALIZED_PROP_BOUNDS[instance.type];
  const bounds = new Box3(
    new Vector3(...fixture.min),
    new Vector3(...fixture.max),
  );
  const transform = boatStorageTransform(instance);
  bounds.applyMatrix4(new Matrix4().compose(
    transform.position,
    new Quaternion().setFromEuler(transform.rotation),
    new Vector3(transform.scale, transform.scale, transform.scale),
  ));
  return bounds;
}

function productionEnvelope(instance: ItemInstance, clearance = 0.005): Box2 {
  const bounds = productionBounds(instance);
  return new Box2(
    new Vector2(bounds.min.x - clearance, bounds.min.z - clearance),
    new Vector2(bounds.max.x + clearance, bounds.max.z + clearance),
  );
}

describe('boat item layout', () => {
  it('classifies every item on the approved support surface', () => {
    for (const instance of createItemInstances()) {
      expect(boatStorageSurface(instance)).toBe(
        SHELF_IDS.has(instance.type) ? 'shelf' : 'floor',
      );
    }
    expect(new Set([...SHELF_IDS, ...FLOOR_IDS])).toEqual(new Set(ITEM_IDS));
  });

  it('uses canonical instance transforms for survival copies', () => {
    for (const type of ITEM_IDS) {
      for (let index = 0; index < ITEM_DEFINITIONS[type].spawnCount; index += 1) {
        const instance = {
          instanceId: `${type}-${index + 1}` as ItemInstanceId,
          type,
        };
        const storage = boatStorageTransform(instance);
        const survival = boatSupplyTransform(type, index);

        expect(survival.position.toArray()).toEqual(storage.position.toArray());
        expect(survival.rotation.toArray()).toEqual(storage.rotation.toArray());
        expect(survival.scale).toBe(storage.scale);
      }
    }
  });

  it('keeps bait closest to the fishing rod', () => {
    const rod = new Vector3(0, 0.56, -2.28);
    const bait = boatStorageTransform({
      instanceId: 'baitTin-1',
      type: 'baitTin',
    });
    const baitDistance = bait.position.distanceTo(rod);

    for (const instance of createItemInstances()) {
      if (instance.type === 'baitTin') continue;
      expect(
        boatStorageTransform(instance).position.distanceTo(rod),
        instance.instanceId,
      ).toBeGreaterThan(baitDistance);
    }
  });

  it('keeps production props separated on each support surface', () => {
    const placed = createItemInstances().map((instance) => {
      return {
        instance,
        surface: boatStorageSurface(instance),
        envelope: productionEnvelope(instance),
      };
    });

    const overlaps: string[] = [];
    for (let first = 0; first < placed.length; first += 1) {
      for (let second = first + 1; second < placed.length; second += 1) {
        if (placed[first]!.surface !== placed[second]!.surface) continue;
        if (boatStorageEnvelopesOverlap(
          placed[first]!.envelope,
          placed[second]!.envelope,
        )) {
          overlaps.push(
            `${placed[first]!.instance.instanceId}/${placed[second]!.instance.instanceId}`,
          );
        }
      }
    }
    expect(overlaps).toEqual([]);
  });

  it('rests every production prop on its support inside the hull', () => {
    for (const instance of createItemInstances()) {
      const surface = boatStorageSurface(instance);
      const supportY = surface === 'shelf'
        ? LIFEBOAT_DISPLAY_SHELF_SURFACE_Y
        : LIFEBOAT_FLOOR_SURFACE_Y;
      const bounds = productionBounds(instance);
      expect(bounds.min.y, instance.instanceId).toBeCloseTo(supportY, 5);

      const minimumHalfWidth = Math.min(
        lifeboatHullHalfWidthAt(bounds.min.z) ?? 0,
        lifeboatHullHalfWidthAt(bounds.max.z) ?? 0,
      );
      expect(bounds.min.x, instance.instanceId)
        .toBeGreaterThan(-minimumHalfWidth + 0.03);
      expect(bounds.max.x, instance.instanceId)
        .toBeLessThan(minimumHalfWidth - 0.03);
    }
  });

  it('rejects malformed or out-of-range instance IDs', () => {
    const invalidInstances: readonly ItemInstance[] = [
      { instanceId: 'ductTape-3', type: 'ductTape' },
      { instanceId: 'cannedFood-1e0', type: 'cannedFood' },
      { instanceId: 'cannedFood-01', type: 'cannedFood' },
      { instanceId: 'cannedFood-1.0', type: 'cannedFood' },
      { instanceId: 'ductTape-1', type: 'cannedFood' },
    ];
    for (const instance of invalidInstances) {
      expect(
        () => boatStorageTransform(instance),
        instance.instanceId,
      ).toThrow(`No boat storage slot for ${instance.instanceId}`);
    }
  });
});

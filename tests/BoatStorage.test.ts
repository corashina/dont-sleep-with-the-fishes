import { describe, expect, it } from 'vitest';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import {
  BOAT_SUPPLY_GROUP_IDS,
  boatSupplyTransform,
  type BoatSupplyGroupId,
} from '../src/world/BoatStorage';
import { LIFEBOAT_FLOOR_SURFACE_Y } from '../src/world/Lifeboat';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';

describe('boat storage', () => {
  it('has no repair material supply group', () => {
    expect(BOAT_SUPPLY_GROUP_IDS).not.toContain('repairMaterial');
  });

  it('fits six food models together on the floor without intersections', () => {
    const storageBounds = (id: BoatSupplyGroupId, index: number) => {
      const transform = boatSupplyTransform(id, index);
      const model = ITEM_MODEL_SPECS[id].normalizedBounds;
      return new Box3(new Vector3(...model.min), new Vector3(...model.max))
        .applyMatrix4(new Matrix4().compose(
          transform.position,
          new Quaternion().setFromEuler(transform.rotation),
          new Vector3().setScalar(transform.scale),
        ));
    };
    const bounds = Array.from({ length: 6 }, (_, index) => storageBounds('cannedFood', index));
    const neighbors = BOAT_SUPPLY_GROUP_IDS.filter((id) => id !== 'cannedFood');
    const cluster = new Box3();
    for (let index = 0; index < bounds.length; index += 1) {
      const bound = bounds[index]!;
      expect(bound.min.y).toBeCloseTo(LIFEBOAT_FLOOR_SURFACE_Y, 6);
      for (const other of bounds.slice(index + 1)) {
        expect(bound.intersectsBox(other)).toBe(false);
      }
      for (const id of neighbors) {
        expect(bound.intersectsBox(storageBounds(id, 0)), `food ${index + 1} overlaps ${id}`)
          .toBe(false);
      }
      cluster.union(bound);
    }
    const size = cluster.getSize(new Vector3());
    expect(size.x).toBeLessThan(0.65);
    expect(size.z).toBeLessThan(0.4);
  });
});

import { describe, expect, it } from 'vitest';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import {
  BOAT_SUPPLY_GROUP_IDS,
  boatSupplyTransform,
  type BoatSupplyGroupId,
} from '../src/world/BoatStorage';
import { LIFEBOAT_DISPLAY_SHELF_SURFACE_Y, LIFEBOAT_FLOOR_SURFACE_Y } from '../src/world/Lifeboat';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';

describe('boat storage', () => {
  it('has no repair material supply group', () => {
    expect(BOAT_SUPPLY_GROUP_IDS).not.toContain('repairMaterial');
  });

  it.each(['cannedFood', 'baitTin'] as const)('fits eight %s models without intersections', (groupId) => {
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
    const bounds = Array.from({ length: 8 }, (_, index) => storageBounds(groupId, index));
    const neighbors = BOAT_SUPPLY_GROUP_IDS.filter((id) => id !== groupId);
    const surfaceY = {
      cannedFood: LIFEBOAT_FLOOR_SURFACE_Y,
      baitTin: LIFEBOAT_DISPLAY_SHELF_SURFACE_Y,
    }[groupId];
    const modelBounds = ITEM_MODEL_SPECS[groupId].normalizedBounds;
    const stackHeight = (modelBounds.max[1] - modelBounds.min[1]) * 0.5 + 0.01;
    const cluster = new Box3();
    for (let index = 0; index < bounds.length; index += 1) {
      const bound = bounds[index]!;
      const stacked = groupId === 'cannedFood' && index === 2;
      expect(bound.min.y).toBeCloseTo(surfaceY + (stacked ? stackHeight : 0), 6);
      for (const other of bounds.slice(index + 1)) {
        expect(bound.intersectsBox(other)).toBe(false);
      }
      for (const id of neighbors) {
        const neighborCount = id === 'cannedFood' || id === 'baitTin' ? 8 : 1;
        for (let slot = 0; slot < neighborCount; slot += 1) {
          expect(bound.intersectsBox(storageBounds(id, slot)), `${groupId} ${index + 1} overlaps ${id}`)
            .toBe(false);
        }
      }
      cluster.union(bound);
    }
    const size = cluster.getSize(new Vector3());
    expect(size.x).toBeLessThan(groupId === 'baitTin' ? 0.67 : 0.65);
    expect(size.z).toBeLessThan(groupId === 'baitTin' ? 0.53 : 0.73);
    if (groupId === 'baitTin') {
      const tape = storageBounds('ductTape', 0);
      expect(cluster.min.x - tape.max.x).toBeGreaterThan(0.08);
      const addedBounds = bounds.slice(3).reduce((area, bound) => area.union(bound), new Box3());
      expect(addedBounds.min.z).toBeGreaterThan(-1.82);
      expect(addedBounds.max.z).toBeLessThan(-1.34);
    }
  });
});

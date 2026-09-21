import { describe,expect,it } from 'vitest';
import {
  Box2,
  Box3,
  BoxGeometry,
  Group,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Quaternion,
  Vector2,
  Vector3,
} from 'three';
import {
  BOAT_SUPPLY_GROUP_IDS,
  boatSupplyTransform,
  type BoatSupplyGroupId,
} from '../src/world/BoatStorage';
import { LIFEBOAT_DISPLAY_SHELF_SURFACE_Y,LIFEBOAT_FLOOR_SURFACE_Y } from '../src/world/Lifeboat';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import { LIFEBOAT_EQUIPMENT_MODEL_SPECS } from '../src/world/lifeboatEquipmentManifest';
import { createSleepPillow } from '../src/survival/SleepPillow';

function boundsModel(bounds: Readonly<Box3>): Group {
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const model = new Group();
  const mesh = new Mesh(new BoxGeometry(size.x, size.y, size.z));
  mesh.position.copy(center);
  model.add(mesh);
  return model;
}

function projectedBounds(bounds: Readonly<Box3>, camera: PerspectiveCamera): Box2 {
  const projected = new Box2();
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new Vector3(x, y, z).project(camera);
        projected.expandByPoint(new Vector2(point.x, point.y));
      }
    }
  }
  return projected;
}

describe('boat storage', () => {
  it('keeps the anchor clear of the sleep pillow on screen', () => {
    const camera = new PerspectiveCamera(80, 16 / 9, 0.08, 220);
    camera.position.set(0, 0.88, 0.96);
    camera.lookAt(0, 0.88, -1.55);
    camera.updateMatrixWorld(true);

    const anchorSpec = ITEM_MODEL_SPECS.anchor;
    const anchor = boundsModel(new Box3(
      new Vector3(...anchorSpec.normalizedBounds.min),
      new Vector3(...anchorSpec.normalizedBounds.max),
    ));
    const anchorTransform = boatSupplyTransform('anchor', 0);
    anchor.position.copy(anchorTransform.position);
    anchor.rotation.copy(anchorTransform.rotation);
    anchor.scale.setScalar(anchorTransform.scale);
    anchor.updateMatrixWorld(true);

    const pillowSpec = LIFEBOAT_EQUIPMENT_MODEL_SPECS.pillow;
    const pillow = createSleepPillow(boundsModel(new Box3(
      new Vector3(...pillowSpec.normalizedBounds.min),
      new Vector3(...pillowSpec.normalizedBounds.max),
    )));
    pillow.root.updateMatrixWorld(true);

    const anchorScreenBounds = projectedBounds(new Box3().setFromObject(anchor), camera);
    const pillowScreenBounds = projectedBounds(new Box3().setFromObject(pillow.root), camera);
    expect(pillowScreenBounds.containsPoint(anchorScreenBounds.getCenter(new Vector2()))).toBe(false);
    pillow.dispose();
  });

  it('places tape and the energy bar beside the map without overlap', () => {
    const bounds = (['ductTape', 'map', 'energyBar'] as const).map((id) => {
      const transform = boatSupplyTransform(id, 0);
      const model = ITEM_MODEL_SPECS[id].normalizedBounds;
      return new Box3(new Vector3(...model.min), new Vector3(...model.max))
        .applyMatrix4(new Matrix4().compose(transform.position,
          new Quaternion().setFromEuler(transform.rotation), new Vector3().setScalar(transform.scale)));
    });
    const [tape, map, bar] = bounds as [Box3, Box3, Box3];
    expect(tape.max.x).toBeLessThan(map.min.x);
    expect(bar.min.x).toBeGreaterThan(map.max.x);
    for (const bound of bounds) expect(bound.min.y).toBeCloseTo(LIFEBOAT_DISPLAY_SHELF_SURFACE_Y);
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
    // The net's empty bounding box overlaps supplies. Check its mesh in NetRestClearance.
    const neighbors = BOAT_SUPPLY_GROUP_IDS.filter((id) => id !== groupId && id !== 'fishingNet');
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
      const addedBounds = bounds.slice(3).reduce((area, bound) => area.union(bound), new Box3());
      expect(addedBounds.min.z).toBeGreaterThan(-1.82);
      expect(addedBounds.max.z).toBeLessThan(-1.34);
    }
  });
});

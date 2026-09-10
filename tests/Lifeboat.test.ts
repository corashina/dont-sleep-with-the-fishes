import { describe,expect,it } from 'vitest';
import { Box3,Matrix4,Mesh,Quaternion,Raycaster,Texture,Vector3 } from 'three';
import { createLifeboat, LIFEBOAT_DISPLAY_SHELF_SURFACE_Y, LIFEBOAT_PLAYER_BENCH_Z } from '../src/world/Lifeboat';
import { createWaterExclusion } from '../src/ocean/WaterExclusion';
import { LifeboatAssets } from '../src/world/LifeboatAssets';
import { BOAT_SUPPLY_GROUP_IDS,boatSupplyTransform } from '../src/world/BoatStorage';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';

function buildBoat() {
  const boat = createLifeboat(LifeboatAssets.fromTextures(new Texture(), new Texture(), new Texture()));
  boat.root.updateMatrixWorld(true);
  return boat;
}

describe('lifeboat visual geometry', () => {
  it('shortens the empty middle while keeping the water mask inside both ends', () => {
    const boat = buildBoat();
    const floor = new Box3().setFromObject(boat.root.getObjectByName('survival-floor')!);
    expect(floor.min.z).toBeCloseTo(-3);
    expect(floor.max.z).toBeCloseTo(2.4);
    expect(floor.max.z - floor.min.z).toBeCloseTo(5.4);
    expect(boat.root.getObjectByName('survival-bench-0')!.position.z).toBe(LIFEBOAT_PLAYER_BENCH_Z);
    expect(boat.root.getObjectByName('lifeboat-display-bench')!.position.z).toBe(-1.58);
    const water = boat.waterExclusion;
    const region = createWaterExclusion(boat.root, water.halfWidth, water.halfLength,
      water.taperStart, water.minimumLocalY, undefined, water.longitudinalProfile);
    expect(region.bounds.z).toBeCloseTo(floor.min.z - 0.04);
    expect(region.bounds.w).toBeCloseTo(floor.max.z + 0.04);
    expect(boat.acceptanceBox.max.z).toBeLessThan(floor.max.z);
    expect(boat.interiorBounds.max.z).toBeLessThan(floor.max.z);
  });

  it.each([
    ['knife', 'lifeboat-display-bench-seat'],
    ['spyglass', 'lifeboat-display-bench-seat'],
    ['ductTape', 'survival-bench-seat-0'],
    ['map', 'survival-bench-seat-0'],
    ['energyBar', 'survival-bench-seat-0'],
  ] as const)('supports %s on its assigned bench', (id, seatName) => {
    const boat = buildBoat();
    const transform = boatSupplyTransform(id, 0);
    const ray = new Raycaster(new Vector3(transform.position.x, 1, transform.position.z), new Vector3(0, -1, 0));
    const contacts = ray.intersectObject(boat.root.getObjectByName(seatName)!);
    expect(contacts.length).toBeGreaterThan(0);
    expect(contacts[0]!.point.y).toBeCloseTo(LIFEBOAT_DISPLAY_SHELF_SURFACE_Y);
  });

  it('keeps the front bench supports clear of the stored items', () => {
    const boat = buildBoat();
    const bench = boat.root.getObjectByName('lifeboat-display-bench')!;
    const supports = bench.children.filter((object) => (
      object instanceof Mesh && object.position.y < 0
    ));
    expect(supports).toHaveLength(2);
    for (const id of BOAT_SUPPLY_GROUP_IDS) {
      // The tilted net's box includes empty space. NetFishingPlacement checks its triangles against these supports.
      if (id === 'fishingNet') continue;
      const transform = boatSupplyTransform(id, 0);
      const bounds = ITEM_MODEL_SPECS[id].normalizedBounds;
      const itemBounds = new Box3(new Vector3(...bounds.min), new Vector3(...bounds.max))
        .applyMatrix4(new Matrix4().compose(
          transform.position,
          new Quaternion().setFromEuler(transform.rotation),
          new Vector3().setScalar(transform.scale),
        ));
      for (const support of supports) {
        expect(new Box3().setFromObject(support).intersectsBox(itemBounds), `${id} intersects a front bench support`)
          .toBe(false);
      }
    }
  });

  it('closes the hull at the plank seams and both ends', () => {
    const boat = buildBoat();
    const hull = boat.root.getObjectByName('lifeboat-hull-planks')!;
    const ray = new Raycaster();
    const direction = new Vector3();
    for (const y of [-0.36, -0.243, -0.09, 0.063, 0.216, 0.3]) {
      ray.ray.origin.set(0, y, 0);
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 32) {
        direction.set(Math.sin(angle), 0, Math.cos(angle));
        ray.ray.direction.copy(direction);
        expect(ray.intersectObject(hull, true).length).toBeGreaterThan(0);
      }
    }
  });

  it('has finite geometry and normals for rendering', () => {
    const boat = buildBoat();
    boat.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      for (const name of ['position', 'normal', 'uv']) {
        const attribute = object.geometry.getAttribute(name);
        expect(attribute).toBeDefined();
        expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
      }
      const colors = object.geometry.getAttribute('color');
      if (colors) {
        expect(colors.count).toBe(object.geometry.getAttribute('position').count);
        expect(Array.from(colors.array).every(Number.isFinite)).toBe(true);
      }
    });
  });
});

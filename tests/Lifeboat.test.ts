import { describe, expect, it } from 'vitest';
import { Box3, Mesh, Raycaster, Texture, Vector3 } from 'three';
import { createLifeboat } from '../src/world/Lifeboat';
import { LifeboatAssets } from '../src/world/LifeboatAssets';

function buildBoat() {
  const boat = createLifeboat(LifeboatAssets.fromTextures(new Texture(), new Texture(), new Texture()));
  boat.root.updateMatrixWorld(true);
  return boat;
}

describe('lifeboat visual geometry', () => {
  it('preserves item support heights and gameplay bounds', () => {
    const boat = buildBoat();
    const top = (name: string) => new Box3().setFromObject(boat.root.getObjectByName(name)!).max.y;
    expect(top('lifeboat-floorboard-6')).toBeCloseTo(-0.3145, 6);
    expect(top('lifeboat-display-bench-seat')).toBeCloseTo(0.22, 6);
    expect(top('survival-bench-seat-0')).toBeCloseTo(0.22, 6);
    expect(top('survival-bench-seat-1')).toBeCloseTo(0.22, 6);
    expect(top('lifeboat-outer-gunwale')).toBeCloseTo(0.472, 6);
    expect(top('lifeboat-edge-wear-1-1')).toBeCloseTo(0.3275, 6);
    expect(boat.acceptanceBox.min.toArray()).toEqual([-1.35, -0.30, -2.72]);
    expect(boat.acceptanceBox.max.toArray()).toEqual([1.35, 1, 2.72]);
    expect(boat.interiorBounds.min.toArray()).toEqual([-1.45, -0.50, -2.96]);
    expect(boat.interiorBounds.max.toArray()).toEqual([1.45, 1, 2.96]);
    expect(boat.waterExclusion).toEqual({ halfWidth: 1.60, halfLength: 3.04, taperStart: 1.05, minimumLocalY: -0.38 });
    expect(boat.root.getObjectByName('lifeboat-display-bench')!.position.z).toBe(-1.58);
    expect(boat.root.getObjectByName('survival-bench-1')!.position.z).toBe(1.48);
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

  it('stays within the previous visual pass geometry budget', () => {
    const boat = buildBoat();
    let meshes = 0;
    let triangles = 0;
    boat.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      meshes += 1;
      triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
    });
    expect(meshes).toBeLessThanOrEqual(117);
    expect(triangles).toBeLessThanOrEqual(30180);
  });
});

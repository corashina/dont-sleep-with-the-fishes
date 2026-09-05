import { Box3, Mesh, Raycaster, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { SunkenDorothyWreck } from '../src/menu/SunkenDorothyWreck';

function localWreck(): SunkenDorothyWreck {
  const wreck = new SunkenDorothyWreck();
  wreck.root.position.set(0, 0, 0);
  wreck.root.rotation.set(0, 0, 0);
  wreck.root.scale.setScalar(1);
  wreck.root.updateMatrixWorld(true);
  return wreck;
}

describe('SunkenDorothyWreck', () => {
  it('has an open hull breach with intact plating on the stern', () => {
    const wreck = localWreck();
    const hull = wreck.root.getObjectByName('menu:dorothy-wreck-hull-plating')!;
    const ray = new Raycaster(new Vector3(6, 0.1, -1), new Vector3(-1, 0, 0));
    const breach = ray.intersectObject(hull);
    expect(breach.length).toBeGreaterThan(0);
    expect(breach[0]!.point.x).toBeLessThan(0);
    ray.ray.origin.set(6, 0.1, 4);
    const intact = ray.intersectObject(hull);
    expect(intact[0]!.point.x).toBeGreaterThan(2);
    wreck.dispose();
  });

  it('leaves open cabin windows and recesses the funnel interior below its rim', () => {
    const wreck = localWreck();
    const paint = wreck.root.getObjectByName('menu:dorothy-wreck-cabin-paint')!;
    const ray = new Raycaster(new Vector3(6, 1.8, 4.1), new Vector3(-1, 0, 0));
    expect(ray.intersectObject(paint)).toHaveLength(0);
    const axis = new Vector3(0, 0, 1);
    ray.ray.origin.set(0, 2.6, 0).applyAxisAngle(axis, 0.08).add(new Vector3(0, 0.92, 0.95));
    ray.ray.direction.set(0, -1, 0).applyAxisAngle(axis, 0.08);
    const interior = wreck.root.getObjectByName('menu:dorothy-wreck-interior')!;
    const hit = ray.intersectObject(interior)[0]!;
    expect(hit).toBeDefined();
    expect(hit.distance).toBeGreaterThan(1.4);
    expect(hit.distance).toBeLessThan(1.7);
    wreck.dispose();
  });

  it('keeps finite geometry within the scene footprint and a static rendering budget', () => {
    const wreck = localWreck();
    const bounds = new Box3().setFromObject(wreck.root);
    expect(bounds.min.z).toBeGreaterThanOrEqual(-9.1);
    expect(bounds.max.z).toBeLessThanOrEqual(9.1);
    expect(bounds.min.x).toBeGreaterThan(-3.1);
    expect(bounds.max.x).toBeLessThan(3.1);
    expect(bounds.max.y).toBeLessThan(5);
    expect(wreck.root.children.length).toBeLessThanOrEqual(10);
    let triangles = 0;
    for (const child of wreck.root.children) {
      expect(child).toBeInstanceOf(Mesh);
      const mesh = child as Mesh;
      triangles += mesh.geometry.index!.count / 3;
      for (const attribute of Object.values(mesh.geometry.attributes)) {
        expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
      }
    }
    expect(triangles).toBeLessThan(40000);
    wreck.dispose();
  });

  it('releases each owned GPU resource once when disposed repeatedly', () => {
    const wreck = new SunkenDorothyWreck();
    const spies = wreck.root.children.flatMap((child) => {
      const mesh = child as Mesh;
      const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
      return [vi.spyOn(mesh.geometry, 'dispose'), vi.spyOn(material, 'dispose')];
    });
    wreck.dispose();
    wreck.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(wreck.root.parent).toBeNull();
  });
});

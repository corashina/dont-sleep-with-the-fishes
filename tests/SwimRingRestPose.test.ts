import { readFile } from 'node:fs/promises';
import { Box3, Group, Mesh, Raycaster, Texture, Triangle, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import { boatSupplyTransform } from '../src/world/BoatStorage';
import { createLifeboat, LIFEBOAT_FLOOR_SURFACE_Y } from '../src/world/Lifeboat';
import { LifeboatAssets } from '../src/world/LifeboatAssets';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import { normalizeLongestDimensionTemplate } from '../src/world/modelValidation';

it('supports the ring on a floorboard and bench rail without intersecting the wood', async () => {
  const bytes = await readFile('src/assets/models/items/swimRing.glb');
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  const { scene: model } = await new GLTFLoader().parseAsync(data, '');
  normalizeLongestDimensionTemplate(model, ITEM_MODEL_SPECS.swimRing, (message) => new Error(message));
  const assets = LifeboatAssets.fromTextures(new Texture(), new Texture(), new Texture());
  const { root: boat } = createLifeboat(assets);
  const ring = new Group();
  const pose = boatSupplyTransform('swimRing', 0);
  ring.position.copy(pose.position);
  ring.rotation.copy(pose.rotation);
  ring.scale.setScalar(pose.scale);
  ring.add(model);
  boat.add(ring);
  boat.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(ring, true);
  const bench = boat.getObjectByName('lifeboat-display-bench')!;
  const rail = bench.children.find((object) => object instanceof Mesh && object.position.z === 0.18)!;
  const railBounds = new Box3().setFromObject(rail);
  const obstacles: Box3[] = [];
  for (const root of [bench, boat.getObjectByName('survival-ribs')!]) {
    root.traverse((object) => {
      if (object instanceof Mesh) obstacles.push(new Box3().setFromObject(object).expandByScalar(-0.001));
    });
  }
  const floorPoint = new Vector3(0, Infinity, 0);
  const triangle = new Triangle();
  const vertices = [triangle.a, triangle.b, triangle.c];
  let supportGap = Infinity;
  let intersections = 0;
  const upperEdge: Vector3[] = [];
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    const indices = object.geometry.index;
    for (let index = 0; index < (indices?.count ?? positions.count); index += 3) {
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = vertices[corner]!;
        vertex.fromBufferAttribute(positions, indices?.getX(index + corner) ?? index + corner)
          .applyMatrix4(object.matrixWorld);
        if (vertex.y < floorPoint.y) floorPoint.copy(vertex);
        if (vertex.y > bounds.max.y - 0.03) upperEdge.push(vertex.clone());
        supportGap = Math.min(supportGap, railBounds.distanceToPoint(vertex));
      }
      intersections += obstacles.filter((obstacle) => obstacle.intersectsTriangle(triangle)).length;
    }
  });
  try {
    expect(bounds.min.y).toBeCloseTo(LIFEBOAT_FLOOR_SURFACE_Y, 5);
    expect(bounds.max.y).toBeLessThan(0.1);
    expect(supportGap).toBeLessThan(0.003);
    expect(intersections).toBe(0);
    const ray = new Raycaster(floorPoint.clone().add(new Vector3(0, 0.02, 0)), new Vector3(0, -1, 0));
    const contact = ray.intersectObject(boat.getObjectByName('lifeboat-floorboards')!, true)[0];
    expect(contact).toBeDefined();
    expect(contact!.distance).toBeCloseTo(0.02, 4);
    // The ring's center lies between the floor contact and the rail supporting its upper edge.
    expect(ring.position.z).toBeLessThan(floorPoint.z);
    expect(ring.position.z).toBeGreaterThan(railBounds.max.z);
    const eye = new Vector3(0, 0.88, 0.96);
    for (const point of upperEdge) {
      ray.ray.origin.copy(eye);
      ray.ray.direction.subVectors(point, eye).normalize();
      ray.far = eye.distanceTo(point) - 0.001;
      expect(ray.intersectObject(bench, true)).toHaveLength(0);
    }
  } finally {
    boat.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
    assets.dispose();
  }
});

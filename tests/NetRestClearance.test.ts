import { readFile } from 'node:fs/promises';
import { Box3, DoubleSide, Group, Matrix4, Mesh, Quaternion, Raycaster, Texture, Triangle, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import { createLifeboat } from '../src/world/Lifeboat';
import { LifeboatAssets } from '../src/world/LifeboatAssets';
import { boatSupplyTransform } from '../src/world/BoatStorage';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import { normalizeLongestDimensionTemplate } from '../src/world/modelValidation';

it.each([
  [0, 0, 0],
  [0.45, 0.18, -0.24],
  [-0.35, -0.22, 0.20],
])('keeps the resting net outside the gunwale at wave pose %s / %s / %s', async (height, pitch, roll) => {
  const bytes = await readFile('src/assets/models/items/fishingNet.glb');
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  const { scene: model } = await new GLTFLoader().parseAsync(data, '');
  normalizeLongestDimensionTemplate(model, ITEM_MODEL_SPECS.fishingNet, (message) => new Error(message));
  const assets = LifeboatAssets.fromTextures(new Texture(), new Texture(), new Texture());
  const { root: boat } = createLifeboat(assets);
  boat.position.set(0.15, height, -0.1);
  boat.rotation.set(pitch, 0.12, roll);
  const net = new Group();
  const pose = boatSupplyTransform('fishingNet', 0);
  net.position.copy(pose.position);
  net.rotation.copy(pose.rotation);
  net.scale.setScalar(pose.scale);
  net.add(model);
  boat.add(net);
  const rails = ['lifeboat-outer-gunwale', 'lifeboat-faded-rescue-trim'].map((name) => boat.getObjectByName(name) as Mesh);
  for (const rail of rails) {
    rail.geometry.computeBoundingBox();
    const materials = Array.isArray(rail.material) ? rail.material : [rail.material];
    for (const material of materials) material.side = DoubleSide;
  }
  const ray = new Raycaster();
  const vertices = [new Vector3(), new Vector3(), new Vector3()];
  let hits = 0;
  let supplyContact = false;
  const triangle = new Triangle();
  const supplies = (['cannedFood', 'baitTin'] as const).flatMap((id) => (
    Array.from({ length: 8 }, (_, index) => {
      const slot = boatSupplyTransform(id, index);
      const bounds = ITEM_MODEL_SPECS[id].normalizedBounds;
      return new Box3(new Vector3(...bounds.min), new Vector3(...bounds.max)).applyMatrix4(
        new Matrix4().compose(slot.position, new Quaternion().setFromEuler(slot.rotation), new Vector3().setScalar(slot.scale)),
      );
    })
  ));
  try {
    boat.updateWorldMatrix(true, true);
    const inverse = boat.matrixWorld.clone().invert();
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const positions = object.geometry.getAttribute('position');
      const indices = object.geometry.index;
      const vertexIndex = (index: number) => indices === null ? index : indices.getX(index);
      for (let index = 0; index < (indices?.count ?? positions.count); index += 3) {
        for (let corner = 0; corner < 3; corner += 1) {
          vertices[corner]!.fromBufferAttribute(positions, vertexIndex(index + corner)).applyMatrix4(object.matrixWorld);
        }
        triangle.a.copy(vertices[0]!).applyMatrix4(inverse);
        triangle.b.copy(vertices[1]!).applyMatrix4(inverse);
        triangle.c.copy(vertices[2]!).applyMatrix4(inverse);
        supplyContact ||= supplies.some((bounds) => bounds.intersectsTriangle(triangle));
        for (let edge = 0; edge < 3; edge += 1) {
          const start = vertices[edge]!;
          const end = vertices[(edge + 1) % 3]!;
          ray.ray.origin.copy(start);
          ray.ray.direction.subVectors(end, start).normalize();
          ray.near = 0.00001;
          ray.far = start.distanceTo(end) - 0.00001;
          hits += ray.intersectObjects(rails, false).length;
        }
      }
    });
    expect(hits).toBe(0);
    expect(supplyContact).toBe(false);
    const down = new Vector3(0, -1, 0).transformDirection(boat.matrixWorld);
    let supportGap = Infinity;
    let supportZ = Infinity;
    for (let index = 0; index <= 128; index += 1) {
      const z = -0.24 + index / 128 * 1.06;
      ray.ray.origin.set(0, 0.09820857, z).applyMatrix4(net.matrixWorld);
      ray.ray.direction.copy(down);
      ray.near = 0;
      ray.far = 1;
      const hit = ray.intersectObjects(rails, false)[0];
      if (hit === undefined || hit.distance >= supportGap) continue;
      supportGap = hit.distance;
      supportZ = z;
    }
    expect(supportGap).toBeLessThan(0.015);
    expect(supportZ).toBeGreaterThan(-0.25);
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

import { readFile } from 'node:fs/promises';
import { Box3, BufferGeometry, Group, Material, Raycaster, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import { prepareItemCondition, setItemBroken } from '../src/survival/itemConditionAppearance';
import { fitBrokenItemToStorage } from '../src/survival/brokenItemStorage';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import { normalizeLongestDimensionTemplate } from '../src/world/modelValidation';

// Importance: 95. Bucket damage must open both wall layers without moving or splitting the model.
it('punctures the bucket walls and cracks the rim while preserving its shape and repair', async () => {
  const bytes = await readFile('src/assets/models/items/bucket.glb');
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  const loader = new GLTFLoader().register(() => ({ name: 'bucket-test-textures', loadTexture: async () => new Texture() }));
  const { scene } = await loader.parseAsync(data, '');
  normalizeLongestDimensionTemplate(scene, ITEM_MODEL_SPECS.bucket, (message) => new Error(message));
  const root = new Group();
  root.add(scene);
  const usableBounds = new Box3().setFromObject(root, true);
  const center = usableBounds.getCenter(new Vector3());
  const length = ITEM_MODEL_SPECS.bucket.targetLongestDimension;
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const bindings = prepareItemCondition(root, 'bucket', geometries, materials);
  fitBrokenItemToStorage(root, bindings, 'bucket');
  try {
    for (const [x, y, side] of [[0.12, -0.17, 1], [-0.19, -0.14, 1], [-0.07, -0.16, -1], [-0.12, 0.36, 1], [0.20, 0.36, -1]]) {
      const ray = new Raycaster(
        new Vector3(center.x + x! * length, center.y + y! * length, center.z + side! * length),
        new Vector3(0, 0, -side!), 0, length,
      );
      for (const broken of [false, true, false]) {
        setItemBroken(bindings, broken);
        const hits = ray.intersectObject(root, true);
        if (broken) expect(hits, `bucket opening at ${x}, ${y}`).toHaveLength(0);
        else expect(hits.length, `intact bucket at ${x}, ${y}`).toBeGreaterThan(0);
      }
    }
    const handleRay = new Raycaster(
      new Vector3(center.x - 0.19 * length, center.y - 0.02 * length, center.z + length),
      new Vector3(0, 0, -1), 0, length,
    );
    setItemBroken(bindings, false);
    const handleDistance = handleRay.intersectObject(root, true)[0]!.distance;
    setItemBroken(bindings, true);
    expect(handleRay.intersectObject(root, true)[0]!.distance).toBeCloseTo(handleDistance, 6);
    const damagedBounds = new Box3().setFromObject(root, true);
    expect(damagedBounds.min.distanceTo(usableBounds.min)).toBeLessThan(0.000001);
    expect(damagedBounds.max.distanceTo(usableBounds.max)).toBeLessThan(0.000001);
    for (const { brokenGeometry } of bindings) {
      expect(new Set(brokenGeometry.getAttribute('damageFragment').array)).toEqual(new Set([0]));
    }
    // The bottom still supports the bucket; punctures cannot remove its floor.
    expect(new Raycaster(new Vector3(center.x, center.y + length, center.z), new Vector3(0, -1, 0))
      .intersectObject(root, true).length).toBeGreaterThan(0);
    setItemBroken(bindings, false);
    for (const binding of bindings) expect(binding.mesh.geometry).toBe(binding.usableGeometry);
  } finally {
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    bindings.forEach(({ usableGeometry }) => usableGeometry.dispose());
  }
});

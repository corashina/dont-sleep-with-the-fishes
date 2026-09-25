import { readFile } from 'node:fs/promises';
import { Box3, BoxGeometry, BufferGeometry, Group, Material, Matrix4, Mesh, MeshStandardMaterial, Raycaster, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import { normalizeLongestDimensionTemplate } from '../src/world/modelValidation';
import { prepareItemCondition, setItemBroken, type ItemConditionBinding } from '../src/survival/itemConditionAppearance';
import { createBrokenGeometry } from '../src/survival/brokenItemGeometry';

// Importance: 95. The compass must have an open split, retain both halves, and close on repair.
function verifyCompassSplit(root: Group, bindings: readonly ItemConditionBinding[]): void {
  const bounds = new Box3().setFromObject(root);
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  const length = Math.max(size.x, size.y, size.z);
  const hits = (x: number): number => new Raycaster(
    new Vector3(center.x + x * length, center.y, center.z + length * 2),
    new Vector3(0, 0, -1),
  ).intersectObject(root, true).length;
  expect(hits(0.06)).toBeGreaterThan(0);
  setItemBroken(bindings, true);
  expect(hits(0.06)).toBe(0);
  expect(hits(-0.2)).toBeGreaterThan(0);
  expect(hits(0.25)).toBeGreaterThan(0);
  setItemBroken(bindings, false);
  expect(hits(0.06)).toBeGreaterThan(0);
}

// Importance: 95. The white paper backing must never cover the folded printed surface.
function verifyMapSurface(root: Group): void {
  const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0));
  for (let x = -0.40; x < -0.15; x += 0.025) {
    for (let z = 0.10; z < 0.26; z += 0.025) {
      ray.ray.origin.set(x * 0.62, 1, z * 0.62);
      const hit = ray.intersectObject(root, true)[0];
      expect(hit, `map surface at ${x}, ${z}`).toBeDefined();
      const mesh = hit!.object as Mesh<BufferGeometry, MeshStandardMaterial>;
      expect(mesh.material.map, `white backing covers print at ${x}, ${z}`).not.toBeNull();
    }
  }
}

// Importance: 95. Canopy holes must pass through the fabric and disappear on repair.
function verifyCanopyHoles(root: Group, bindings: readonly ItemConditionBinding[]): void {
  const ray = new Raycaster(new Vector3(), new Vector3(1, 0, 0));
  for (const [y, z] of [[0.23, -0.11], [-0.23, -0.17], [0.17, 0.20], [-0.23, 0.15], [0.03, -0.30]]) {
    ray.ray.origin.set(-1, y! * 0.90, z! * 0.90);
    for (const broken of [false, true, false]) {
      setItemBroken(bindings, broken);
      const hits = ray.intersectObject(root, true);
      if (broken) expect(hits, `canopy hole at ${y}, ${z}`).toHaveLength(0);
      else expect(hits.length).toBeGreaterThan(0);
    }
  }
  setItemBroken(bindings, true);
}

// Importance: 95. Scuba damage must open holes without splitting or moving the assembly.
function verifyScubaDamage(root: Group, bindings: readonly ItemConditionBinding[], usableBounds: Box3): void {
  const center = usableBounds.getCenter(new Vector3());
  const length = Math.max(...usableBounds.getSize(new Vector3()).toArray());
  const ray = new Raycaster(new Vector3(), new Vector3(0, 0, -1));
  for (const [x, y] of [[0.033, -0.133], [-0.038, 0.092], [0.004, -0.087]] as const) {
    ray.ray.origin.copy(center).add(new Vector3(x * length, y * length, length * 2));
    setItemBroken(bindings, false);
    const originalHit = ray.intersectObject(root, true)[0]!;
    expect(originalHit).toBeDefined();
    for (const broken of [false, true, false]) {
      setItemBroken(bindings, broken);
      const hit = ray.intersectObject(root, true)[0]!;
      expect(hit, `scuba wall at ${x}, ${y}`).toBeDefined();
      if (broken) expect(hit.distance - originalHit.distance, 'opening exposes the inner wall').toBeGreaterThan(length * 0.08);
      else expect(hit.distance).toBeCloseTo(originalHit.distance, 6);
    }
  }
  setItemBroken(bindings, true);
  const damagedBounds = new Box3().setFromObject(root, true);
  expect(damagedBounds.min.distanceTo(usableBounds.min)).toBeLessThan(0.000001);
  expect(damagedBounds.max.distanceTo(usableBounds.max)).toBeLessThan(0.000001);
  for (const { brokenGeometry } of bindings) {
    expect(new Set(brokenGeometry.getAttribute('damageFragment').array)).toEqual(new Set([0]));
  }
}

// Importance: 95. The damaged net must keep a continuous shaft and open real holes in its weave.
function verifyNetDamage(root: Group, bindings: readonly ItemConditionBinding[]): void {
  const length = ITEM_MODEL_SPECS.fishingNet.targetLongestDimension;
  const ray = new Raycaster(new Vector3(), new Vector3(1, 0, 0));
  setItemBroken(bindings, true);
  for (let z = -0.14; z < 0.48; z += 0.005) {
    ray.ray.origin.set(-length, 0.067 * length, z * length);
    expect(ray.intersectObject(root, true).length, `shaft gap at ${z}`).toBeGreaterThan(0);
  }
  const shaftX = (z: number): number => {
    ray.ray.origin.set(-length, 0.067 * length, z * length);
    return ray.intersectObject(root, true)[0]!.point.x / length;
  };
  expect(shaftX(0)).toBeGreaterThan(0.04);
  expect(shaftX(0.10)).toBeLessThan(-0.04);
  ray.ray.direction.set(0, -1, 0);
  for (const [centerX, centerZ, radius] of [
    [-0.035, -0.34, 0.02], [0.052, -0.435, 0.02],
  ]) {
    let intactHits = 0;
    for (let x = -radius!; x <= radius!; x += 0.005) {
      for (let z = -radius!; z <= radius!; z += 0.005) {
        ray.ray.origin.set((centerX! + x) * length, 0.04 * length, (centerZ! + z) * length);
        setItemBroken(bindings, false);
        intactHits += ray.intersectObject(root, true).length;
        setItemBroken(bindings, true);
        expect(ray.intersectObject(root, true), 'torn net cell').toHaveLength(0);
      }
    }
    expect(intactHits, 'the tear removes existing strands').toBeGreaterThan(0);
  }
}

// Importance: 95. Damage must never alter a usable model or survive repair.
describe('item condition appearance', () => {
  // Importance: 95. The bent umbrella shaft must stay attached across every bend.
  it('bends an umbrella shaft into a continuous zigzag without cutting it', () => {
    const source = new BoxGeometry(0.9, 0.02, 0.02);
    const geometry = createBrokenGeometry(source, new Matrix4(), 'umbrella');
    const material = new MeshStandardMaterial();
    const shaft = new Mesh(geometry, material);
    const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0));
    try {
      expect(geometry.boundingBox!.max.z).toBeGreaterThan(0.07);
      // Every cross-section from canopy attachment to grip must contain shaft surface.
      for (let x = -0.1; x < 0.39; x += 0.003) {
        let hit = false;
        for (let z = -0.02; z < 0.1 && !hit; z += 0.003) {
          ray.ray.origin.set(x, 1, z);
          hit = ray.intersectObject(shaft).length > 0;
        }
        expect(hit, `detached shaft at ${x}`).toBe(true);
      }
      // The center moves sideways at the bend and returns at the grip.
      ray.ray.origin.set(0.1, 1, 0);
      expect(ray.intersectObject(shaft)).toHaveLength(0);
      ray.ray.origin.set(0.35, 1, 0);
      expect(ray.intersectObject(shaft).length).toBeGreaterThan(0);
    } finally {
      source.dispose();
      geometry.dispose();
      material.dispose();
    }
  });

  // Importance: 90. Every real breakable asset must remain renderable after damage.
  it.each(['compass', 'umbrella', 'map', 'scubaSet', 'fishingNet'] as const)(
    'prepares finite, nonempty damage for the production %s model', async (id) => {
      const bytes = await readFile(`src/assets/models/items/${id}.glb`);
      const data = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(data).set(bytes);
      const loader = new GLTFLoader().register(() => ({
        name: 'damage-textures', loadTexture: async () => new Texture(),
      }));
      const { scene } = await loader.parseAsync(data, '');
      normalizeLongestDimensionTemplate(scene, ITEM_MODEL_SPECS[id], (message) => new Error(message));
      const root = new Group();
      root.add(scene);
      const usableBounds = new Box3().setFromObject(root, true);
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<Material>();
      const bindings = prepareItemCondition(root, id, geometries, materials);
      // Importance: 95. No intact mesh may bridge a fracture after the item breaks.
      const meshes: Mesh[] = [];
      root.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
      expect(bindings.map(({ mesh }) => mesh)).toEqual(meshes);
      const changedMaterials = bindings.flatMap(({ usableMaterial }) => (
        Array.isArray(usableMaterial) ? usableMaterial : [usableMaterial]
      )).map((material) => material.name);
      if (id === 'compass') {
        expect(changedMaterials).toEqual(expect.arrayContaining(['mat20', 'mat21', 'mat24']));
        verifyCompassSplit(root, bindings);
      }
      setItemBroken(bindings, true);
      if (id === 'map') verifyMapSurface(root);
      if (id === 'fishingNet') verifyNetDamage(root, bindings);
      if (id === 'scubaSet') verifyScubaDamage(root, bindings, usableBounds);
      // Importance: 90. Damage must retain the umbrella's full canopy.
      if (id === 'umbrella') {
        verifyCanopyHoles(root, bindings);
        const damagedBounds = new Box3().setFromObject(root, true);
        expect(damagedBounds.max.z - damagedBounds.min.z)
          .toBeCloseTo(usableBounds.max.z - usableBounds.min.z, 5);
      }
      const positions = bindings.flatMap(({ mesh }) => [...mesh.geometry.getAttribute('position').array]);
      expect(positions.length).toBeGreaterThan(0);
      expect(positions.every(Number.isFinite)).toBe(true);
      expect(bindings.some(({ usableGeometry, brokenGeometry }) => (
        usableGeometry.getAttribute('position').count !== brokenGeometry.getAttribute('position').count
      ))).toBe(true);
      setItemBroken(bindings, false);
      for (const binding of bindings) {
        expect(binding.mesh.geometry).toBe(binding.usableGeometry);
        binding.usableGeometry.dispose();
      }
      geometries.forEach((resource) => resource.dispose());
      materials.forEach((resource) => resource.dispose());
    },
  );

  it('owns damage geometry, preserves color, and restores the exact usable resources', () => {
    const root = new Group();
    root.position.set(2, 3, -4);
    root.rotation.set(0.4, -0.2, 0.8);
    root.scale.setScalar(0.5);
    const geometry = new BoxGeometry(1, 0.2, 0.6, 4, 2, 4);
    const material = new MeshStandardMaterial({ color: 0xcbb877 });
    const mesh = new Mesh(geometry, material);
    root.add(mesh);
    const sibling = mesh.clone();
    const positions = [...geometry.getAttribute('position').array];
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    const bindings = prepareItemCondition(root, 'map', geometries, materials);

    setItemBroken(bindings, true);
    const damaged = mesh.geometry;
    expect(damaged).not.toBe(geometry);
    expect([...damaged.getAttribute('position').array]).not.toEqual(positions);
    expect(mesh.material.color.getHex()).toBe(material.color.getHex());
    expect(geometries.has(damaged)).toBe(true);
    expect(sibling.geometry).toBe(geometry);
    expect([...geometry.getAttribute('position').array]).toEqual(positions);

    setItemBroken(bindings, false);
    expect(mesh.geometry).toBe(geometry);
    expect(mesh.material).toBe(material);
    setItemBroken(bindings, true);
    expect(mesh.geometry).toBe(damaged);
    geometries.forEach((resource) => resource.dispose());
    materials.forEach((resource) => resource.dispose());
    geometry.dispose();
    material.dispose();
  });
});

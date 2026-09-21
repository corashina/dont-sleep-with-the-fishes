import { readFile } from 'node:fs/promises';
import { Box3, BoxGeometry, BufferGeometry, Group, Material, Mesh, MeshStandardMaterial, Raycaster, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { ITEM_IDS, ITEM_DEFINITIONS } from '../src/game/ItemState';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import { normalizeLongestDimensionTemplate } from '../src/world/modelValidation';
import { prepareItemCondition, setItemBroken, type ItemConditionBinding } from '../src/survival/itemConditionAppearance';

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

// Importance: 95. Damage must never alter a usable model or survive repair.
describe('item condition appearance', () => {
  // Importance: 90. Every real breakable asset must remain renderable after damage.
  it.each(ITEM_IDS.filter((id) => ITEM_DEFINITIONS[id].breakable))(
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

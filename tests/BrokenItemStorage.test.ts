import { readFile } from 'node:fs/promises';
import { Box3, BufferGeometry, DoubleSide, Group, Material, Mesh, Object3D, Raycaster, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import { ITEM_DEFINITIONS, ITEM_IDS, type ItemId } from '../src/game/ItemState';
import { fitBrokenItemToStorage } from '../src/survival/brokenItemStorage';
import { prepareItemCondition, setItemBroken } from '../src/survival/itemConditionAppearance';
import { boatSupplyTransform } from '../src/world/BoatStorage';
import { createLifeboat } from '../src/world/Lifeboat';
import { LifeboatAssets } from '../src/world/LifeboatAssets';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import { normalizeLongestDimensionTemplate } from '../src/world/modelValidation';

async function loadItem(id: ItemId): Promise<Group> {
  const bytes = await readFile(`src/assets/models/items/${id}.glb`);
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  const loader = new GLTFLoader().register(() => ({ name: 'test-textures', loadTexture: async () => new Texture() }));
  const { scene } = await loader.parseAsync(data, '');
  normalizeLongestDimensionTemplate(scene, ITEM_MODEL_SPECS[id], (message) => new Error(message));
  return scene;
}

function meshes(root: Object3D): Mesh[] {
  const result: Mesh[] = [];
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    result.push(object);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.side = DoubleSide;
  });
  return result;
}

function readTriangle(mesh: Mesh, index: number, points: Vector3[]): void {
  const positions = mesh.geometry.getAttribute('position');
  const indices = mesh.geometry.index;
  for (let corner = 0; corner < 3; corner += 1) {
    points[corner]!.fromBufferAttribute(positions, indices?.getX(index + corner) ?? index + corner)
      .applyMatrix4(mesh.matrixWorld);
  }
}

function crossings(source: Object3D, targets: Mesh[]): string[] {
  const sourceBounds = new Box3().setFromObject(source, true);
  const nearby = targets.map((mesh) => ({ mesh, bounds: new Box3().setFromObject(mesh, true) }))
    .filter(({ bounds }) => sourceBounds.intersectsBox(bounds));
  if (nearby.length === 0) return [];
  const ray = new Raycaster();
  const points = [new Vector3(), new Vector3(), new Vector3()];
  const hits = new Map<string, Box3>();
  const triangleBounds = new Box3();
  for (const mesh of meshes(source)) {
    const positions = mesh.geometry.getAttribute('position');
    const indices = mesh.geometry.index;
    for (let index = 0; index < (indices?.count ?? positions.count); index += 3) {
      readTriangle(mesh, index, points);
      triangleBounds.setFromPoints(points);
      const candidates = nearby.filter(({ bounds }) => bounds.intersectsBox(triangleBounds)).map(({ mesh }) => mesh);
      for (let edge = 0; edge < 3; edge += 1) {
        const start = points[edge]!;
        const end = points[(edge + 1) % 3]!;
        ray.ray.origin.copy(start);
        ray.ray.direction.subVectors(end, start).normalize();
        ray.near = 0.0001;
        ray.far = start.distanceTo(end) - 0.0001;
        if (ray.far <= ray.near) continue;
        for (const hit of ray.intersectObjects(candidates, false)) {
          const bounds = hits.get(hit.object.name) ?? new Box3();
          bounds.expandByPoint(hit.point);
          hits.set(hit.object.name, bounds);
        }
      }
    }
  }
  return [...hits].map(([name, bounds]) => `${name}: ${JSON.stringify(bounds)}`);
}

// Importance: 95. Broken items must clear the actual boat and surrounding stored items.
it('keeps every damaged production item clear of the boat and other supplies', async () => {
  const assets = LifeboatAssets.fromTextures(new Texture(), new Texture(), new Texture());
  const { root: boat } = createLifeboat(assets);
  const boatMeshes = meshes(boat);
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const items: { id: ItemId; root: Group; usable: Box3; bindings: ReturnType<typeof prepareItemCondition> }[] = [];
  try {
    for (const id of ITEM_IDS.filter((id) => id !== 'carlitos')) {
      const model = await loadItem(id);
      const copies = id === 'cannedFood' || id === 'baitTin' ? 8 : 1;
      for (let index = 0; index < copies; index += 1) {
        const root = new Group();
        root.name = `${id}-${index + 1}`;
        root.add(model.clone(true));
        const pose = boatSupplyTransform(id, index);
        root.position.copy(pose.position);
        root.rotation.copy(pose.rotation);
        root.scale.setScalar(pose.scale);
        boat.add(root);
        const bindings = prepareItemCondition(root, id, geometries, materials);
        const usable = new Box3().setFromObject(root, true);
        fitBrokenItemToStorage(root, bindings, id);
        setItemBroken(bindings, true);
        items.push({ id, root, usable, bindings });
      }
    }
    boat.updateWorldMatrix(true, true);
    for (const item of items.filter(({ id }) => ITEM_DEFINITIONS[id].breakable)) {
      const bounds = new Box3().setFromObject(item.root, true);
      // The net hangs outside its slot; verify its actual mesh against the curved rim below.
      if (item.id !== 'fishingNet') {
        expect(bounds.min.y, `${item.id} support`).toBeGreaterThanOrEqual(item.usable.min.y + 0.001);
        for (const axis of ['x', 'z'] as const) {
          expect(bounds.min[axis], `${item.id} ${axis} min`).toBeGreaterThanOrEqual(item.usable.min[axis] - 0.00001);
          expect(bounds.max[axis], `${item.id} ${axis} max`).toBeLessThanOrEqual(item.usable.max[axis] + 0.00001);
        }
      }
      expect.soft(crossings(item.root, boatMeshes), `${item.id} intersects boat`).toEqual([]);
      for (const other of items.filter((other) => other !== item)) {
        expect.soft(crossings(item.root, meshes(other.root)), `${item.id} intersects ${other.root.name}`).toEqual([]);
        if (other.bindings.length === 0) continue;
        setItemBroken(other.bindings, false);
        expect.soft(crossings(item.root, meshes(other.root)), `${item.id} intersects usable ${other.id}`).toEqual([]);
        setItemBroken(other.bindings, true);
      }
    }
  } finally {
    for (const mesh of meshes(boat)) {
      mesh.geometry.dispose();
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      list.forEach((material) => material.dispose());
    }
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    assets.dispose();
  }
}, 60000);

import { readFile } from 'node:fs/promises';
import { Box3, BufferGeometry, DoubleSide, Group, Material, Mesh, Object3D, PerspectiveCamera, Raycaster, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import { ITEM_DEFINITIONS, ITEM_IDS, type ItemId } from '../src/game/ItemState';
import { fitBrokenItemToStorage } from '../src/survival/brokenItemStorage';
import { BoatCameraController } from '../src/survival/BoatCameraController';
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

// Importance: 95. Storage fitting must preserve fragment size when an item breaks.
it.each(ITEM_IDS.filter((id) => ITEM_DEFINITIONS[id].breakable))(
  'preserves every %s fragment edge length when fitting it to storage', async (id) => {
    const root = new Group();
    root.add(await loadItem(id));
    const pose = boatSupplyTransform(id, 0);
    root.position.copy(pose.position);
    root.rotation.copy(pose.rotation);
    root.scale.setScalar(pose.scale);
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    const bindings = prepareItemCondition(root, id, geometries, materials);
    const before = bindings.map(({ brokenGeometry }) => brokenGeometry.getAttribute('position').clone());
    const a = new Vector3();
    const b = new Vector3();
    try {
      fitBrokenItemToStorage(root, bindings, id);
      let maximumChange = 0;
      bindings.forEach(({ brokenGeometry, mesh }, meshIndex) => {
        const after = brokenGeometry.getAttribute('position');
        for (let triangle = 0; triangle < after.count; triangle += 3) {
          for (let edge = 0; edge < 3; edge += 1) {
            const first = triangle + edge;
            const second = triangle + (edge + 1) % 3;
            a.fromBufferAttribute(before[meshIndex]!, first).applyMatrix4(mesh.matrixWorld);
            b.fromBufferAttribute(before[meshIndex]!, second).applyMatrix4(mesh.matrixWorld);
            const original = a.distanceTo(b);
            a.fromBufferAttribute(after, first).applyMatrix4(mesh.matrixWorld);
            b.fromBufferAttribute(after, second).applyMatrix4(mesh.matrixWorld);
            maximumChange = Math.max(maximumChange, Math.abs(a.distanceTo(b) - original));
          }
        }
      });
      expect(maximumChange, `${id} fragment size changed`).toBeLessThan(0.000001);
      expect(root.scale.toArray()).toEqual([pose.scale, pose.scale, pose.scale]);
    } finally {
      for (const mesh of meshes(root)) {
        mesh.geometry.dispose();
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
      }
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    }
  },
);

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

// Importance: 95. Supporting one fragment must not leave the other floating above the boat.
function fragmentBottoms(root: Object3D): number[] {
  const bottoms = [Infinity, Infinity];
  const point = new Vector3();
  for (const mesh of meshes(root)) {
    const positions = mesh.geometry.getAttribute('position');
    const fragments = mesh.geometry.getAttribute('damageFragment');
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld);
      const fragment = fragments.getX(index);
      bottoms[fragment] = Math.min(bottoms[fragment]!, point.y);
    }
  }
  return bottoms;
}

function netHasSupport(root: Object3D, supports: Mesh[]): boolean {
  const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0), 0, 0.006);
  const bounds = supports.map((mesh) => ({ mesh, box: new Box3().setFromObject(mesh, true) }));
  const points = [new Vector3(), new Vector3(), new Vector3()];
  for (const mesh of meshes(root)) {
    const positions = mesh.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index += 3) {
      readTriangle(mesh, index, points);
      for (let edge = 0; edge < 3; edge += 1) {
        const start = points[edge]!;
        const end = points[(edge + 1) % 3]!;
        const steps = Math.max(1, Math.ceil(start.distanceTo(end) / 0.01));
        for (let step = 0; step <= steps; step += 1) {
          ray.ray.origin.lerpVectors(start, end, step / steps);
          const nearby = bounds.filter(({ box }) => ray.ray.intersectsBox(box)).map(({ mesh }) => mesh);
          if (ray.intersectObjects(nearby, false).length > 0) return true;
        }
      }
    }
  }
  return false;
}

function verifyStorageSupport(id: ItemId, root: Group, usable: Box3, boatMeshes: Mesh[]): void {
  if (id === 'bucket') {
    const bounds = new Box3().setFromObject(root, true);
    expect(bounds.min.distanceTo(usable.min)).toBeLessThan(0.000001);
    expect(bounds.max.distanceTo(usable.max)).toBeLessThan(0.000001);
    return;
  }
  if (id === 'fishingNet') {
    expect(netHasSupport(root, boatMeshes), 'connected net rests on the boat').toBe(true);
    return;
  }
  if (['map', 'spyglass', 'anchor', 'flashlight'].includes(id)) {
    for (const bottom of fragmentBottoms(root)) {
      expect(bottom, `${id} fragment contact`).toBeCloseTo(usable.min.y + 0.002, 5);
    }
  }
  const bounds = new Box3().setFromObject(root, true);
  expect(bounds.min.y, `${id} support`).toBeGreaterThanOrEqual(usable.min.y + 0.001);
}

// Importance: 95. Grounded fragments must not intersect another fragment of the same item.
function verifyFragmentClearance(root: Group): void {
  const halves = [new Group(), new Group()];
  for (const mesh of meshes(root)) {
    const fragments = mesh.geometry.getAttribute('damageFragment');
    halves.forEach((half, fragment) => {
      const indices = Array.from({ length: fragments.count }, (_, index) => index)
        .filter((index) => fragments.getX(index) === fragment);
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      geometry.setIndex(indices);
      geometry.clearGroups();
      half.add(new Mesh(geometry, Array.isArray(mesh.material) ? mesh.material[0] : mesh.material));
    });
  }
  try {
    expect(crossings(halves[0]!, meshes(halves[1]!)), `${root.name} fragment overlap`).toEqual([]);
    expect(crossings(halves[1]!, meshes(halves[0]!)), `${root.name} reverse fragment overlap`).toEqual([]);
  } finally {
    halves.flatMap(meshes).forEach((mesh) => mesh.geometry.dispose());
  }
}

// Importance: 95. Separate meshes can still hide each other from the player's seat.
function verifyAnchorSilhouettes(root: Group): void {
  const camera = new PerspectiveCamera(60, 1, 0.01, 100);
  const controller = new BoatCameraController(camera, new Group(), root.position);
  camera.updateMatrixWorld(true);
  const bounds = [new Box3(), new Box3()];
  const point = new Vector3();
  for (const mesh of meshes(root)) {
    const positions = mesh.geometry.getAttribute('position');
    const fragments = mesh.geometry.getAttribute('damageFragment');
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld).project(camera);
      bounds[fragments.getX(index)]!.expandByPoint(point);
    }
  }
  expect(bounds[1]!.min.x - bounds[0]!.max.x, 'anchor screen gap').toBeGreaterThan(0.025);
  controller.dispose();
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
        expect(root.rotation.toArray(), `${id} stored orientation`).toEqual(pose.rotation.toArray());
        setItemBroken(bindings, true);
        items.push({ id, root, usable, bindings });
      }
    }
    boat.updateWorldMatrix(true, true);
    for (const item of items.filter(({ id }) => ITEM_DEFINITIONS[id].breakable)) {
      verifyStorageSupport(item.id, item.root, item.usable, boatMeshes);
      if (item.id === 'anchor') verifyAnchorSilhouettes(item.root);
      if (['anchor', 'umbrella', 'spyglass', 'flashlight', 'fishingNet'].includes(item.id)) {
        verifyFragmentClearance(item.root);
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

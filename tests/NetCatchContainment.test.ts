import { readFile } from 'node:fs/promises';
import { Box3, Group, Matrix4, Mesh, MeshStandardMaterial, Object3D, Ray, Triangle, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it, vi } from 'vitest';
import { FishingCatchLibrary } from '../src/survival/FishingCatchLibrary';
import { FISHING_CATCHES } from '../src/survival/fishingCatalog';
import { NetFishingPresentation } from '../src/survival/NetFishingPresentation';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import { normalizeLongestDimensionTemplate } from '../src/world/modelValidation';
import { FISHING_MODEL_SIZES } from '../src/game/fishingModelSizes';
import { MENU_MODEL_SPECS } from '../src/menu/menuModelManifest';
import { EVENT_MODEL_SPECS, SURVIVAL_EVENT_MODEL_SPECS } from '../src/survival/eventModelManifest';

async function loadModel(path: string): Promise<Group> {
  const bytes = await readFile(path);
  const loader = new GLTFLoader().register(() => ({ name: 'geometry-audit', loadMaterial: async () => new MeshStandardMaterial() }));
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  return (await loader.parseAsync(data, '')).scene;
}

function triangles(root: Object3D, transform = new Matrix4()) {
  root.updateWorldMatrix(true, true);
  const result: { triangle: Triangle; bounds: Box3 }[] = [];
  root.traverse((mesh) => {
    if (!(mesh instanceof Mesh)) return;
    const matrix = new Matrix4().multiplyMatrices(transform, mesh.matrixWorld);
    const positions = mesh.geometry.getAttribute('position');
    const indices = mesh.geometry.index;
    for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
      const vertex = (index: number) => new Vector3().fromBufferAttribute(positions, indices?.getX(index) ?? index).applyMatrix4(matrix);
      const triangle = new Triangle(vertex(i), vertex(i + 1), vertex(i + 2));
      result.push({ triangle, bounds: new Box3().setFromPoints([triangle.a, triangle.b, triangle.c]) });
    }
  });
  return result;
}

const ray = new Ray();
const hit = new Vector3();
function edgeHits(a: Vector3, b: Vector3, triangle: Triangle): boolean {
  ray.origin.copy(a);
  ray.direction.subVectors(b, a);
  const length = ray.direction.length();
  if (length < 1e-9) return false;
  ray.direction.divideScalar(length);
  return ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit) !== null
    && hit.distanceTo(a) <= length + 1e-8;
}

function intersects(a: Triangle, b: Triangle): boolean {
  return edgeHits(a.a, a.b, b) || edgeHits(a.b, a.c, b) || edgeHits(a.c, a.a, b)
    || edgeHits(b.a, b.b, a) || edgeHits(b.b, b.c, a) || edgeHits(b.c, b.a, a);
}

it('contains every production catch throughout the haul without resizing or intersecting the net mesh', async () => {
  const model = await loadModel('src/assets/models/items/fishingNet.glb');
  normalizeLongestDimensionTemplate(model, ITEM_MODEL_SPECS.fishingNet, message => new Error(message));
  const netTriangles = triangles(model);
  const bagBounds = new Box3().setFromObject(model.getObjectByName('FishingNet_3')!, true);
  const world = new Group();
  const boat = new Group();
  world.add(boat);
  boat.position.set(0, 0.25, 0);
  boat.rotation.set(-0.15, 0.06, 0.2);
  const library = new FishingCatchLibrary({ load: url => loadModel(decodeURIComponent(url.slice(url.indexOf('/src/assets/') + 1))) });
  const prepare = library.prepare.bind(library);
  const mock = vi.fn();
  const net = new NetFishingPresentation(model, world, boat, output => { output.height = 0.15; }, {
    prepare: mock, hide: () => undefined, dispose: () => undefined,
  });
  try {
    for (const definition of FISHING_CATCHES) {
      const caught = (await prepare(definition.id))!;
      const size = new Box3().setFromObject(caught, true).getSize(new Vector3());
      const expected = definition.presentation.kind === 'item'
        ? ITEM_MODEL_SPECS[definition.presentation.itemId].targetLongestDimension
        : FISHING_MODEL_SIZES[definition.id as keyof typeof FISHING_MODEL_SIZES];
      expect(Math.max(size.x, size.y, size.z), definition.id).toBeCloseTo(expected, 6);
      const scale = caught.scale.clone();
      mock.mockResolvedValue(caught);
      net.show();
      await net.prepare(definition.id, { x: 0, z: -6.4 });
      const pivot = net.root.getObjectByName('fishing-net-haul-pivot')!;
      for (const progress of [0.58, 0.65, 0.8, 0.9, 1]) {
        net.sample(progress);
        world.updateMatrixWorld(true);
        expect(caught.scale.equals(scale), definition.id).toBe(true);
        const local = triangles(caught, pivot.matrixWorld.clone().invert());
        for (const { triangle, bounds } of local) {
          for (const vertex of [triangle.a, triangle.b, triangle.c]) {
            expect(bagBounds.containsPoint(vertex), `${definition.id}: outside basket at ${progress}`).toBe(true);
          }
          if (progress !== 1) continue;
          for (const obstacle of netTriangles) {
            if (!bounds.intersectsBox(obstacle.bounds)) continue;
            expect(intersects(triangle, obstacle.triangle), `${definition.id}: intersects net mesh`).toBe(false);
          }
        }
      }
    }
  } finally {
    net.dispose();
    library.dispose();
  }
}, 30_000);

it('uses the same fish sizes in fishing, events, and the menu', () => {
  for (const id of ['cod', 'bass', 'redSnapper'] as const) {
    expect(EVENT_MODEL_SPECS[id].targetLongestDimension).toBe(FISHING_MODEL_SIZES[id]);
  }
  expect(SURVIVAL_EVENT_MODEL_SPECS.checkBackFish.targetLongestDimension).toBe(FISHING_MODEL_SIZES.bass);
  expect(MENU_MODEL_SPECS.redSnapper.targetLongestDimension).toBe(FISHING_MODEL_SIZES.redSnapper);
  expect(MENU_MODEL_SPECS.seaweed.targetLongestDimension).toBe(FISHING_MODEL_SIZES.seaweed);
});

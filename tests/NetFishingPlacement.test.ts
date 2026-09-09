import { readFile } from 'node:fs/promises';
import { Box3, Matrix4, Mesh, PerspectiveCamera, Triangle, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import { BoatWorld } from '../src/survival/BoatWorld';
import { NetFishingPresentation } from '../src/survival/NetFishingPresentation';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { LIFEBOAT_FLOOR_SURFACE_Y } from '../src/world/Lifeboat';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import { normalizeLongestDimensionTemplate } from '../src/world/modelValidation';
import { createTestPropModels } from './helpers/propModels';
import { createTestSkyTextures } from './helpers/skyAssets';

it('keeps the production net clear of the bow, ribs, and bench supports during pickup and return', async () => {
  const bytes = await readFile('src/assets/models/items/fishingNet.glb');
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  const { scene: model } = await new GLTFLoader().parseAsync(data, '');
  normalizeLongestDimensionTemplate(model, ITEM_MODEL_SPECS.fishingNet, (message) => new Error(message));
  const models = createTestPropModels();
  const world = new BoatWorld(new PerspectiveCamera(), models, ...createTestSkyTextures());
  const rod = world.scene.getObjectByName('fishing-rod-pivot')!;
  const boat = rod.parent!;
  const net = new NetFishingPresentation(model, world.scene, boat, (output) => { output.height = 0; });
  boat.updateWorldMatrix(true, true);
  const inverse = boat.matrixWorld.clone().invert();
  const meshToBoat = new Matrix4();
  const triangle = new Triangle();
  const obstacles = ['lifeboat-bow-cap-plate', 'survival-rib-0', 'lifeboat-display-bench-seat'].map((name) => {
    const object = boat.getObjectByName(name)!;
    return { name, bounds: new Box3().setFromObject(object, true).applyMatrix4(inverse) };
  });
  const bench = boat.getObjectByName('lifeboat-display-bench')!;
  for (const support of bench.children) {
    if (support instanceof Mesh && support.position.y < 0) {
      obstacles.push({ name: 'front bench support', bounds: new Box3().setFromObject(support, true).applyMatrix4(inverse) });
    }
  }
  const check = (label: string) => {
    let minimumY = Infinity;
    let collision: string | null = null;
    model.updateWorldMatrix(true, true);
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      meshToBoat.multiplyMatrices(inverse, object.matrixWorld);
      const positions = object.geometry.getAttribute('position');
      const indices = object.geometry.index;
      const vertexIndex = (index: number) => indices === null ? index : indices.getX(index);
      for (let index = 0; index < (indices?.count ?? positions.count); index += 3) {
        triangle.a.fromBufferAttribute(positions, vertexIndex(index)).applyMatrix4(meshToBoat);
        triangle.b.fromBufferAttribute(positions, vertexIndex(index + 1)).applyMatrix4(meshToBoat);
        triangle.c.fromBufferAttribute(positions, vertexIndex(index + 2)).applyMatrix4(meshToBoat);
        minimumY = Math.min(minimumY, triangle.a.y, triangle.b.y, triangle.c.y);
        for (const { name, bounds } of obstacles) {
          if (bounds.intersectsTriangle(triangle)) collision = name;
        }
      }
    });
    expect(minimumY, label).toBeGreaterThanOrEqual(LIFEBOAT_FLOOR_SURFACE_Y - 0.002);
    expect(collision, label).toBeNull();
  };
  try {
    net.show();
    const pivot = model.parent!;
    const position = pivot.getWorldPosition(new Vector3()).applyMatrix4(inverse);
    expect(position.x).toBeLessThan(rod.position.x);
    expect(position.x - rod.position.x).toBeLessThan(-1);
    const handle = pivot.localToWorld(new Vector3(0, 0.09820857, 0.82)).applyMatrix4(inverse);
    const basket = pivot.localToWorld(new Vector3(0, 0.03, -0.56)).applyMatrix4(inverse);
    expect(handle.y).toBeCloseTo(LIFEBOAT_FLOOR_SURFACE_Y, 5);
    const shaft = basket.clone().sub(handle).normalize();
    expect(basket.x).toBeLessThan(handle.x - 0.85);
    expect(Math.acos(shaft.y) * 180 / Math.PI).toBeGreaterThan(42);
    expect(Math.acos(shaft.y) * 180 / Math.PI).toBeLessThan(50);
    expect(basket.y - handle.y).toBeGreaterThan(0.85);
    expect(Math.abs(handle.z - rod.position.z)).toBeLessThan(0.6);
    const basketDown = new Vector3(0, -1, 0).transformDirection(
      new Matrix4().multiplyMatrices(inverse, pivot.matrixWorld),
    );
    expect(basketDown.y).toBeLessThan(-0.7);
    expect(basketDown.x).toBeLessThan(-0.6);
    for (let frame = 0; frame <= 60; frame += 1) {
      net.samplePickup(frame / 60);
      check(`pickup ${frame}`);
    }
    net.sample(1);
    net.beginReturn();
    for (let frame = 0; frame <= 60; frame += 1) {
      net.sampleReturn(frame / 60);
      check(`return ${frame}`);
    }
  } finally {
    net.dispose();
    world.dispose();
    models.dispose();
  }
});

it('keeps the stored net hidden until the fishing return finishes', async () => {
  const items = [{ instanceId: 'fishingNet-1', type: 'fishingNet' }] as const;
  const models = createTestPropModels();
  const world = new BoatWorld(new PerspectiveCamera(), models, ...createTestSkyTextures(), items);
  world.syncInventory(new SurvivalSession(items, { seed: 1 }).snapshot());
  const stored = world.scene.getObjectByName('boat-supply:fishingNet:copy-1')!;
  try {
    expect(stored.visible).toBe(true);
    const enter = world.enterFishingView('net');
    expect(stored.visible).toBe(false);
    for (let frame = 1; frame <= 120; frame += 1) world.update(frame / 60, 1 / 60);
    await enter;
    const exit = world.exitFishingView();
    expect(stored.visible).toBe(false);
    const net = world.scene.getObjectByName('fishing-net-haul')!;
    expect(net.visible).toBe(true);
    for (let frame = 121; frame <= 240; frame += 1) world.update(frame / 60, 1 / 60);
    await exit;
    expect(net.visible).toBe(false);
    expect(stored.visible).toBe(true);
  } finally {
    world.dispose();
    models.dispose();
  }
});

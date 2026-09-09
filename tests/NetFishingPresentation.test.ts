import { readFile } from 'node:fs/promises';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';
import { FishingCatchLibrary } from '../src/survival/FishingCatchLibrary';
import { NetFishingPresentation } from '../src/survival/NetFishingPresentation';
import { FISHING_CATCHES } from '../src/survival/fishingCatalog';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import { normalizeLongestDimensionTemplate } from '../src/world/modelValidation';
import { boatSupplyTransform } from '../src/world/BoatStorage';

describe('net animation', () => {
  it('keeps the production net in view, submerges the basket, and raises the catches', async () => {
    const bytes = await readFile('src/assets/models/items/fishingNet.glb');
    const data = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(data).set(bytes);
    const gltf = await new GLTFLoader().parseAsync(data, '');
    normalizeLongestDimensionTemplate(gltf.scene, ITEM_MODEL_SPECS.fishingNet, (message) => new Error(message));
    const scene = new Group();
    const camera = new PerspectiveCamera(60, 16 / 9, 0.05, 100);
    camera.position.set(0, 1.38, -1.42);
    camera.lookAt(0, -0.42, -7.4);
    camera.updateMatrixWorld();
    const prepare = vi.spyOn(FishingCatchLibrary.prototype, 'prepare').mockImplementation(async () => (
      new Mesh(new BoxGeometry(0.5, 0.1, 0.1), new MeshStandardMaterial())
    ));
    const net = new NetFishingPresentation(gltf.scene, scene, scene, (output) => { output.height = 0; });
    const point = new Vector3();
    try {
      net.show();
      await net.prepare([FISHING_CATCHES[0]!, FISHING_CATCHES[1]!], { x: 0, z: -6.4 });
      const basket = net.root.getObjectByName('fishing-net-catches')!;
      expect(basket.children).toHaveLength(2);
      for (let frame = 0; frame <= 288; frame += 1) {
        net.sample(frame / 288);
        net.update(1 / 60);
        scene.updateMatrixWorld(true);
        basket.getWorldPosition(point).project(camera);
        expect(Math.abs(point.x)).toBeLessThan(1);
        expect(Math.abs(point.y)).toBeLessThan(1);
      }
      net.sample(0.4);
      expect(basket.visible).toBe(false);
      net.sample(1);
      expect(basket.visible).toBe(true);
      basket.getWorldPosition(point);
      expect(point.y).toBeGreaterThan(0.4);
      net.clear();
      expect(net.root.visible).toBe(false);
      expect(basket.children).toHaveLength(0);
    } finally {
      net.dispose();
      prepare.mockRestore();
    }
    expect(scene.children).toHaveLength(0);
  });

  it('discards catches whose loading finishes after the view closes', async () => {
    const scene = new Group();
    let finish!: (model: Group) => void;
    const pending = new Promise<Group>((resolve) => { finish = resolve; });
    const prepare = vi.spyOn(FishingCatchLibrary.prototype, 'prepare').mockReturnValue(pending);
    const net = new NetFishingPresentation(new Group(), scene, scene, (output) => { output.height = 0; });
    try {
      net.show();
      const load = net.prepare([FISHING_CATCHES[0]!, FISHING_CATCHES[1]!], { x: 0, z: -6.4 });
      net.clear();
      finish(new Group());
      expect(await load).toBe(false);
      expect(net.root.visible).toBe(false);
    } finally {
      net.dispose();
      prepare.mockRestore();
    }
  });

  it('picks up and returns to the stored pose on a moving boat', () => {
    const scene = new Group();
    const boat = new Group();
    scene.add(boat);
    const storage = boatSupplyTransform('fishingNet', 0);
    const storedNet = new Group();
    storedNet.position.copy(storage.position);
    storedNet.rotation.copy(storage.rotation);
    storedNet.scale.setScalar(storage.scale);
    boat.add(storedNet);
    boat.position.set(0, 0.22, 0);
    boat.rotation.set(0.02, 0, -0.03);
    const net = new NetFishingPresentation(new Group(), scene, boat, (output) => { output.height = 0; });
    const pivot = net.root.getObjectByName('fishing-net-haul-pivot')!;
    const expectStoredPose = () => {
      scene.updateMatrixWorld(true);
      pivot.matrixWorld.elements.forEach((value, index) => {
        expect(value).toBeCloseTo(storedNet.matrixWorld.elements[index]!, 8);
      });
    };
    try {
      net.show();
      expectStoredPose();
      net.samplePickup(1);
      const held = pivot.matrix.clone();
      scene.updateMatrixWorld(true);
      held.copy(pivot.matrixWorld);
      net.sample(0);
      scene.updateMatrixWorld(true);
      pivot.matrixWorld.elements.forEach((value, index) => expect(value).toBeCloseTo(held.elements[index]!, 8));
      net.sample(1);
      net.beginReturn();
      const returnStart = pivot.position.clone();
      net.sampleReturn(0);
      expect(pivot.position.distanceTo(returnStart)).toBeLessThan(1e-8);
      boat.position.y += 0.15;
      boat.rotation.z = 0.06;
      net.sampleReturn(1);
      expectStoredPose();
    } finally {
      net.dispose();
    }
  });
});

import { readFile } from 'node:fs/promises';
import {
  Box3, BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, PerspectiveCamera, Triangle, Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';
import { BoatWorld } from '../src/survival/BoatWorld';
import { FishingCatchLibrary } from '../src/survival/FishingCatchLibrary';
import { LIFEBOAT_FLOOR_SURFACE_Y, LIFEBOAT_GUNWALE_SURFACE_Y } from '../src/world/Lifeboat';
import { LIFEBOAT_EQUIPMENT_MODEL_SPECS } from '../src/world/lifeboatEquipmentManifest';
import { normalizeLongestDimensionTemplate } from '../src/world/modelValidation';
import { createTestPropModels } from './helpers/propModels';
import { createTestSkyTextures } from './helpers/skyAssets';

describe('fishing rod hull clearance', () => {
  it('centers the production rod in the fishing view and clears the hull through fishing movements', async () => {
    const bytes = await readFile('src/assets/models/items/fishingRod.glb');
    const data = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(data).set(bytes);
    const gltf = await new GLTFLoader().parseAsync(data, '');
    normalizeLongestDimensionTemplate(
      gltf.scene,
      LIFEBOAT_EQUIPMENT_MODEL_SPECS.fishingRod,
      (message) => new Error(message),
    );
    const rod = new Group();
    rod.add(gltf.scene);
    const models = createTestPropModels();
    const createEquipment = models.createEquipment.bind(models);
    vi.spyOn(models, 'createEquipment').mockImplementation((id) => (
      id === 'fishingRod' ? rod : createEquipment(id)
    ));
    const camera = new PerspectiveCamera(80, 1920 / 1080);
    const world = new BoatWorld(camera, models, ...createTestSkyTextures());
    const catchModel = new Mesh(new BoxGeometry(0.3, 0.1, 0.1), new MeshStandardMaterial());
    const prepareCatch = vi.spyOn(FishingCatchLibrary.prototype, 'prepare').mockResolvedValue(catchModel);
    const boat = rod.parent!.parent!;
    const bounds = new Box3();
    const boatInverse = new Matrix4();
    const meshToBoat = new Matrix4();
    const vertex = new Vector3();
    const triangle = new Triangle();
    boat.updateWorldMatrix(true, true);
    boatInverse.copy(boat.matrixWorld).invert();
    const obstacles = [
      'lifeboat-bow-cap-plate',
      'survival-rib-0',
      'lifeboat-display-bench-seat',
    ].map((name) => {
      const mesh = boat.getObjectByName(name) as Mesh;
      mesh.geometry.computeBoundingBox();
      return {
        name,
        bounds: mesh.geometry.boundingBox!.clone().applyMatrix4(
          new Matrix4().multiplyMatrices(boatInverse, mesh.matrixWorld),
        ),
      };
    });
    let time = 0;
    let minimumY = Infinity;
    let lowBowZ = Infinity;
    let lowSternZ = -Infinity;
    const findCollision = (mesh: Mesh): string | null => {
      // Long shaft faces can cross the bow even when their vertices clear it.
      const positions = mesh.geometry.getAttribute('position');
      const indices = mesh.geometry.index;
      const count = indices?.count ?? positions.count;
      for (let index = 0; index < count; index += 3) {
        triangle.a.fromBufferAttribute(positions, indices?.getX(index) ?? index).applyMatrix4(meshToBoat);
        triangle.b.fromBufferAttribute(positions, indices?.getX(index + 1) ?? index + 1).applyMatrix4(meshToBoat);
        triangle.c.fromBufferAttribute(positions, indices?.getX(index + 2) ?? index + 2).applyMatrix4(meshToBoat);
        for (const obstacle of obstacles) {
          if (obstacle.bounds.intersectsTriangle(triangle)) return obstacle.name;
        }
      }
      return null;
    };
    const checkClearance = () => {
      let collision: string | null = null;
      boat.updateWorldMatrix(true, true);
      boatInverse.copy(boat.matrixWorld).invert();
      bounds.makeEmpty();
      rod.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        meshToBoat.multiplyMatrices(boatInverse, object.matrixWorld);
        const positions = object.geometry.getAttribute('position');
        for (let index = 0; index < positions.count; index += 1) {
          vertex.fromBufferAttribute(positions, index).applyMatrix4(meshToBoat);
          minimumY = Math.min(minimumY, vertex.y);
          if (vertex.y <= LIFEBOAT_GUNWALE_SURFACE_Y) lowBowZ = Math.min(lowBowZ, vertex.z);
          if (vertex.y <= 0.22) lowSternZ = Math.max(lowSternZ, vertex.z);
          bounds.expandByPoint(vertex);
        }
        collision ??= findCollision(object);
      });
      expect(collision, `Rod collision at ${time}`).toBeNull();
      expect(bounds.min.y).toBeGreaterThanOrEqual(LIFEBOAT_FLOOR_SURFACE_Y);
    };
    const advance = async (animation: Promise<void>) => {
      await Promise.resolve();
      for (let frame = 0; frame < 120; frame += 1) {
        time += 1 / 60;
        world.update(time, 1 / 60);
        checkClearance();
      }
      await animation;
    };
    try {
      checkClearance();
      expect(bounds.min.y).toBeLessThan(LIFEBOAT_FLOOR_SURFACE_Y + 0.025);
      await advance(world.enterFishingView());
      const tip = rod.getObjectByName('fishing-line-origin')!;
      camera.updateWorldMatrix(true, false);
      const projectedTip = tip.getWorldPosition(new Vector3()).project(camera);
      expect(Math.abs(projectedTip.x) * 1920 / 2).toBeLessThan(1);
      await advance(world.playFishingCast(world.centeredFishingCast()));
      await advance(world.playFishingReel('cod'));
      await advance(world.playFishingCast(world.centeredFishingCast()));
      await advance(world.playFishingMiss());
      await advance(world.exitFishingView());
      world.clearFishingPresentation();
      checkClearance();
      expect(minimumY).toBeGreaterThanOrEqual(LIFEBOAT_FLOOR_SURFACE_Y);
      expect(lowBowZ).toBeGreaterThan(-2.8);
      expect(lowSternZ).toBeLessThan(-1.82);
    } finally {
      world.dispose();
      models.dispose();
      prepareCatch.mockRestore();
      catchModel.geometry.dispose();
      catchModel.material.dispose();
    }
  });
});

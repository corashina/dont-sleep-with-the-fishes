import { readFile } from 'node:fs/promises';
import { Box3, BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';
import { BoatWorld } from '../src/survival/BoatWorld';
import { FishingCatchLibrary } from '../src/survival/FishingCatchLibrary';
import { LIFEBOAT_GUNWALE_SURFACE_Y } from '../src/world/Lifeboat';
import { LIFEBOAT_EQUIPMENT_MODEL_SPECS } from '../src/world/lifeboatEquipmentManifest';
import { normalizeLongestDimensionTemplate } from '../src/world/modelValidation';
import { createTestPropModels } from './helpers/propModels';
import { createTestSkyTextures } from './helpers/skyAssets';

describe('fishing rod hull clearance', () => {
  it('keeps the production rod above the hull at rest and through fishing movements', async () => {
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
    const world = new BoatWorld(new PerspectiveCamera(), models, ...createTestSkyTextures());
    const catchModel = new Mesh(new BoxGeometry(0.3, 0.1, 0.1), new MeshStandardMaterial());
    const prepareCatch = vi.spyOn(FishingCatchLibrary.prototype, 'prepare').mockResolvedValue(catchModel);
    const boat = rod.parent!.parent!;
    const bounds = new Box3();
    const boatInverse = new Matrix4();
    const meshToBoat = new Matrix4();
    const vertex = new Vector3();
    let time = 0;
    const checkClearance = () => {
      boat.updateWorldMatrix(true, true);
      boatInverse.copy(boat.matrixWorld).invert();
      bounds.makeEmpty();
      rod.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        meshToBoat.multiplyMatrices(boatInverse, object.matrixWorld);
        const positions = object.geometry.getAttribute('position');
        for (let index = 0; index < positions.count; index += 1) {
          vertex.fromBufferAttribute(positions, index).applyMatrix4(meshToBoat);
          bounds.expandByPoint(vertex);
        }
      });
      expect(bounds.min.y).toBeGreaterThan(LIFEBOAT_GUNWALE_SURFACE_Y);
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
      await advance(world.enterFishingView());
      await advance(world.playFishingCast(world.centeredFishingCast()));
      await advance(world.playFishingReel('cod'));
      await advance(world.playFishingCast(world.centeredFishingCast()));
      await advance(world.playFishingMiss());
      await advance(world.exitFishingView());
      world.clearFishingPresentation();
      checkClearance();
    } finally {
      world.dispose();
      models.dispose();
      prepareCatch.mockRestore();
      catchModel.geometry.dispose();
      catchModel.material.dispose();
    }
  });
});

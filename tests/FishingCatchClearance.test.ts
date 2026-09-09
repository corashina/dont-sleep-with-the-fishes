import { readFile } from 'node:fs/promises';
import {
  Box3, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Triangle,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it, vi } from 'vitest';
import { BoatWorld } from '../src/survival/BoatWorld';
import { FishingCatchLibrary } from '../src/survival/FishingCatchLibrary';
import { FISHING_CATCHES } from '../src/survival/fishingCatalog';
import { LIFEBOAT_EQUIPMENT_MODEL_SPECS } from '../src/world/lifeboatEquipmentManifest';
import { normalizeLongestDimensionTemplate } from '../src/world/modelValidation';
import { createTestPropModels } from './helpers/propModels';
import { createTestSkyTextures } from './helpers/skyAssets';

async function loadModel(path: string): Promise<Group> {
  const bytes = await readFile(path);
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  // Clearance uses production geometry without browser-only texture decoding.
  const loader = new GLTFLoader().register(() => ({
    name: 'clearance-materials',
    loadMaterial: async () => new MeshStandardMaterial(),
  }));
  return (await loader.parseAsync(data, '')).scene;
}

it('keeps every production catch clear of the rod during reeling and reward display', async () => {
  const rodModel = await loadModel('src/assets/models/items/fishingRod.glb');
  normalizeLongestDimensionTemplate(
    rodModel, LIFEBOAT_EQUIPMENT_MODEL_SPECS.fishingRod, (message) => new Error(message),
  );
  const rod = new Group();
  rod.add(rodModel);
  const models = createTestPropModels();
  const createEquipment = models.createEquipment.bind(models);
  vi.spyOn(models, 'createEquipment').mockImplementation((id) => (
    id === 'fishingRod' ? rod : createEquipment(id)
  ));
  const library = new FishingCatchLibrary({
    load: (url) => loadModel(decodeURIComponent(url.slice(url.indexOf('/src/assets/') + 1))),
  });
  const prepare = library.prepare.bind(library);
  const prepareCatch = vi.spyOn(FishingCatchLibrary.prototype, 'prepare');
  const world = new BoatWorld(new PerspectiveCamera(), models, ...createTestSkyTextures());
  const catchBounds = new Box3();
  const triangle = new Triangle();
  let time = 0;
  try {
    const entering = world.enterFishingView();
    world.update(time += 1.2, 1.2);
    await entering;
    for (const definition of FISHING_CATCHES) {
      for (const x of [-2.7, 0, 2.7]) {
        world.clearFishingPresentation();
        const casting = world.playFishingCast({ x, z: -4.8 });
        world.update(time += 0.8, 0.8);
        await casting;
        const catchModel = await prepare(definition.id);
        expect(catchModel).not.toBeNull();
        prepareCatch.mockResolvedValue(catchModel);
        const reeling = world.playFishingReel(definition.id);
        await Promise.resolve();
        // Include the landed hold, when the rod used to return through the reward.
        for (let frame = 0; frame < 90; frame += 1) {
          world.update(time += 1 / 60, 1 / 60);
          world.scene.updateMatrixWorld(true);
          catchBounds.setFromObject(catchModel!, true);
          let intersects = false;
          rod.traverse((object) => {
            if (!(object instanceof Mesh)) return;
            const positions = object.geometry.getAttribute('position');
            const indices = object.geometry.index;
            const count = indices?.count ?? positions.count;
            for (let index = 0; index < count; index += 3) {
              triangle.a.fromBufferAttribute(positions, indices?.getX(index) ?? index)
                .applyMatrix4(object.matrixWorld);
              triangle.b.fromBufferAttribute(positions, indices?.getX(index + 1) ?? index + 1)
                .applyMatrix4(object.matrixWorld);
              triangle.c.fromBufferAttribute(positions, indices?.getX(index + 2) ?? index + 2)
                .applyMatrix4(object.matrixWorld);
              if (catchBounds.intersectsTriangle(triangle)) {
                intersects = true;
                break;
              }
            }
          });
          expect(intersects, `${definition.id}, cast ${x}, frame ${frame}`).toBe(false);
        }
        await reeling;
      }
    }
  } finally {
    world.dispose();
    library.dispose();
    models.dispose();
    prepareCatch.mockRestore();
  }
}, 30_000);

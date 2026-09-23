import { readFile } from 'node:fs/promises';
import {
  Box3, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Raycaster, Triangle, Vector3,
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

it.each([40, 70, 110])('keeps every catch below the popup and clear of the fixed rod at FOV %s', async (fov) => {
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
  const camera = new PerspectiveCamera(fov, 16 / 9, 0.01, 100);
  const world = new BoatWorld(camera, models, ...createTestSkyTextures());
  const sightline = new Raycaster();
  const eye = new Vector3();
  const center = new Vector3();
  const catchBounds = new Box3();
  const screenBounds = new Box3();
  const screenVertex = new Vector3();
  const triangle = new Triangle();
  let time = 0;
  try {
    const entering = world.enterFishingView();
    world.update(time += 1.2, 1.2);
    await entering;
    const rodPosition = rod.parent!.position.clone();
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
        for (let frame = 0; frame < 210; frame += 1) {
          world.update(time += 1 / 60, 1 / 60);
          // Importance: 90/100. A catch reveal must not move the player's rod.
          expect(rod.parent!.position.equals(rodPosition)).toBe(true);
          world.scene.updateMatrixWorld(true);
          // Importance: 95/100. The lift and reveal must remain centered as the boat rolls.
          if (frame >= 90) {
            world.scene.getObjectByName('fishing-catch-display')!.getWorldPosition(screenVertex);
            expect(Math.abs(screenVertex.project(camera).x), `Centered reward at frame ${frame}`).toBeLessThan(0.015);
          }
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
        camera.getWorldPosition(eye);
        catchBounds.getCenter(center);
        const distance = eye.distanceTo(center);
        sightline.set(eye, center.sub(eye).normalize());
        const obstruction = sightline.intersectObject(rod, true)[0];
        expect(obstruction?.distance ?? Infinity, `${definition.id} reward is behind the rod`)
          .toBeGreaterThan(distance);
        const projected = world.projectFishingCatch(1280, 720);
        expect(projected?.visible, `${definition.id} reward must stay in view`).toBe(true);
        // Importance: 90/100. Production catches must fit below the unchanged popup.
        screenBounds.makeEmpty();
        catchModel!.traverseVisible((object) => {
          if (!(object instanceof Mesh)) return;
          const positions = object.geometry.getAttribute('position');
          for (let index = 0; index < positions.count; index += 1) {
            screenVertex.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld).project(camera);
            screenBounds.expandByPoint(screenVertex);
          }
        });
        expect(Math.abs((screenBounds.min.x + screenBounds.max.x) / 2), definition.id).toBeLessThan(0.03);
        const screenCenterY = (screenBounds.min.y + screenBounds.max.y) / 2;
        expect(screenCenterY, `${definition.id} between center and bottom`).toBeGreaterThan(-0.6);
        expect(screenCenterY, `${definition.id} between center and bottom`).toBeLessThan(-0.4);
        expect(screenBounds.max.y, `${definition.id} below screen center`).toBeLessThan(-0.2);
        expect(screenBounds.min.y, `${definition.id} above viewport edge`).toBeGreaterThan(-0.85);
        catchBounds.getCenter(center);
        camera.worldToLocal(center);
        expect(-center.z, `${definition.id} close to player`).toBeLessThan(0.22);
      }
    }
  } finally {
    world.dispose();
    library.dispose();
    models.dispose();
    prepareCatch.mockRestore();
  }
}, 30_000);

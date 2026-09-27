// Importance: 95/100. Prevents companion clipping and inaccessible off-screen seats.
import { readFile } from 'node:fs/promises';
import { AnimationClip, Box3, BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera, Scene, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';
import { BoatWorld } from '../src/survival/BoatWorld';
import { ChestDisplay } from '../src/survival/ChestDisplay';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createTestPropModels } from './helpers/propModels';
import { createTestSkyTextures } from './helpers/skyAssets';
import { ITEM_IDS, type ItemId } from '../src/game/ItemState';
import { CarlitosPresentation } from '../src/survival/CarlitosPresentation';
import { createCarlitosState } from '../src/survival/CarlitosState';
import { CarlitosSeatPlacement } from '../src/survival/CarlitosSeatPlacement';
import { boatSupplyTransform } from '../src/world/BoatStorage';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import { EVENT_MODEL_SPECS } from '../src/world/eventModelManifest';
import { normalizeLongestDimensionTemplate } from '../src/world/modelValidation';
import { PropModelLibrary } from '../src/world/PropModelLibrary';
import { createLifeboat } from '../src/world/Lifeboat';
import { LifeboatAssets } from '../src/world/LifeboatAssets';

function fixture(aspect = 16 / 9) {
  const scene = new Scene();
  const assets = LifeboatAssets.fromTextures(new Texture(), new Texture(), new Texture());
  const { root: boat } = createLifeboat(assets);
  scene.add(boat);
  const camera = new PerspectiveCamera(80, aspect, 0.05, 100);
  camera.position.set(0, 0.88, 0.96);
  camera.lookAt(0, 0.88, -1.55);
  scene.add(camera);
  const cat = new Group();
  const body = new Mesh(new BoxGeometry(0.36, 0.56, 0.5), new MeshStandardMaterial());
  body.position.y = 0.28;
  cat.add(body);
  boat.add(cat);
  const placement = new CarlitosSeatPlacement(cat, body, boat, scene, camera);
  return { scene, boat, camera, cat, body, placement };
}

function expectInView(body: Object3D, camera: PerspectiveCamera) {
  const bounds = new Box3().setFromObject(body, true);
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const projected = new Vector3(x, y, z).project(camera);
        expect(Math.abs(projected.x)).toBeLessThan(0.96);
        expect(Math.abs(projected.y)).toBeLessThan(0.96);
        expect(Math.abs(projected.z)).toBeLessThan(1);
      }
    }
  }
}

describe('Carlitos sitting positions', () => {
  it.each([16 / 9, 4 / 3, 9 / 16])('keeps the full body in view at aspect %s', aspect => {
    const { placement, cat, body, camera } = fixture(aspect);
    const seats = new Set<string>();
    for (let seed = 0; seed < 16; seed++) {
      placement.setPreference(seed % 2 === 0 ? 1 : -1, seed);
      expect(placement.update()).toBe(true);
      seats.add(cat.userData.seatId);
      expectInView(body, camera);
    }
    expect(seats.size).toBeGreaterThan(aspect < 1 ? 0 : 2);
  });

  it('replaces a blocked seat and rechecks the viewport after resizing', () => {
    const { placement, cat, body, boat, camera } = fixture();
    expect(placement.update()).toBe(true);
    const occupied = cat.position.clone();
    const obstacle = new Mesh(new BoxGeometry(0.6, 0.8, 0.6), new MeshStandardMaterial());
    obstacle.position.copy(occupied).add(new Vector3(0, 0.3, 0));
    boat.add(obstacle);
    expect(placement.update()).toBe(true);
    expect(new Box3().setFromObject(body, true).intersectsBox(new Box3().setFromObject(obstacle))).toBe(false);
    camera.aspect = 9 / 16;
    camera.updateProjectionMatrix();
    expect(placement.update()).toBe(true);
    expectInView(body, camera);
  });

  it('does not accept an unsafe seat when every position is blocked', () => {
    const { placement, boat } = fixture();
    const obstacle = new Mesh(new BoxGeometry(12, 12, 12), new MeshStandardMaterial());
    boat.add(obstacle);
    expect(placement.update()).toBe(false);
    obstacle.visible = false;
    expect(placement.update()).toBe(true);
  });

  it('checks each instance of an event model at its actual position', () => {
    const { placement, cat, body, boat } = fixture();
    expect(placement.update()).toBe(true);
    const obstacle = new InstancedMesh(new BoxGeometry(0.6, 0.8, 0.6), new MeshStandardMaterial(), 1);
    const position = cat.position.clone().add(new Vector3(0, 0.3, 0));
    const instance = new Matrix4().makeTranslation(position);
    obstacle.setMatrixAt(0, instance);
    boat.add(obstacle);
    expect(placement.update()).toBe(true);
    const bounds = new Box3(new Vector3(-0.3, -0.4, -0.3), new Vector3(0.3, 0.4, 0.3)).applyMatrix4(instance);
    expect(new Box3().setFromObject(body, true).intersectsBox(bounds)).toBe(false);
  });
});

it('keeps the production cat visible and seated while the feeding can moves through the world', async () => {
  const production = await productionModels();
  const models = createTestPropModels();
  vi.spyOn(models, 'createPresentation').mockImplementation(production.createPresentation.bind(production));
  vi.spyOn(models, 'create').mockImplementation(production.create.bind(production));
  const items = ITEM_IDS.map(type => ({ type, instanceId: `${type}-1` as const }));
  const session = new SurvivalSession(items, { seed: 42, initial: { food: 8 }, initialCarlitos: { hunger: 3 } });
  const camera = new PerspectiveCamera(80, 16 / 9, 0.05, 100);
  const world = new BoatWorld(camera, models, ...createTestSkyTextures(), items);
  try {
    world.syncInventory(session.snapshot());
    world.update(0.016, 0.016);
    const cat = world.scene.getObjectByName('carlitos-companion')!;
    const model = world.scene.getObjectByName('carlitos-model')!;
    const seats = new Set<string>();
    const feed = world.playCarlitosAction('feedCarlitos');
    for (let frame = 0; frame < 180; frame++) {
      world.update(frame / 30, 1 / 30);
      expect(cat.visible, `feeding frame ${frame}`).toBe(true);
      expectInView(model, camera);
      seats.add(cat.userData.seatId);
    }
    await feed;
    expect(seats.size).toBe(1);
  } finally { world.dispose(); models.dispose(); production.dispose(); }
});

async function productionModels(): Promise<PropModelLibrary> {
  const templates = new Map<ItemId, Group>();
  const animations = new Map<ItemId, readonly AnimationClip[]>();
  await Promise.all(ITEM_IDS.map(async id => {
    const bytes = await readFile(`src/assets/models/items/${id}.glb`);
    const data = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(data).set(bytes);
    const gltf = await new GLTFLoader().register(() => ({
      name: 'test-materials', loadMaterial: async () => new MeshStandardMaterial(),
    })).parseAsync(data, '');
    normalizeLongestDimensionTemplate(gltf.scene, ITEM_MODEL_SPECS[id], message => new Error(message));
    templates.set(id, new Group().add(gltf.scene));
    animations.set(id, gltf.animations);
  }));
  return PropModelLibrary.fromTemplatesForTest(templates, new Map(), new Map(), animations);
}

function addFullInventory(boat: Group, models: PropModelLibrary): void {
  for (const id of ITEM_IDS) {
    if (id === 'carlitos') continue;
    const count = id === 'baitTin' || id === 'cannedFood' ? 8 : 1;
    for (let index = 0; index < count; index++) {
      const root = new Group();
      const transform = boatSupplyTransform(id, index);
      root.position.copy(transform.position);
      root.rotation.copy(transform.rotation);
      root.scale.setScalar(transform.scale);
      root.add(models.create({ type: id, instanceId: `${id}-${index + 1}` }));
      boat.add(root);
    }
  }
}

async function productionChest(): Promise<ChestDisplay> {
  const bytes = await readFile('src/assets/models/events/mysteryChest.glb');
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  const gltf = await new GLTFLoader().register(() => ({
    name: 'test-materials', loadMaterial: async () => new MeshStandardMaterial(),
  })).parseAsync(data, '');
  normalizeLongestDimensionTemplate(gltf.scene, EVENT_MODEL_SPECS.chestClosed, message => new Error(message));
  const chest = new ChestDisplay(new Group().add(gltf.scene));
  chest.sync({ state: 'closed', acquiredDay: 1 });
  return chest;
}

it('keeps the production animated cat visible with every item aboard through care and status poses', async () => {
  const models = await productionModels();
  const { scene, boat, camera, cat: dummy } = fixture();
  dummy.removeFromParent();
  addFullInventory(boat, models);
  const chest = await productionChest();
  boat.add(chest.root);
  const cat = new CarlitosPresentation(models);
  boat.add(cat.root);
  const placement = new CarlitosSeatPlacement(cat.root, cat.modelRoot, boat, scene, camera);
  try {
    const selected = new Set<string>();
    for (const aspect of [16 / 9, 4 / 3, 9 / 16]) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      for (const status of [
        {}, { rest: 'tired' as const }, { rest: 'exhausted' as const },
        { hunger: 0 }, { hunger: 3 }, { unhappiness: 8 },
      ]) {
        cat.sync(createCarlitosState(status));
        for (let seed = 0; seed < 32; seed++) {
          placement.setPreference(seed % 2 === 0 ? 1 : -1, seed);
          cat.update(0.17);
          expect(placement.update(), `aspect ${aspect}, status ${JSON.stringify(status)}, seed ${seed}`).toBe(true);
          expectInView(cat.modelRoot, camera);
          selected.add(cat.root.userData.seatId);
        }
      }
      for (const action of ['pet', 'feed'] as const) {
        const done = cat.play(action);
        for (let frame = 0; frame < 40; frame++) {
          cat.update(0.1);
          expect(placement.update(), `${action} frame ${frame}, aspect ${aspect}`).toBe(true);
          expectInView(cat.modelRoot, camera);
        }
        await done;
      }
    }
    expect(selected.size).toBeGreaterThan(4);
    for (const { rear, state } of [
      { rear: false, state: 'closed' }, { rear: true, state: 'closed' }, { rear: true, state: 'mimic' },
    ] as const) {
      chest.sync({ state, acquiredDay: 1 });
      for (const aspect of [16 / 9, 9 / 16]) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
        camera.rotation.set(0, rear ? Math.PI : 0, 0);
        if (rear) camera.rotateX(-0.75);
        for (let frame = 0; frame < 48; frame++) {
          boat.position.y = Math.sin(frame / 8) * 0.12;
          boat.rotation.set(Math.sin(frame / 9) * 0.055, 0, Math.sin(frame / 7) * 0.06);
          cat.update(0.1);
          expect(placement.update(), `rear ${rear}, aspect ${aspect}, frame ${frame}`).toBe(true);
          expectInView(cat.modelRoot, camera);
        }
      }
    }
  } finally {
    cat.dispose();
    chest.dispose();
    models.dispose();
  }
}, 30_000);

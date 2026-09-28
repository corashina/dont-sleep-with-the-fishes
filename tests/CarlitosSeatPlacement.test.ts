// Importance: 95/100. Prevents companion clipping and inaccessible off-screen seats.
import { readFile } from 'node:fs/promises';
import { AnimationClip, Box3, BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera, Raycaster, Scene, Texture, Vector3 } from 'three';
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
import { LIFEBOAT_EQUIPMENT_IDS, LIFEBOAT_EQUIPMENT_MODEL_SPECS } from '../src/world/lifeboatEquipmentManifest';
import { PRACTICAL_LIGHT_MODEL_IDS, PRACTICAL_LIGHT_MODEL_SPECS } from '../src/world/practicalLightModelManifest';
import type { RuntimeModelSpec } from '../src/world/itemModelManifest';
import { normalizeLongestDimensionTemplate } from '../src/world/modelValidation';
import { PropModelLibrary } from '../src/world/PropModelLibrary';
import { createLifeboat, lifeboatHullHalfWidthAt } from '../src/world/Lifeboat';
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
  it('rejects a turn with a blocked middle even when both endpoint poses are clear', () => {
    const { placement, cat, body, boat, camera } = fixture();
    body.geometry.dispose();
    body.geometry = new BoxGeometry(0.12, 0.56, 0.9);
    for (let step = 0; step < 30; step++) {
      expect(placement.cycleFrontSeat(1)).toBe(true);
      if (cat.position.z < -2.5) break;
    }
    const seat = placement.currentSeatId;
    const from = cat.quaternion.clone();
    const target = Math.atan2(cat.position.x - camera.position.x, cat.position.z - camera.position.z);
    const current = Math.atan2(2 * from.w * from.y, 1 - 2 * from.y * from.y);
    const arc = Math.atan2(Math.sin(target - current), Math.cos(target - current));
    const obstacle = new Mesh(new BoxGeometry(0.04, 0.08, 0.04), new MeshStandardMaterial());
    obstacle.position.set(0, 0, -0.4).applyQuaternion(from)
      .applyAxisAngle(new Vector3(0, 1, 0), arc / 2).add(cat.position);
    obstacle.position.y += 0.3;
    boat.add(obstacle);
    const obstacleBounds = new Box3().setFromObject(obstacle);
    expect(new Box3().setFromObject(body, true).intersectsBox(obstacleBounds)).toBe(false);
    cat.rotation.y = target;
    expect(new Box3().setFromObject(body, true).intersectsBox(obstacleBounds)).toBe(false);
    cat.quaternion.copy(from);
    placement.setInteracting(true);
    expect(placement.update(1 / 60)).toBe(true);
    expect(placement.currentSeatId).not.toBe(seat);
    expect(new Box3().setFromObject(body, true).intersectsBox(obstacleBounds)).toBe(false);
  });

  // Importance: 95/100. Care must face the player without snapping or crossing solid models.
  it('uses distance for resting direction, then turns smoothly toward the player and back', async () => {
    const { placement, cat, body, camera } = fixture();
    const bands = new Set<string>();
    for (let step = 0; step < 30; step++) {
      expect(placement.cycleFrontSeat(1)).toBe(true);
      const distance = Math.hypot(cat.position.x - camera.position.x, cat.position.z - camera.position.z);
      const forward = new Vector3(0, 0, -1).applyQuaternion(cat.quaternion);
      const towardPlayer = camera.position.clone().sub(cat.position).setY(0).normalize();
      if (distance < 3.15) {
        bands.add('near');
        expect(forward.dot(towardPlayer)).toBeGreaterThan(0.999);
      } else if (distance < 3.65) {
        bands.add('middle');
        expect(forward.z).toBeCloseTo(1);
      } else {
        bands.add('far');
        expect(forward.dot(cat.position.clone().setY(0).normalize())).toBeGreaterThan(0.999);
      }
    }
    expect([...bands].sort()).toEqual(['far', 'middle', 'near']);
    for (let step = 0; step < 30 && cat.position.z > -2.4; step++) placement.cycleFrontSeat(1);
    const resting = cat.quaternion.clone();
    const seat = placement.currentSeatId;
    placement.setInteracting(true);
    const ready = placement.waitUntilFacingPlayer();
    for (let frame = 0; frame < 90; frame++) {
      const before = cat.quaternion.clone();
      expect(placement.update(1 / 60)).toBe(true);
      expect(cat.quaternion.angleTo(before)).toBeLessThan(0.5);
      expectInView(body, camera);
    }
    expect(await ready).toBe(true);
    expect(placement.currentSeatId).toBe(seat);
    const target = camera.position.clone().sub(cat.position).setY(0).normalize();
    expect(new Vector3(0, 0, -1).applyQuaternion(cat.quaternion).dot(target)).toBeGreaterThan(0.999);
    placement.setInteracting(false);
    for (let frame = 0; frame < 90; frame++) expect(placement.update(1 / 60)).toBe(true);
    expect(cat.quaternion.angleTo(resting)).toBeLessThan(0.02);
  });

  it('cycles safe front seats in both directions and keeps the selected seat during updates', () => {
    const { placement, cat, body, boat, camera } = fixture();
    expect(placement.cycleFrontSeat(1)).toBe(true);
    const first = placement.currentSeatId;
    const seats = new Set<string>();
    do {
      const selected = placement.currentSeatId!;
      expect(seats.has(selected)).toBe(false);
      seats.add(selected);
      expect(cat.position.z).toBeLessThan(0);
      expect(selected).not.toBe('bow');
      expectInView(body, camera);
      expect(placement.update()).toBe(true);
      expect(placement.currentSeatId).toBe(selected);
      expect(placement.cycleFrontSeat(1)).toBe(true);
    } while (placement.currentSeatId !== first);
    expect(seats.size).toBeGreaterThan(2);
    expect(placement.cycleFrontSeat(-1)).toBe(true);
    expect(placement.currentSeatId).toBe([...seats].at(-1));
    expect(placement.cycleFrontSeat(1)).toBe(true);
    expect(placement.currentSeatId).toBe(first);

    const obstacle = new Mesh(new BoxGeometry(0.6, 0.8, 0.6), new MeshStandardMaterial());
    obstacle.position.copy(cat.position).add(new Vector3(0, 0.3, 0));
    boat.add(obstacle);
    for (let step = 0; step < seats.size; step++) {
      expect(placement.cycleFrontSeat(1)).toBe(true);
      expect(placement.currentSeatId).not.toBe(first);
      expect(new Box3().setFromObject(body, true).intersectsBox(new Box3().setFromObject(obstacle))).toBe(false);
      expectInView(body, camera);
    }
    obstacle.scale.setScalar(100);
    expect(placement.cycleFrontSeat(1)).toBe(false);
    expect(placement.currentSeatId).toBeNull();
    obstacle.visible = false;
    expect(placement.cycleFrontSeat(-1)).toBe(true);
  });

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
    const handoff = vi.fn();
    const feed = world.playCarlitosAction('feedCarlitos', handoff);
    for (let frame = 0; frame < 180; frame++) {
      world.update(frame / 30, 1 / 30);
      await Promise.resolve();
      expect(cat.visible, `feeding frame ${frame}`).toBe(true);
      expectInView(model, camera);
      seats.add(cat.userData.seatId);
    }
    await feed;
    expect(handoff).toHaveBeenCalledOnce();
    expect(seats.size).toBe(1);
  } finally { world.dispose(); models.dispose(); production.dispose(); }
}, 30_000);

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
  const equipment = new Map(await Promise.all(LIFEBOAT_EQUIPMENT_IDS.map(async id => [
    id, await productionTemplate(`items/${id}`, LIFEBOAT_EQUIPMENT_MODEL_SPECS[id]),
  ] as const)));
  const lights = new Map(await Promise.all(PRACTICAL_LIGHT_MODEL_IDS.map(async id => [
    id, await productionTemplate(`items/${id}`, PRACTICAL_LIGHT_MODEL_SPECS[id]),
  ] as const)));
  const chest = await productionTemplate('events/mysteryChest', EVENT_MODEL_SPECS.chestClosed);
  return PropModelLibrary.fromTemplatesForTest(templates, equipment, lights, animations, new Map([['chestClosed', chest]]));
}

// Importance: 95/100. The real sitting pose needs rear support after the inward adjustment.
it('moves rim seats inside the hull edge and supports the rear at the near seats', async () => {
  const models = await productionModels();
  const { scene, boat, camera, cat: dummy } = fixture();
  dummy.removeFromParent();
  const cat = new CarlitosPresentation(models);
  boat.add(cat.root);
  cat.sync(createCarlitosState({}));
  cat.update(0.17);
  const placement = new CarlitosSeatPlacement(cat.root, cat.modelRoot, boat, scene, camera);
  try {
    const visited = new Set<string>();
    const supportedNearSeats = new Set<string>();
    while (placement.cycleFrontSeat(1) && !visited.has(placement.currentSeatId!)) {
      const id = placement.currentSeatId!;
      visited.add(id);
      expectInView(cat.modelRoot, camera);
      if (/^rim--?\d/.test(id)) {
        expect(Math.abs(cat.root.position.x)).toBeLessThan(lifeboatHullHalfWidthAt(cat.root.position.z)!);
      }
      if (!id.startsWith('rim-near-')) continue;
      for (const name of ['PawL_32', 'PawR_35', 'Butt_12']) {
        const joint = cat.modelRoot.getObjectByName(name)!;
        const origin = joint.getWorldPosition(new Vector3());
        origin.y = 0.6;
        const hits = new Raycaster(origin, new Vector3(0, -1, 0), 0, 0.16).intersectObject(boat, true);
        expect(hits.some(hit => hit.object.name === 'lifeboat-outer-gunwale'), `${id}: ${name}`).toBe(true);
      }
      supportedNearSeats.add(id);
    }
    expect(supportedNearSeats.size).toBe(2);
    expect(visited.size).toBeGreaterThan(4);
  } finally { cat.dispose(); models.dispose(); }
});

async function productionTemplate(path: string, spec: RuntimeModelSpec): Promise<Group> {
  const bytes = await readFile(`src/assets/models/${path}.glb`);
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  const gltf = await new GLTFLoader().register(() => ({
    name: 'test-materials', loadMaterial: async () => new MeshStandardMaterial(),
  })).parseAsync(data, '');
  normalizeLongestDimensionTemplate(gltf.scene, spec, message => new Error(message));
  return new Group().add(gltf.scene);
}

it.each([16 / 9, 9 / 16])('keeps Carlitos visible after turning to the acquired chest at aspect %s', async aspect => {
  const models = await productionModels();
  const items = ITEM_IDS.map(type => ({ type, instanceId: `${type}-1` as const }));
  const session = new SurvivalSession(items, { seed: 2967098762, initial: { food: 3 }, initialCarlitos: { hunger: 3 } });
  const camera = new PerspectiveCamera(80, aspect, 0.05, 100);
  const world = new BoatWorld(camera, models, ...createTestSkyTextures(), items);
  try {
    world.syncInventory({ ...session.snapshot(), chest: { state: 'closed', acquiredDay: 11 } });
    world.setRearCameraView(true, true);
    for (let frame = 0; frame < 48; frame++) {
      world.update(frame / 15, 1 / 15);
      const cat = world.scene.getObjectByName('carlitos-companion')!;
      expect(cat.visible, `rear frame ${frame}, seat ${cat.userData.seatId}`).toBe(true);
      expectInView(world.scene.getObjectByName('carlitos-model')!, camera);
      const bounds = new Box3().setFromObject(world.scene.getObjectByName('carlitos-model')!, true);
      const head = bounds.getCenter(new Vector3());
      head.y = bounds.max.y - (bounds.max.y - bounds.min.y) * 0.15;
      const origin = camera.getWorldPosition(new Vector3());
      const ray = new Raycaster(origin, head.clone().sub(origin).normalize(), 0, origin.distanceTo(head));
      const chest = world.scene.getObjectByName('persistent-chest')!;
      expect(ray.intersectObject(chest, true), `chest hides head at ${cat.userData.seatId}`).toHaveLength(0);
    }
  } finally { world.dispose(); models.dispose(); }
}, 30_000);

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

function facePlayer(cat: CarlitosPresentation, placement: CarlitosSeatPlacement, camera: PerspectiveCamera): void {
  cat.setAttentive(true);
  placement.setInteracting(true);
  for (let frame = 0; frame < 60; frame++) {
    cat.update(1 / 60);
    expect(placement.update(1 / 60)).toBe(true);
    expectInView(cat.modelRoot, camera);
  }
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
        facePlayer(cat, placement, camera);
        const done = cat.play(action);
        for (let frame = 0; frame < 40; frame++) {
          cat.update(0.1);
          expect(placement.update(0.1), `${action} frame ${frame}, aspect ${aspect}`).toBe(true);
          expectInView(cat.modelRoot, camera);
          const towardPlayer = camera.position.clone().sub(cat.root.position).setY(0).normalize();
          const forward = new Vector3(0, 0, -1).applyQuaternion(cat.root.quaternion);
          expect(forward.dot(towardPlayer), `${action} must face the player`).toBeGreaterThan(0.999);
        }
        await done;
        placement.setInteracting(false);
        cat.setAttentive(false);
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
        camera.position.z = 0.96;
        if (rear) {
          camera.position.z = 0.18;
          camera.rotateX(-0.4);
        }
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

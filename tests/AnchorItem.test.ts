// Importance: 90/100. Protects mesh support and animation travel after moving the anchor.
import { readFile } from 'node:fs/promises';
import { Box3, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, PerspectiveCamera, Raycaster, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { EventItemUseAdapter } from '../src/survival/EventItemUseAdapter';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createEventItemUseSample, sampleEventItemOutcome, sampleEventItemUse } from '../src/survival/eventItemUseChoreography';
import { boatSupplyTransform } from '../src/world/BoatStorage';
import { createLifeboat, LIFEBOAT_FLOOR_SURFACE_Y, LIFEBOAT_GUNWALE_SURFACE_Y, lifeboatHullHalfWidthAt } from '../src/world/Lifeboat';
import { LifeboatAssets } from '../src/world/LifeboatAssets';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import { normalizeLongestDimensionTemplate } from '../src/world/modelValidation';
import { createTestPropModels } from './helpers/propModels';

function expectVisibleStarboardChain(effects: EventItemEffects, boat: Group, camera: PerspectiveCamera): void {
  const links = effects.root.getObjectByName('event-item-chain')!.children[0] as InstancedMesh;
  links.updateWorldMatrix(true, false);
  const matrix = new Matrix4();
  let visibleLinks = 0;
  for (let index = 0; index < links.count; index += 1) {
    links.getMatrixAt(index, matrix);
    const point = new Vector3().setFromMatrixPosition(matrix).applyMatrix4(links.matrixWorld);
    const projected = point.clone().project(camera);
    if (Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1
      && projected.z > -1 && projected.z < 1) visibleLinks += 1;
    expect(boat.worldToLocal(point).x).toBeGreaterThan(-0.05);
  }
  expect(visibleLinks).toBeGreaterThan(10);
}

it('supports the anchor on the floor and port hull beside the shotgun', async () => {
  const bytes = await readFile('src/assets/models/items/anchor.glb');
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  const { scene: model } = await new GLTFLoader().parseAsync(data, '');
  normalizeLongestDimensionTemplate(model, ITEM_MODEL_SPECS.anchor, (message) => new Error(message));
  const assets = LifeboatAssets.fromTextures(new Texture(), new Texture(), new Texture());
  const { root: boat } = createLifeboat(assets);
  const anchor = new Group();
  const pose = boatSupplyTransform('anchor', 0);
  anchor.position.copy(pose.position);
  anchor.rotation.copy(pose.rotation);
  anchor.scale.setScalar(pose.scale);
  anchor.add(model);
  boat.add(anchor);
  const hull = boat.getObjectByName('lifeboat-hull-planks')!;
  hull.traverse((object) => {
    if (object instanceof Mesh) for (const material of [object.material].flat()) material.side = DoubleSide;
  });
  boat.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(anchor, true);
  const ray = new Raycaster();
  ray.ray.direction.set(-1, 0, 0);
  let supportGap = Infinity;
  let contactHeight = -Infinity;
  try {
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const vertices = object.geometry.getAttribute('position');
      for (let index = 0; index < vertices.count; index += 1) {
        const vertex = new Vector3().fromBufferAttribute(vertices, index).applyMatrix4(object.matrixWorld);
        ray.ray.origin.set(0, vertex.y, vertex.z);
        const hit = ray.intersectObject(hull, true)[0]!;
        const gap = vertex.x - hit.point.x;
        expect(gap).toBeGreaterThanOrEqual(-0.001);
        if (gap < supportGap) {
          supportGap = gap;
          contactHeight = vertex.y;
        }
      }
    });
    expect(bounds.min.y).toBeCloseTo(LIFEBOAT_FLOOR_SURFACE_Y, 5);
    expect(supportGap).toBeLessThan(0.005);
    expect(contactHeight).toBeGreaterThan(bounds.max.y - 0.05);
    const shotgun = boatSupplyTransform('shotgun', 0);
    expect(pose.position.distanceTo(shotgun.position)).toBeLessThan(0.4);
    const shotgunBounds = new Box3(new Vector3(...ITEM_MODEL_SPECS.shotgun.normalizedBounds.min),
      new Vector3(...ITEM_MODEL_SPECS.shotgun.normalizedBounds.max));
    const shotgunRoot = new Group();
    shotgunRoot.position.copy(shotgun.position);
    shotgunRoot.rotation.copy(shotgun.rotation);
    shotgunRoot.scale.setScalar(shotgun.scale);
    shotgunRoot.updateMatrixWorld(true);
    expect(bounds.intersectsBox(shotgunBounds.applyMatrix4(shotgunRoot.matrixWorld))).toBe(false);
  } finally {
    boat.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      for (const material of [object.material].flat()) material.dispose();
    });
    assets.dispose();
  }
});

it.each(['anchor-drop'] as const)(
  'starts and returns %s at the leaning anchor pose and casts outside the starboard hull', (context) => {
    const models = createTestPropModels();
    const boat = new Group();
    boat.position.set(3, 0.12, -2);
    boat.rotation.set(0.04, 0.35, -0.03);
    const camera = new PerspectiveCamera(80, 16 / 9, 0.08, 220);
    camera.position.set(0, 0.88, 0.96);
    camera.lookAt(0, 0.88, -1.55);
    boat.add(camera);
    const saved = [{ instanceId: 'anchor-1', type: 'anchor' }] as const;
    const supplies = new BoatSupplyDisplay(models, boat, saved);
    supplies.sync(new SurvivalSession(saved, { seed: 1 }).snapshot());
    const actor = supplies.borrowEventActor('anchor-1')!;
    const storedPosition = actor.root.position.clone();
    const storedQuaternion = actor.root.quaternion.clone();
    const effects = new EventItemEffects();
    const adapter = new EventItemUseAdapter(camera, effects);
    const sample = createEventItemUseSample();
    try {
      adapter.begin(actor, 'anchor', null);
      sampleEventItemUse(context, 'anchor', 0, sample);
      adapter.apply(sample);
      expect(actor.root.position.distanceTo(storedPosition)).toBeLessThan(1e-6);
      expect(actor.root.quaternion.angleTo(storedQuaternion)).toBeLessThan(1e-6);
      for (let frame = 1; frame <= 100; frame += 1) {
        sampleEventItemUse(context, 'anchor', frame / 100, sample);
        // Tornado keeps the player's camera fixed while the anchor is thrown.
        if (context === 'anchor-drop') {
          sample.cameraYaw = 0;
          sample.cameraPitch = 0;
        }
        adapter.apply(sample);
        if (context === 'anchor-drop' && sample.targetBlend > 0 && sample.targetBlend < 1) {
          const hullWidth = lifeboatHullHalfWidthAt(actor.root.position.z)!;
          if (Math.abs(actor.root.position.x - hullWidth) < 0.2) {
            expect(actor.root.position.y).toBeGreaterThan(LIFEBOAT_GUNWALE_SURFACE_Y + 0.2);
          }
        }
      }
      if (context === 'anchor-drop') {
        expect(actor.root.position.x).toBeGreaterThan(lifeboatHullHalfWidthAt(actor.root.position.z)! + 0.3);
        expect(actor.root.getWorldPosition(new Vector3()).y).toBeCloseTo(0.04);
        expect(actor.root.visible).toBe(false);
        expectVisibleStarboardChain(effects, boat, camera);
      }
      for (let frame = 0; frame <= 100; frame += 1) {
        sampleEventItemOutcome(context, 'anchor', 'recover', frame / 100, sample);
        adapter.apply(sample);
        if (context === 'anchor-drop') {
          expect(actor.root.visible).toBe(false);
          expect(actor.root.position.x).toBeGreaterThan(lifeboatHullHalfWidthAt(actor.root.position.z)!);
          expect(effects.root.getObjectByName('event-item-chain')!.visible).toBe(true);
        }
      }
      adapter.clear();
      expect(actor.root.position.distanceTo(storedPosition)).toBeLessThan(1e-6);
      expect(actor.root.quaternion.angleTo(storedQuaternion)).toBeLessThan(1e-6);
      actor.release();
      expect(supplies.recordFor('anchor')!.root.visible).toBe(true);
    } finally {
      adapter.dispose();
      effects.dispose();
      supplies.dispose();
      models.dispose();
    }
  },
);

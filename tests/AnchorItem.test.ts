// Importance: 90/100. Protects mesh support and animation travel after moving the anchor.
import { readFile } from 'node:fs/promises';
import { Box3, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, PerspectiveCamera, Quaternion, Raycaster, Texture, Vector3 } from 'three';
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
import { LIFEBOAT_EQUIPMENT_MODEL_SPECS } from '../src/world/lifeboatEquipmentManifest';
import { createSleepPillow } from '../src/survival/SleepPillow';
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

function chainLinkPositions(effects: EventItemEffects): Vector3[] {
  const links = effects.root.getObjectByName('event-item-chain-links') as InstancedMesh;
  links.updateWorldMatrix(true, false);
  const matrix = new Matrix4();
  return Array.from({ length: links.count }, (_, index) => {
    links.getMatrixAt(index, matrix);
    return new Vector3().setFromMatrixPosition(matrix).applyMatrix4(links.matrixWorld);
  });
}

// Importance: 95/100. The visible chain must clear the pillow throughout deployment.
it('routes the chain in front of the pillow', () => {
  const boat = new Group();
  const actor = new Group();
  actor.position.set(2.1, 0.04, -0.85);
  boat.add(actor);
  const pillow = createSleepPillow(new Group());
  pillow.root.updateMatrixWorld(true);
  const bounds = LIFEBOAT_EQUIPMENT_MODEL_SPECS.pillow.normalizedBounds;
  const clearance = new Box3(new Vector3(...bounds.min), new Vector3(...bounds.max))
    .applyMatrix4(pillow.root.matrixWorld).expandByScalar(0.04);
  const effects = new EventItemEffects();
  const sample = createEventItemUseSample();
  try {
    sampleEventItemUse('anchor-drop', 'anchor', 1, sample);
    effects.apply(sample, actor, false);
    for (const point of chainLinkPositions(effects)) {
      expect(clearance.containsPoint(point)).toBe(false);
    }
  } finally {
    effects.dispose();
    pillow.dispose();
  }
});

// Importance: 95/100. A rolling boat must not expose an upward chain tail above the gunwale.
it('keeps the deployed outer chain descending into the sea during boat roll', () => {
  const boat = new Group();
  const actor = new Group();
  actor.position.set(2.1, 0.04, -0.85);
  boat.add(actor);
  const effects = new EventItemEffects();
  const sample = createEventItemUseSample();
  sampleEventItemUse('anchor-drop', 'anchor', 1, sample);
  try {
    effects.apply(sample, actor, false);
    for (const roll of [0, -0.6, 0.6]) {
      boat.rotation.z = roll;
      boat.position.y = -0.35;
      effects.apply(sample, actor, false);
      const points = chainLinkPositions(effects);
      const edge = boat.localToWorld(new Vector3(
        lifeboatHullHalfWidthAt(-0.85)!, LIFEBOAT_GUNWALE_SURFACE_Y + 0.035, -0.85,
      ));
      let edgeIndex = 0;
      for (let index = 1; index < points.length; index += 1) {
        if (points[index]!.distanceToSquared(edge) < points[edgeIndex]!.distanceToSquared(edge)) edgeIndex = index;
      }
      expect(points.at(-1)!.y).toBeLessThan(-1.5);
      for (let index = edgeIndex + 2; index < points.length; index += 1) {
        expect(points[index]!.y).toBeLessThanOrEqual(points[index - 1]!.y + 1e-6);
      }
    }
  } finally {
    effects.dispose();
  }
});

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
    // The shotgun moved 0.12 m toward the bow; keep both items within 0.45 m.
    expect(pose.position.distanceTo(shotgun.position)).toBeLessThan(0.45);
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

// Importance: 95/100. Camera and boat motion must not steer an airborne anchor.
it('keeps the released anchor on its world path while the camera and boat move', () => {
  const models = createTestPropModels();
  const boat = new Group();
  const cameraRig = new Group();
  const camera = new PerspectiveCamera(80, 16 / 9, 0.08, 220);
  camera.position.set(0, 0.88, 0.96);
  camera.lookAt(0, 0.88, -1.55);
  cameraRig.add(camera);
  boat.add(cameraRig);
  const saved = [{ instanceId: 'anchor-1', type: 'anchor' }] as const;
  const supplies = new BoatSupplyDisplay(models, boat, saved);
  supplies.sync(new SurvivalSession(saved, { seed: 1 }).snapshot());
  const actor = supplies.borrowEventActor('anchor-1')!;
  const effects = new EventItemEffects();
  const adapter = new EventItemUseAdapter(camera, effects);
  const sample = createEventItemUseSample();
  const expectedPositions: Vector3[] = [];
  const landedChainPosition = new Vector3();
  const linkMatrix = new Matrix4();
  try {
    for (const moving of [false, true]) {
      adapter.begin(actor, 'anchor', null);
      for (let frame = 0; frame <= 140; frame += 1) {
        if (moving && frame >= 60) {
          cameraRig.rotation.y = Math.sin(frame * 0.4) * 0.12;
          boat.position.x = Math.sin(frame * 0.3) * 0.08;
          boat.rotation.z = Math.sin(frame * 0.2) * 0.04;
        }
        sampleEventItemUse('anchor-drop', 'anchor', frame / 100, sample);
        adapter.apply(sample);
        const position = actor.root.getWorldPosition(new Vector3());
        if (moving) {
          expect(position.distanceTo(expectedPositions[frame]!)).toBeLessThan(1e-6);
        } else {
          expectedPositions.push(position);
        }
        if (frame >= 100) {
          const links = effects.root.getObjectByName('event-item-chain-links') as InstancedMesh;
          links.updateWorldMatrix(true, false);
          links.getMatrixAt(links.count - 1, linkMatrix);
          const chainEnd = new Vector3().setFromMatrixPosition(linkMatrix).applyMatrix4(links.matrixWorld);
          if (frame > 100) {
            expect(chainEnd.distanceTo(landedChainPosition)).toBeLessThan(1e-6);
          } else {
            landedChainPosition.copy(chainEnd);
          }
        }
      }
      adapter.clear();
    }
  } finally {
    adapter.dispose();
    supplies.dispose();
    models.dispose();
  }
});

// Importance: 95/100. Small boat motion must not shift or turn the whole deployed chain abruptly.
it.each([60])('keeps deployed chain links smooth at %i fps', (fps) => {
  const boat = new Group();
  const actor = new Group();
  boat.add(actor);
  const effects = new EventItemEffects();
  const sample = createEventItemUseSample();
  sampleEventItemUse('anchor-drop', 'anchor', 1, sample);
  const water = new Vector3(2.1, 0.04, -0.85);
  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const previousPositions: Vector3[] = [];
  const previousRotations: Quaternion[] = [];
  const previousLink = new Vector3();
  let deployedCount = 0;
  let deployedLength = 0;
  let maximumStep = 0;
  let maximumTurn = 0;
  let maximumStretch = 0;
  try {
    for (let frame = 0; frame <= fps * 20; frame += 1) {
      const time = frame / fps;
      boat.position.x = Math.sin(time / 2) * 0.08;
      boat.updateMatrixWorld(true);
      actor.position.copy(water);
      boat.worldToLocal(actor.position);
      effects.apply(sample, actor, false);
      const links = effects.root.getObjectByName('event-item-chain-links') as InstancedMesh;
      links.updateWorldMatrix(true, false);
      if (frame === 0) deployedCount = links.count;
      let length = 0;
      for (let index = 0; index < Math.min(deployedCount, links.count); index += 1) {
        links.getMatrixAt(index, matrix);
        matrix.premultiply(links.matrixWorld).decompose(position, rotation, scale);
        if (index > 0) length += position.distanceTo(previousLink);
        previousLink.copy(position);
        if (frame === 0) {
          previousPositions.push(position.clone());
          previousRotations.push(rotation.clone());
        } else {
          maximumStep = Math.max(maximumStep, position.distanceTo(previousPositions[index]!));
          maximumTurn = Math.max(maximumTurn, rotation.angleTo(previousRotations[index]!));
          previousPositions[index]!.copy(position);
          previousRotations[index]!.copy(rotation);
        }
      }
      expect(links.count).toBe(deployedCount);
      if (frame === 0) deployedLength = length;
      // Chords across the bend can vary slightly, but the chain must not stretch with the boat.
      maximumStretch = Math.max(maximumStretch, Math.abs(length - deployedLength));
    }
    expect(maximumStep).toBeLessThan(0.15 / fps);
    expect(maximumTurn).toBeLessThan(3 / fps);
    expect(maximumStretch).toBeLessThan(0.005);
    effects.clear();
    boat.position.set(0, 0, 0);
    actor.position.set(3, 0.04, -0.85);
    effects.apply(sample, actor, false);
    const replayedLinks = effects.root.getObjectByName('event-item-chain-links') as InstancedMesh;
    expect(replayedLinks.count).toBeGreaterThan(deployedCount);
  } finally {
    effects.dispose();
  }
});

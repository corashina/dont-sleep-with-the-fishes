import { readFile } from 'node:fs/promises';
import { Box3, Group, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it, vi } from 'vitest';
import type { BoatSupplyDisplay, BorrowedSupplyActor } from '../src/survival/BoatSupplyDisplay';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { EventItemUseAdapter } from '../src/survival/EventItemUseAdapter';
import { EventItemUseController } from '../src/survival/EventItemUseController';
import { eventItemUseDuration, resolveEventItemUseContext } from '../src/survival/eventItemUseChoreography';
import { boatSupplyTransform } from '../src/world/BoatStorage';
import { LIFEBOAT_GUNWALE_SURFACE_Y, lifeboatHullHalfWidthAt } from '../src/world/Lifeboat';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import { normalizeLongestDimensionTemplate } from '../src/world/modelValidation';

// Importance: 95/100. Covers the reported wrong landing and camera movement.
it('throws the production ring clear of the hull without turning the camera, then keeps it afloat', async () => {
  const bytes = await readFile('src/assets/models/items/swimRing.glb');
  const data = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(data).set(bytes);
  const { scene: model } = await new GLTFLoader().parseAsync(data, '');
  normalizeLongestDimensionTemplate(model, ITEM_MODEL_SPECS.swimRing, (message) => new Error(message));
  const boat = new Group();
  const root = new Group();
  root.add(model);
  boat.add(root);
  const storage = boatSupplyTransform('swimRing', 0);
  root.position.copy(storage.position);
  root.rotation.copy(storage.rotation);
  root.scale.setScalar(storage.scale);
  const actor: BorrowedSupplyActor = {
    instanceId: 'swimRing-1', root,
    applyPose: (pose) => {
      root.position.copy(storage.position).add(new Vector3(pose.x, pose.y, pose.z));
      root.rotation.copy(storage.rotation);
      root.rotateY(pose.yaw).rotateX(pose.pitch).rotateZ(pose.roll);
      root.scale.set(pose.scaleX, pose.scaleY, pose.scaleZ).multiplyScalar(storage.scale);
    },
    release: vi.fn(), releaseOnNextSync: vi.fn(),
  };
  const supplies = {
    borrowEventActor: vi.fn(() => actor), stowEventItemUntilDay: vi.fn(),
  } as unknown as BoatSupplyDisplay;
  const camera = new PerspectiveCamera(80, 16 / 9, 0.08, 220);
  camera.position.set(0, 0.88, 0.96);
  camera.rotation.set(-0.08, 0.1, 0);
  boat.add(camera);
  const cameraPosition = camera.position.clone();
  const cameraRotation = camera.quaternion.clone();
  const adapter = new EventItemUseAdapter(camera, new EventItemEffects());
  const controller = new EventItemUseController(supplies, adapter);
  const context = resolveEventItemUseContext('restless-waves', 'swimRing', 'swimRing')!;
  const use = controller.play({
    eventId: 'restless-waves', choiceId: 'swimRing', itemId: 'swimRing',
    instanceId: actor.instanceId, context, aimTarget: new Group(),
  });
  const duration = eventItemUseDuration(context);
  let crossedRail = false;
  try {
    for (let frame = 1; frame <= 100; frame += 1) {
      controller.update(duration / 100);
      expect(camera.position.distanceTo(cameraPosition)).toBeLessThan(1e-7);
      expect(camera.quaternion.angleTo(cameraRotation)).toBeLessThan(1e-7);
      const hullWidth = lifeboatHullHalfWidthAt(root.position.z);
      const bounds = new Box3().setFromObject(root, true);
      if (hullWidth !== null && bounds.max.x >= hullWidth && bounds.min.x <= hullWidth) {
        expect(bounds.min.y).toBeGreaterThan(LIFEBOAT_GUNWALE_SURFACE_Y);
        crossedRail = true;
      }
    }
    controller.update(0.01);
    await use;
    expect(crossedRail).toBe(true);
    const bounds = new Box3().setFromObject(root, true);
    expect(bounds.min.x).toBeGreaterThan(lifeboatHullHalfWidthAt(root.position.z)!);
    expect(root.position.y).toBeCloseTo(0.04);
    expect(bounds.max.y - bounds.min.y).toBeLessThan(0.12);
    expect(root.visible).toBe(true);
    const landed = root.position.clone();
    await controller.react({
      outcome: { accepted: true, code: 'event-resolved', message: 'Done.', deltas: {}, cue: 'none' },
      resourceDeltas: {}, gainedInstanceIds: [], brokenInstanceIds: [], lostInstanceIds: [],
      consumedInstanceIds: [actor.instanceId], selectedInstanceId: actor.instanceId,
      selectedCondition: 'usable', targetInstanceId: null,
    });
    controller.update(2);
    expect(root.position.distanceTo(landed)).toBeLessThan(1e-7);
    expect(actor.release).not.toHaveBeenCalled();
    expect(camera.quaternion.angleTo(cameraRotation)).toBeLessThan(1e-7);
    controller.clear('night');
    expect(actor.release).toHaveBeenCalledOnce();
    expect(camera.quaternion.angleTo(cameraRotation)).toBeLessThan(1e-7);
  } finally {
    controller.dispose();
    adapter.dispose();
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      for (const material of [object.material].flat()) material.dispose();
    });
  }
});

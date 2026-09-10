import { readFile } from 'node:fs/promises';
import { Group, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';
import type { BoatSupplyDisplay, BorrowedSupplyActor } from '../src/survival/BoatSupplyDisplay';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { EventItemUseAdapter } from '../src/survival/EventItemUseAdapter';
import { EventItemUseController } from '../src/survival/EventItemUseController';
import {
  eventItemUseDuration, resolveEventItemUseContext,
} from '../src/survival/eventItemUseChoreography';
import type { EventOutcomePresentation } from '../src/survival/eventPresentationTypes';
import { boatSupplyTransform } from '../src/world/BoatStorage';
import { ITEM_MODEL_SPECS } from '../src/world/itemModelManifest';
import { normalizeLongestDimensionTemplate } from '../src/world/modelValidation';

describe('swim ring wear presentation', () => {
  it('uses the wear motion for Bad Sleep and keeps the other ring actions', () => {
    expect(resolveEventItemUseContext('bad-sleep', 'swimRing', 'swimRing')).toBe('swim-ring-wear');
    expect(resolveEventItemUseContext('tornado', 'swimRing', 'swimRing')).toBe('throw-target');
    expect(resolveEventItemUseContext('handyman', 'swimRing', 'swimRing')).toBe('trade-handover');
  });

  it('lowers the production ring around the viewpoint and holds it until event cleanup', async () => {
    const bytes = await readFile('src/assets/models/items/swimRing.glb');
    const data = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(data).set(bytes);
    const { scene: model } = await new GLTFLoader().parseAsync(data, '');
    normalizeLongestDimensionTemplate(model, ITEM_MODEL_SPECS.swimRing, (message) => new Error(message));
    const root = new Group();
    root.add(model);
    const storage = boatSupplyTransform('swimRing', 0);
    root.position.copy(storage.position);
    root.rotation.copy(storage.rotation);
    const actor: BorrowedSupplyActor = {
      instanceId: 'swimRing-1',
      root,
      applyPose: (pose) => {
        root.position.copy(storage.position).add(new Vector3(pose.x, pose.y, pose.z));
        root.rotation.copy(storage.rotation);
        root.rotateY(pose.yaw).rotateX(pose.pitch).rotateZ(pose.roll);
        root.scale.set(pose.scaleX, pose.scaleY, pose.scaleZ).multiplyScalar(storage.scale);
      },
      release: vi.fn(),
      releaseOnNextSync: vi.fn(),
    };
    const supplies = {
      borrowEventActor: vi.fn(() => actor),
      stowEventItemUntilDay: vi.fn(),
    } as unknown as BoatSupplyDisplay;
    const camera = new PerspectiveCamera(80, 16 / 9, 0.08, 1000);
    camera.position.set(0, 0.88, 1.56);
    camera.rotation.set(-0.15, 0.3, 0.04);
    const adapter = new EventItemUseAdapter(camera, new EventItemEffects());
    const controller = new EventItemUseController(supplies, adapter);
    const use = controller.play({
      eventId: 'bad-sleep', choiceId: 'swimRing', itemId: 'swimRing',
      instanceId: actor.instanceId, context: 'swim-ring-wear', aimTarget: new Group(),
    });
    const duration = eventItemUseDuration('swim-ring-wear');
    const vertex = new Vector3();
    let previousY = Infinity;
    let overheadY = 0;
    let wornY = 0;
    for (let frame = 1; frame <= 100; frame += 1) {
      controller.update(duration / 100);
      if (frame < 54) continue;
      root.updateWorldMatrix(true, true);
      const center = camera.worldToLocal(root.getWorldPosition(new Vector3()));
      expect(center.x).toBeCloseTo(0);
      expect(center.z).toBeCloseTo(0);
      expect(center.y).toBeLessThanOrEqual(previousY + 1e-6);
      expect(root.visible).toBe(true);
      if (frame === 54) overheadY = center.y;
      wornY = center.y;
      previousY = center.y;
      // The real mesh must leave room for the head and torso along the descent axis.
      model.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const positions = object.geometry.getAttribute('position');
        for (let index = 0; index < positions.count; index += 1) {
          vertex.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
          camera.worldToLocal(vertex);
          expect(Math.hypot(vertex.x, vertex.z)).toBeGreaterThan(0.28);
        }
      });
    }
    controller.update(0.01);
    await use;
    expect(overheadY).toBeGreaterThan(0.5);
    expect(wornY).toBeLessThan(-0.5);
    const wornPosition = root.position.clone();
    const result: EventOutcomePresentation = {
      outcome: { accepted: true, code: 'event-resolved', message: 'Done.', deltas: {}, cue: 'none' },
      resourceDeltas: {}, gainedInstanceIds: [], brokenInstanceIds: [], lostInstanceIds: [],
      consumedInstanceIds: [actor.instanceId], selectedInstanceId: actor.instanceId,
      selectedCondition: 'usable', targetInstanceId: null,
    };
    await controller.react(result);
    controller.update(10);
    expect(root.position.distanceTo(wornPosition)).toBeLessThan(1e-6);
    expect(root.visible).toBe(true);
    expect(actor.release).not.toHaveBeenCalled();
    controller.clear('night');
    expect(actor.release).toHaveBeenCalledOnce();
    adapter.dispose();
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    });
  });
});

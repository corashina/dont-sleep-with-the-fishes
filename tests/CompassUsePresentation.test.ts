import { describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { ItemInstanceId } from '../src/game/ItemState';
import type { BorrowedSupplyActor } from '../src/survival/BoatSupplyDisplay';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { EventItemUseAdapter } from '../src/survival/EventItemUseAdapter';
import {
  createEventItemUseSample,
  sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';

describe('compass use presentation', () => {
  it('holds the compass centered and square to the camera', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(1.4, 2.1, -0.8);
    camera.rotation.set(-0.18, 0.42, 0);
    camera.updateWorldMatrix(true, false);
    const root = new Group();
    const actor: BorrowedSupplyActor = {
      instanceId: 'compass-1' as ItemInstanceId,
      root,
      applyPose: (pose) => {
        root.position.set(pose.x, pose.y, pose.z);
        root.rotation.set(0, 0, 0);
        root.rotateY(pose.yaw);
        root.rotateX(pose.pitch);
        root.rotateZ(pose.roll);
        root.scale.set(pose.scaleX, pose.scaleY, pose.scaleZ);
      },
      releaseOnNextSync: vi.fn(),
      release: vi.fn(),
    };
    const adapter = new EventItemUseAdapter(camera, new EventItemEffects());

    for (const progress of [0.42, 0.55, 0.77, 1]) {
      const sample = createEventItemUseSample();
      sampleEventItemUse('compass-search', 'compass', progress, sample);
      expect(sample.viewX).toBeCloseTo(0);
      expect(sample.viewY).toBeCloseTo(0);
      expect(sample.yaw).toBe(0);
      expect(sample.pitch).toBe(0);
      expect(sample.roll).toBe(0);
    }

    const sample = createEventItemUseSample();
    sampleEventItemUse('compass-search', 'compass', 0.55, sample);
    adapter.begin(actor, 'compass', null);
    adapter.apply(sample);
    root.updateWorldMatrix(true, false);

    const viewPosition = camera.worldToLocal(root.getWorldPosition(new Vector3()));
    expect(viewPosition.x).toBeCloseTo(0);
    expect(viewPosition.y).toBeCloseTo(0);
    const surfaceNormal = new Vector3(0, 0, 1)
      .applyQuaternion(root.getWorldQuaternion(new Quaternion()))
      .normalize();
    const cameraDirection = camera.getWorldPosition(new Vector3())
      .sub(root.getWorldPosition(new Vector3()))
      .normalize();
    expect(surfaceNormal.angleTo(cameraDirection)).toBeLessThan(1e-6);

    adapter.dispose();
  });
});

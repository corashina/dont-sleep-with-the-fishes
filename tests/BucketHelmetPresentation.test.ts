// Importance: 10/10. Protects full-view bucket coverage while the camera moves.
import { describe, expect, it, vi } from 'vitest';
import {
  Euler,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';
import type { ItemInstanceId } from '../src/game/ItemState';
import type { BorrowedSupplyActor } from '../src/survival/BoatSupplyDisplay';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import {
  BUCKET_HELMET_COVERAGE_NAME,
  EventItemUseAdapter,
} from '../src/survival/EventItemUseAdapter';
import {
  createEventItemUseSample,
  sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';

describe('bucket helmet presentation', () => {
  it('keeps the inverted bucket aligned with the moving camera', () => {
    const camera = new PerspectiveCamera(80, 2550 / 1251, 0.08, 1000);
    camera.position.set(0.4, 1.1, 2);
    camera.rotation.set(0.24, -0.38, 0.17, 'YXZ');
    camera.updateWorldMatrix(true, false);
    const root = new Group();
    const bucketMaterial = new MeshStandardMaterial();
    const bucketMesh = new Mesh(new BoxGeometry(1, 1, 1), bucketMaterial);
    root.add(bucketMesh);
    const actor: BorrowedSupplyActor = {
      instanceId: 'bucket-1' as ItemInstanceId,
      root,
      applyPose: (pose) => {
        root.position.set(pose.x, pose.y, pose.z);
        root.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
        root.scale.set(pose.scaleX, pose.scaleY, pose.scaleZ);
      },
      releaseOnNextSync: vi.fn(),
      release: vi.fn(),
    };
    const adapter = new EventItemUseAdapter(camera, new EventItemEffects());
    const sample = createEventItemUseSample();

    adapter.begin(actor, 'bucket', null, true, null, true);
    sampleEventItemUse('bucket-helmet', 'bucket', 1, sample);
    adapter.apply(sample);
    root.updateWorldMatrix(true, false);

    const expected = camera.getWorldQuaternion(new Quaternion()).multiply(
      new Quaternion().setFromEuler(new Euler(
        sample.pitch,
        sample.yaw,
        sample.roll,
        'YXZ',
      )),
    );
    const openingDirection = new Vector3(0, 1, 0).applyQuaternion(root.quaternion);
    const cameraDown = new Vector3(0, -1, 0).applyQuaternion(camera.quaternion);

    expect(root.getWorldQuaternion(new Quaternion()).angleTo(expected)).toBeLessThan(1e-6);
    expect(openingDirection.angleTo(cameraDown)).toBeLessThan(1e-6);
    expect(sample.viewY).toBeLessThan(0);
    expect(camera.getObjectByName(BUCKET_HELMET_COVERAGE_NAME)?.visible).toBe(true);

    adapter.dispose();
    expect(camera.getObjectByName(BUCKET_HELMET_COVERAGE_NAME)).toBeUndefined();
    bucketMesh.geometry.dispose();
    bucketMaterial.dispose();
  });
});

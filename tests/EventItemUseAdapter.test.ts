import { Group, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import type {
  BorrowedSupplyActor,
  SupplyAdditivePose,
} from '../src/survival/BoatSupplyDisplay';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { EventItemUseAdapter } from '../src/survival/EventItemUseAdapter';
import { createEventItemUseSample } from '../src/survival/eventItemUseChoreography';

function createActor(
  parent: Group,
  instanceId: ItemInstanceId,
  position: Vector3,
): { actor: BorrowedSupplyActor; release: ReturnType<typeof vi.fn> } {
  const root = new Group();
  root.position.copy(position);
  parent.add(root);
  const basePosition = position.clone();
  const release = vi.fn();
  const actor: BorrowedSupplyActor = {
    instanceId,
    root,
    applyPose: (pose: SupplyAdditivePose) => {
      root.position.set(
        basePosition.x + pose.x,
        basePosition.y + pose.y,
        basePosition.z + pose.z,
      );
      root.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
      root.scale.set(pose.scaleX, pose.scaleY, pose.scaleZ);
    },
    releaseOnNextSync: vi.fn(),
    release,
  };
  return { actor, release };
}

function expectVectorCloseTo(actual: Vector3, expected: Vector3): void {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
  expect(actual.z).toBeCloseTo(expected.z);
}

describe('EventItemUseAdapter', () => {
  it('holds actors at one camera-local point from distinct stored poses', () => {
    const scene = new Group();
    const cameraParent = new Group();
    cameraParent.position.set(3.2, -1.7, 4.6);
    cameraParent.rotation.set(0.18, -0.42, 0.09);
    const camera = new PerspectiveCamera(62, 1.6, 0.1, 100);
    camera.position.set(-0.36, 1.15, 0.48);
    camera.rotation.set(-0.08, 0.22, -0.04, 'YXZ');
    cameraParent.add(camera);
    scene.add(cameraParent);

    const actorParent = new Group();
    actorParent.position.set(-2.4, 0.73, 1.8);
    actorParent.rotation.set(-0.15, 0.31, -0.12);
    scene.add(actorParent);
    const first = createActor(
      actorParent,
      'flashlight-1' as ItemInstanceId,
      new Vector3(0.56, -0.32, 0.81),
    );
    const second = createActor(
      actorParent,
      'flashlight-2' as ItemInstanceId,
      new Vector3(-0.71, 0.48, -0.23),
    );
    const effects = new EventItemEffects();
    const adapter = new EventItemUseAdapter(camera, effects);
    const sample = createEventItemUseSample();
    sample.cameraSpaceBlend = 1;
    sample.viewX = 0.18;
    sample.viewY = -0.26;
    sample.viewZ = -0.94;
    sample.cameraYaw = 0.17;
    sample.cameraPitch = -0.09;

    const cameraPosition = camera.position.clone();
    adapter.begin(first.actor);
    adapter.apply(sample);
    const heldPoint = camera.localToWorld(new Vector3(
      sample.viewX,
      sample.viewY,
      sample.viewZ,
    ));
    expectVectorCloseTo(first.actor.root.getWorldPosition(new Vector3()), heldPoint);
    expect(camera.position).toEqual(cameraPosition);

    adapter.clear();
    adapter.begin(second.actor);
    adapter.apply(sample);
    expectVectorCloseTo(second.actor.root.getWorldPosition(new Vector3()), heldPoint);
    expect(camera.position).toEqual(cameraPosition);

    adapter.dispose();
  });

  it('restores the base field of view without releasing the caller actor', () => {
    const cameraParent = new Group();
    cameraParent.position.set(1.2, -0.7, 2.4);
    const camera = new PerspectiveCamera(64, 1.6, 0.1, 100);
    camera.position.set(-0.4, 0.9, 0.3);
    cameraParent.add(camera);
    const actorParent = new Group();
    actorParent.position.set(-1.8, 0.25, 0.6);
    const { actor, release } = createActor(
      actorParent,
      'flashlight-1' as ItemInstanceId,
      new Vector3(0.3, -0.2, 0.7),
    );
    const effects = new EventItemEffects();
    const adapter = new EventItemUseAdapter(camera, effects);
    const sample = createEventItemUseSample();
    sample.fovScale = 0.72;
    const updateProjectionMatrix = vi.spyOn(camera, 'updateProjectionMatrix');
    const cameraPosition = camera.position.clone();

    adapter.begin(actor);
    adapter.apply(sample);
    expect(camera.fov).toBeCloseTo(46.08);
    expect(camera.position).toEqual(cameraPosition);

    adapter.clear();
    expect(camera.fov).toBe(64);
    expect(camera.position).toEqual(cameraPosition);
    expect(release).not.toHaveBeenCalled();

    adapter.dispose();
    expect(camera.position).toEqual(cameraPosition);
    expect(release).not.toHaveBeenCalled();
    expect(updateProjectionMatrix).toHaveBeenCalledTimes(2);
  });
});

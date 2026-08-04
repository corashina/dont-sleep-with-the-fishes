import { Group, PerspectiveCamera, PointLight, Quaternion, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import type {
  BorrowedSupplyActor,
  SupplyAdditivePose,
} from '../src/survival/BoatSupplyDisplay';
import { EventItemEffects } from '../src/survival/EventItemEffects';
import { EventItemUseAdapter } from '../src/survival/EventItemUseAdapter';
import {
  createEventItemUseSample,
  type EventItemEffectKind,
} from '../src/survival/eventItemUseChoreography';

const EFFECT_KINDS: readonly EventItemEffectKind[] = [
  'none',
  'tape',
  'binocular-mask',
  'net',
  'bucket-cover',
  'flare',
  'chain',
  'umbrella',
  'flashlight',
  'shotgun-smoke',
];

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
  it('aims at moving targets and moves the action origin to a target', () => {
    const scene = new Group();
    const camera = new PerspectiveCamera(62, 1.6, 0.1, 100);
    camera.position.set(0.3, 2.1, 0.4);
    scene.add(camera);
    const actorParent = new Group();
    scene.add(actorParent);
    const { actor } = createActor(
      actorParent,
      'flashlight-1' as ItemInstanceId,
      new Vector3(0.2, -0.1, 0.5),
    );
    const aimTarget = new Group();
    aimTarget.position.set(2.4, 1.1, -4.8);
    scene.add(aimTarget);
    const effects = new EventItemEffects();
    const adapter = new EventItemUseAdapter(camera, effects);
    const sample = createEventItemUseSample();
    sample.cameraSpaceBlend = 1;
    sample.viewY = -0.45;
    sample.viewZ = -1.1;
    sample.aimBlend = 1;

    adapter.begin(actor, 'flashlight', aimTarget);
    adapter.apply(sample);
    expect(actor.root.getWorldPosition(new Vector3()).y)
      .toBeLessThan(camera.getWorldPosition(new Vector3()).y);
    expectAimAccuracy(actor, aimTarget);

    aimTarget.position.set(-1.8, 0.8, -3.6);
    adapter.apply(sample);
    expectAimAccuracy(actor, aimTarget);

    sample.targetBlend = 1;
    adapter.apply(sample);
    expectVectorCloseTo(
      actor.root.getWorldPosition(new Vector3()),
      aimTarget.getWorldPosition(new Vector3()),
    );

    adapter.dispose();
  });

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
    adapter.begin(first.actor, 'flashlight', null);
    adapter.apply(sample);
    const heldPoint = camera.localToWorld(new Vector3(
      sample.viewX,
      sample.viewY,
      sample.viewZ,
    ));
    expectVectorCloseTo(first.actor.root.getWorldPosition(new Vector3()), heldPoint);
    expect(camera.position).toEqual(cameraPosition);

    adapter.clear();
    adapter.begin(second.actor, 'flashlight', null);
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

    adapter.begin(actor, 'flashlight', null);
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

  it.each(EFFECT_KINDS)('restores camera and actor state after clearing %s', (effectKind) => {
    const cameraParent = new Group();
    const camera = new PerspectiveCamera(67, 1.6, 0.1, 100);
    camera.position.set(-0.45, 0.84, 0.31);
    camera.rotation.set(-0.12, 0.28, 0.04, 'YXZ');
    cameraParent.add(camera);
    const actorParent = new Group();
    const { actor, release } = createActor(
      actorParent,
      'flashlight-1' as ItemInstanceId,
      new Vector3(0.34, -0.18, 0.62),
    );
    const effects = new EventItemEffects();
    const adapter = new EventItemUseAdapter(camera, effects);
    const sample = createEventItemUseSample();
    sample.effectKind = effectKind;
    sample.cameraSpaceBlend = 1;
    sample.cameraYaw = 0.24;
    sample.cameraPitch = -0.16;
    sample.fovScale = 0.74;
    sample.primaryEffect = 0.8;
    sample.secondaryEffect = 0.6;
    const basePosition = camera.position.clone();
    const baseQuaternion = camera.quaternion.clone();

    adapter.begin(actor, 'flashlight', null);
    adapter.apply(sample);
    adapter.clear();

    expect(camera.position).toEqual(basePosition);
    expect(camera.quaternion.angleTo(baseQuaternion)).toBeCloseTo(0);
    expect(camera.fov).toBe(67);
    expect(actor.root.position).toEqual(new Vector3(0.34, -0.18, 0.62));
    expect(actor.root.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(actor.root.scale.toArray()).toEqual([1, 1, 1]);
    effects.root.children.forEach((effect) => expect(effect.visible).toBe(false));
    effects.root.traverse((object) => {
      if (object instanceof PointLight) expect(object.intensity).toBe(0);
    });
    expect(release).not.toHaveBeenCalled();

    adapter.dispose();
  });
});

function expectAimAccuracy(actor: BorrowedSupplyActor, aimTarget: Group): void {
  const origin = actor.root.getWorldPosition(new Vector3());
  const expected = aimTarget.getWorldPosition(new Vector3()).sub(origin).normalize();
  const actual = new Vector3(0, 0, -1)
    .applyQuaternion(actor.root.getWorldQuaternion(new Quaternion()))
    .normalize();
  expect(actual.dot(expected)).toBeGreaterThan(0.995);
}

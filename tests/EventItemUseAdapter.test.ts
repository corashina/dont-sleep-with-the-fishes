// Importance: 8/10 (scaled from 4/5). Protects event actor borrowing, aiming, restoration, and camera state.
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
  LIFEBOAT_GUNWALE_SURFACE_Y,
  lifeboatHullHalfWidthAt,
} from '../src/world/Lifeboat';
import {
  createEventItemUseSample,
  sampleEventItemUse,
  type EventItemEffectKind,
} from '../src/survival/eventItemUseChoreography';

const EFFECT_KINDS: readonly EventItemEffectKind[] = [
  'none',
  'tape',
  'binocular-mask',
  'bucket-cover',
  'flare',
  'chain',
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

  it('keeps the bucket visible while it clears the side and reaches water', () => {
    const scene = new Group();
    const camera = new PerspectiveCamera(62, 1.6, 0.1, 100);
    camera.position.set(0, 1.7, 2.4);
    camera.lookAt(0, 0.9, 0);
    scene.add(camera);
    const actorParent = new Group();
    scene.add(actorParent);
    const { actor } = createActor(
      actorParent,
      'bucket-1' as ItemInstanceId,
      new Vector3(0, 0.2, 0),
    );
    const adapter = new EventItemUseAdapter(camera, new EventItemEffects());
    const sample = createEventItemUseSample();
    const projected = new Vector3();
    const worldPosition = new Vector3();
    adapter.begin(actor, 'bucket', null);

    let apexY = 0;
    let waterY = 0;
    for (const progress of [0.48, 0.54, 0.6, 0.66, 0.72, 0.84, 0.9]) {
      sampleEventItemUse('bucket-scoop', 'bucket', progress, sample);
      adapter.apply(sample);
      scene.updateWorldMatrix(true, true);
      actor.root.getWorldPosition(worldPosition);
      projected.copy(worldPosition).project(camera);
      expect(Math.abs(projected.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(projected.y)).toBeLessThanOrEqual(1);
      if (progress === 0.54) apexY = worldPosition.y;
      if (progress === 0.66) waterY = worldPosition.y;
    }
    expect(apexY).toBeGreaterThan(waterY + 0.6);

    adapter.dispose();
  });

  it('blends the net action origin into travel without teleporting', () => {
    const scene = new Group();
    const camera = new PerspectiveCamera(62, 1.6, 0.1, 100);
    camera.position.set(0, 1.7, 2.4);
    camera.lookAt(0, 0.9, 0);
    scene.add(camera);
    const actorParent = new Group();
    scene.add(actorParent);
    const { actor } = createActor(
      actorParent,
      'fishingNet-1' as ItemInstanceId,
      new Vector3(0, 0.2, 0),
    );
    const adapter = new EventItemUseAdapter(camera, new EventItemEffects());
    const sample = createEventItemUseSample();
    const beforeTravel = new Vector3();
    const afterTravel = new Vector3();
    adapter.begin(actor, 'fishingNet', null);

    sampleEventItemUse('net-scoop', 'fishingNet', 0.44, sample);
    adapter.apply(sample);
    actor.root.getWorldPosition(beforeTravel);
    sampleEventItemUse('net-scoop', 'fishingNet', 0.4401, sample);
    adapter.apply(sample);
    actor.root.getWorldPosition(afterTravel);

    expect(afterTravel.distanceTo(beforeTravel)).toBeLessThan(0.01);
    adapter.dispose();
  });

  it('keeps the bucket body above the gunwale while crossing it', () => {
    const scene = new Group();
    const camera = new PerspectiveCamera(62, 1.6, 0.1, 100);
    camera.position.set(0, 0.88, 1.72);
    camera.lookAt(0, 0.88, -1.55);
    scene.add(camera);
    const actorParent = new Group();
    scene.add(actorParent);
    const { actor } = createActor(
      actorParent,
      'bucket-1' as ItemInstanceId,
      new Vector3(0, 0.2, 0),
    );
    const adapter = new EventItemUseAdapter(camera, new EventItemEffects());
    const sample = createEventItemUseSample();
    const worldPosition = new Vector3();
    adapter.begin(actor, 'bucket', null);

    let crossingSamples = 0;
    for (let progress = 0.42; progress <= 0.66; progress += 0.01) {
      sampleEventItemUse('bucket-scoop', 'bucket', progress, sample);
      adapter.apply(sample);
      scene.updateWorldMatrix(true, true);
      actor.root.getWorldPosition(worldPosition);
      const hullHalfWidth = lifeboatHullHalfWidthAt(worldPosition.z);
      if (
        hullHalfWidth === null
        || worldPosition.x < hullHalfWidth - 0.34
        || worldPosition.x > hullHalfWidth + 0.34
      ) continue;
      crossingSamples += 1;
      expect(worldPosition.y - 0.34).toBeGreaterThan(LIFEBOAT_GUNWALE_SURFACE_Y);
    }
    expect(crossingSamples).toBeGreaterThan(0);

    adapter.dispose();
  });

  it('aims the shotgun sideways without aiming up or down', () => {
    const scene = new Group();
    const camera = new PerspectiveCamera(62, 1.6, 0.1, 100);
    camera.position.set(0, 1.8, 0);
    scene.add(camera);
    const actorParent = new Group();
    scene.add(actorParent);
    const { actor } = createActor(
      actorParent,
      'shotgun-1' as ItemInstanceId,
      new Vector3(),
    );
    const aimTarget = new Group();
    aimTarget.position.set(4, 8, -5);
    scene.add(aimTarget);
    const effects = new EventItemEffects();
    const adapter = new EventItemUseAdapter(camera, effects);
    const sample = createEventItemUseSample();
    sample.cameraSpaceBlend = 1;
    sample.viewX = 0.18;
    sample.viewY = -0.32;
    sample.viewZ = -0.78;
    sample.aimBlend = 1;

    adapter.begin(actor, 'shotgun', aimTarget);
    adapter.apply(sample);

    const origin = actor.root.getWorldPosition(new Vector3());
    const expected = aimTarget.getWorldPosition(new Vector3()).sub(origin);
    expected.y = 0;
    expected.normalize();
    const actual = new Vector3(0, 0, -1)
      .applyQuaternion(actor.root.getWorldQuaternion(new Quaternion()))
      .normalize();
    expect(actual.y).toBeCloseTo(0);
    expect(actual.dot(expected)).toBeGreaterThan(0.995);

    aimTarget.position.set(-3, -6, -4);
    adapter.apply(sample);
    const moved = new Vector3(0, 0, -1)
      .applyQuaternion(actor.root.getWorldQuaternion(new Quaternion()))
      .normalize();
    expect(moved.y).toBeCloseTo(0);
    expect(moved.x).toBeLessThan(0);

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

  it('holds a lifted map perpendicular to the camera view', () => {
    const scene = new Group();
    const camera = new PerspectiveCamera(62, 1.6, 0.1, 100);
    camera.position.set(0.4, 1.7, 0.8);
    camera.rotation.set(-0.24, 0.38, 0.08, 'YXZ');
    scene.add(camera);
    const actorParent = new Group();
    actorParent.rotation.set(0.12, -0.3, 0.18);
    scene.add(actorParent);
    const { actor } = createActor(
      actorParent,
      'map-1' as ItemInstanceId,
      new Vector3(-0.3, 0.2, -0.5),
    );
    const adapter = new EventItemUseAdapter(camera, new EventItemEffects());
    const sample = createEventItemUseSample();
    sample.cameraSpaceBlend = 1;
    sample.viewY = -0.2;
    sample.viewZ = -0.58;

    adapter.begin(actor, 'map', null);
    adapter.apply(sample);

    const mapNormal = new Vector3(0, 1, 0)
      .applyQuaternion(actor.root.getWorldQuaternion(new Quaternion()))
      .normalize();
    const cameraBackward = new Vector3(0, 0, 1)
      .applyQuaternion(camera.getWorldQuaternion(new Quaternion()))
      .normalize();
    expect(mapNormal.dot(cameraBackward)).toBeGreaterThan(0.999);

    adapter.dispose();
  });

  it('keeps a lifted map fixed while the camera looks around', () => {
    const scene = new Group();
    const camera = new PerspectiveCamera(62, 1.6, 0.1, 100);
    camera.position.set(0.4, 1.7, 0.8);
    camera.rotation.set(-0.12, 0.24, 0.03, 'YXZ');
    scene.add(camera);
    const actorParent = new Group();
    scene.add(actorParent);
    const { actor } = createActor(
      actorParent,
      'map-1' as ItemInstanceId,
      new Vector3(-0.3, 0.2, -0.5),
    );
    const adapter = new EventItemUseAdapter(camera, new EventItemEffects());
    const sample = createEventItemUseSample();
    sample.cameraSpaceBlend = 1;
    sample.viewY = -0.2;
    sample.viewZ = -0.58;

    adapter.begin(actor, 'map', null);
    adapter.apply(sample);
    const heldPosition = actor.root.getWorldPosition(new Vector3());
    const heldRotation = actor.root.getWorldQuaternion(new Quaternion());

    sample.cameraYaw = 0.2;
    sample.cameraPitch = 0.26;
    adapter.apply(sample);

    expectVectorCloseTo(actor.root.getWorldPosition(new Vector3()), heldPosition);
    expect(actor.root.getWorldQuaternion(new Quaternion()).angleTo(heldRotation))
      .toBeCloseTo(0);
    adapter.dispose();
  });

  it('faces the compass dial directly toward the camera', () => {
    const scene = new Group();
    const camera = new PerspectiveCamera(62, 1.6, 0.1, 100);
    scene.add(camera);
    const actorParent = new Group();
    scene.add(actorParent);
    const { actor } = createActor(
      actorParent,
      'compass-1' as ItemInstanceId,
      new Vector3(0.4, -0.2, -0.7),
    );
    const adapter = new EventItemUseAdapter(camera, new EventItemEffects());
    const sample = createEventItemUseSample();
    sample.cameraSpaceBlend = 1;
    sample.viewY = 0.04;
    sample.viewZ = -0.44;

    adapter.begin(actor, 'compass', null);
    adapter.apply(sample);

    const actorPosition = actor.root.getWorldPosition(new Vector3());
    const toCamera = camera.getWorldPosition(new Vector3())
      .sub(actorPosition)
      .normalize();
    const dialNormal = new Vector3(0, 0, 1)
      .applyQuaternion(actor.root.getWorldQuaternion(new Quaternion()))
      .normalize();
    expect(dialNormal.dot(toCamera)).toBeGreaterThan(0.995);

    sample.yaw = 0.14;
    adapter.apply(sample);
    const leftNormal = new Vector3(0, 0, 1)
      .applyQuaternion(actor.root.getWorldQuaternion(new Quaternion()));
    sample.yaw = -0.14;
    adapter.apply(sample);
    const rightNormal = new Vector3(0, 0, 1)
      .applyQuaternion(actor.root.getWorldQuaternion(new Quaternion()));
    expect(leftNormal.x).toBeGreaterThan(0);
    expect(rightNormal.x).toBeLessThan(0);

    adapter.dispose();
  });

  it('aligns Binoculars with the eyes before looking at the event target', () => {
    const scene = new Group();
    const camera = new PerspectiveCamera(62, 1.6, 0.1, 100);
    camera.position.set(0.4, 1.7, 0.8);
    camera.rotation.set(-0.08, 0.16, 0, 'YXZ');
    scene.add(camera);
    const actorParent = new Group();
    scene.add(actorParent);
    const { actor } = createActor(
      actorParent,
      'spyglass-1' as ItemInstanceId,
      new Vector3(-0.3, 0.2, -0.5),
    );
    const aimTarget = new Group();
    aimTarget.position.set(5, 3.2, -9);
    scene.add(aimTarget);
    const adapter = new EventItemUseAdapter(camera, new EventItemEffects());
    const close = createEventItemUseSample();
    sampleEventItemUse('binocular-look', 'spyglass', 0.52, close);

    adapter.begin(actor, 'spyglass', aimTarget);
    adapter.apply(close);

    const toCamera = camera.getWorldPosition(new Vector3())
      .sub(actor.root.getWorldPosition(new Vector3()))
      .normalize();
    const eyeAxis = new Vector3(0, 0, 1)
      .applyQuaternion(actor.root.getWorldQuaternion(new Quaternion()))
      .normalize();
    expect(eyeAxis.dot(toCamera)).toBeGreaterThan(0.995);

    const looking = createEventItemUseSample();
    sampleEventItemUse('binocular-look', 'spyglass', 1, looking);
    const cameraPosition = camera.position.clone();
    adapter.apply(looking);
    camera.updateWorldMatrix(true, false);
    const expectedDirection = aimTarget.getWorldPosition(new Vector3())
      .sub(camera.getWorldPosition(new Vector3()))
      .normalize();
    expect(camera.getWorldDirection(new Vector3()).dot(expectedDirection))
      .toBeGreaterThan(0.999);
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
  const expected = aimTarget.getWorldPosition(new Vector3()).sub(origin);
  expected.y = 0;
  expected.normalize();
  const actual = new Vector3(1, 0, 0)
    .applyQuaternion(actor.root.getWorldQuaternion(new Quaternion()))
    .normalize();
  expect(actual.dot(expected)).toBeGreaterThan(0.995);
  expect(actual.y).toBeCloseTo(0);
}

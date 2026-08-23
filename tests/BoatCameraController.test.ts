import {
  Group,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import { BoatCameraController } from '../src/survival/BoatCameraController';

const BASE_LOOK_TARGET = new Vector3(0, 0.88, -1.55);
const BASE_POSITION = new Vector3(0, 0.88, 1.56);
const DRIFTING_POSITION = new Vector3(0, 1.38, -1.42);

function createHarness(): {
  readonly camera: PerspectiveCamera;
  readonly cameraRig: Group;
  readonly controller: BoatCameraController;
  readonly scene: Scene;
} {
  const camera = new PerspectiveCamera(65, 4 / 3, 0.08, 220);
  const cameraRig = new Group();
  const scene = new Scene();
  cameraRig.add(camera);
  scene.add(cameraRig);
  return {
    camera,
    cameraRig,
    controller: new BoatCameraController(camera, cameraRig, BASE_LOOK_TARGET),
    scene,
  };
}

describe('BoatCameraController', () => {
  it('sets instant rear view and restores the exact base pose', () => {
    const { camera, controller } = createHarness();
    const baseQuaternion = camera.quaternion.clone();

    controller.setRearView(true, true);
    controller.update(0);

    const expectedRear = baseQuaternion.clone()
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI))
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.75));
    expect(camera.position.toArray()).toEqual(BASE_POSITION.toArray());
    expect(camera.quaternion.angleTo(expectedRear)).toBeLessThan(0.0001);

    controller.restoreBasePose();
    expect(camera.position.toArray()).toEqual(BASE_POSITION.toArray());
    expect(camera.quaternion.angleTo(baseQuaternion)).toBeLessThan(0.0001);
  });

  it('animates rear and front turns with the authored duration and easing', () => {
    const { camera, controller } = createHarness();
    const baseQuaternion = camera.quaternion.clone();

    controller.setRearView(true);
    controller.update(0.325);
    const halfRear = camera.quaternion.clone();
    controller.update(0.325);
    const rear = camera.quaternion.clone();

    expect(baseQuaternion.angleTo(halfRear)).toBeGreaterThan(0.5);
    expect(halfRear.angleTo(rear)).toBeGreaterThan(0.5);
    controller.setRearView(false);
    controller.update(0.65);
    expect(camera.quaternion.angleTo(baseQuaternion)).toBeLessThan(0.0001);
  });

  it('restores the base pose after a fixed event camera pose', () => {
    const { camera, controller } = createHarness();
    const baseQuaternion = camera.quaternion.clone();
    camera.position.set(1.4, -0.3, 2.8);
    camera.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), 0.9);

    controller.restoreBasePose();

    expect(camera.position.toArray()).toEqual(BASE_POSITION.toArray());
    expect(camera.quaternion.angleTo(baseQuaternion)).toBeLessThan(0.0001);
  });

  it('enters a drifting item view, tracks its target, and returns', async () => {
    const { camera, controller, scene } = createHarness();
    const baseQuaternion = camera.quaternion.clone();
    const target = new Object3D();
    target.position.set(1.6, 0.4, -4.2);
    scene.add(target);

    const entered = controller.beginDriftingItemView(target);
    controller.update(1.1);
    await entered;

    expect(camera.position.toArray()).toEqual(DRIFTING_POSITION.toArray());
    const direction = camera.getWorldDirection(new Vector3());
    const directionToTarget = target.getWorldPosition(new Vector3())
      .sub(camera.getWorldPosition(new Vector3()))
      .normalize();
    expect(direction.dot(directionToTarget)).toBeGreaterThan(0.9999);

    target.position.x = -1.2;
    controller.refreshDriftingItemView();
    expect(camera.getWorldDirection(direction).dot(
      target.getWorldPosition(directionToTarget)
        .sub(camera.getWorldPosition(new Vector3()))
        .normalize(),
    )).toBeGreaterThan(0.9999);

    const returned = controller.endDriftingItemView();
    controller.update(1.1);
    await returned;
    expect(camera.position.toArray()).toEqual(BASE_POSITION.toArray());
    expect(camera.quaternion.angleTo(baseQuaternion)).toBeLessThan(0.0001);
  });

  it('resolves replaced transitions and settles active work for visibility', async () => {
    const { camera, controller, scene } = createHarness();
    const target = new Object3D();
    target.position.set(0.8, 0.3, -4);
    scene.add(target);
    let settled = 0;

    const first = controller.beginDriftingItemView(target).then(() => { settled += 1; });
    const second = controller.beginDriftingItemView(target).then(() => { settled += 1; });
    controller.settleForVisibilityChange();
    await Promise.all([first, second]);

    expect(settled).toBe(2);
    expect(camera.position.toArray()).toEqual(DRIFTING_POSITION.toArray());

    const returnFirst = controller.endDriftingItemView();
    const returnSecond = controller.endDriftingItemView();
    controller.settleForVisibilityChange();
    await Promise.all([returnFirst, returnSecond]);
    expect(camera.position.toArray()).toEqual(BASE_POSITION.toArray());
  });

  it('settles active work and restores the base pose once on disposal', async () => {
    const { camera, controller, scene } = createHarness();
    const target = new Object3D();
    target.position.set(0, 0.3, -4);
    scene.add(target);
    const entered = controller.beginDriftingItemView(target);

    controller.dispose();
    controller.dispose();
    await entered;

    expect(camera.position.toArray()).toEqual(BASE_POSITION.toArray());
    await expect(controller.beginDriftingItemView(target)).resolves.toBeUndefined();
  });
});

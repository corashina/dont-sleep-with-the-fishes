import { describe, expect, it, vi } from 'vitest';
import { Euler, Object3D, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { InputController } from '../src/input/InputController';
import type { MovementAxes } from '../src/player/collisions';
import { PlayerController, type PlayerNavigationBounds } from '../src/player/PlayerController';
import { createTestShip } from './helpers/shipFurniture';

const TEST_NAVIGATION_BOUNDS: PlayerNavigationBounds = {
  safe: { minX: -5.9, maxX: 5.9, minZ: -16, maxZ: 15.2 },
  fall: { minX: -7, maxX: 7, minZ: -18, maxZ: 18 },
};

class TestInput {
  movement: MovementAxes = { x: 0, z: 0 };
  sprinting = false;
  private look = { x: 0, y: 0 };
  private jumpQueued = false;

  queueLook(x: number, y: number): void {
    this.look = { x, y };
  }

  consumeLook(): { x: number; y: number } {
    const look = this.look;
    this.look = { x: 0, y: 0 };
    return look;
  }

  queueJump(): void {
    this.jumpQueued = true;
  }

  consumeJump(): boolean {
    const queued = this.jumpQueued;
    this.jumpQueued = false;
    return queued;
  }

  asControllerInput(): InputController {
    return this as unknown as InputController;
  }
}

function expectVector(actual: Vector3, expected: Vector3): void {
  expect(actual.distanceTo(expected)).toBeLessThan(1e-8);
}

function expectRotation(actual: Quaternion, expected: Quaternion): void {
  expect(Math.abs(actual.dot(expected))).toBeCloseTo(1, 8);
}

describe('PlayerController', () => {
  it('places the camera from ship-local position and view rotation', () => {
    const ship = new Object3D();
    ship.position.set(8, -2, 5);
    ship.rotation.set(0.2, 0.35, -0.1);
    const camera = new PerspectiveCamera();
    const start = new Vector3(1.25, 3.7, -2.5);
    const controller = new PlayerController(
      camera, ship, start, [], TEST_NAVIGATION_BOUNDS, vi.fn(),
    );

    controller.update(0, new TestInput().asControllerInput());

    const expectedPosition = start.clone();
    ship.localToWorld(expectedPosition);
    const expectedRotation = ship.quaternion.clone().multiply(
      new Quaternion().setFromEuler(new Euler(0, Math.PI, 0, 'YXZ')),
    );
    expectVector(camera.position, expectedPosition);
    expectRotation(camera.quaternion, expectedRotation);
  });

  it.each([
    ['downward', 10_000, -1.35],
    ['upward', -10_000, 1.35],
  ])('clamps %s mouse pitch', (
    _direction,
    movementY,
    expectedPitch,
  ) => {
    const ship = new Object3D();
    const camera = new PerspectiveCamera();
    const input = new TestInput();
    const controller = new PlayerController(
      camera, ship, new Vector3(0, 3.7, 0), [], TEST_NAVIGATION_BOUNDS, vi.fn(),
    );
    input.queueLook(0, movementY);

    controller.update(0, input.asControllerInput());

    expectRotation(
      camera.quaternion,
      new Quaternion().setFromEuler(new Euler(expectedPitch, Math.PI, 0, 'YXZ')),
    );
  });

  it.each([
    ['right', Math.PI / (2 * 0.0018), Math.PI / 2],
    ['left', -Math.PI / (2 * 0.0018), Math.PI * 1.5],
  ])('allows %s yaw beyond the former scavenging look cone', (
    _direction,
    movementX,
    expectedYaw,
  ) => {
    const ship = new Object3D();
    const camera = new PerspectiveCamera();
    const input = new TestInput();
    const controller = new PlayerController(
      camera, ship, new Vector3(0, 3.7, 0), [], TEST_NAVIGATION_BOUNDS, vi.fn(),
    );
    input.queueLook(movementX, 0);

    controller.update(0, input.asControllerInput());

    expectRotation(
      camera.quaternion,
      new Quaternion().setFromEuler(new Euler(0, expectedYaw, 0, 'YXZ')),
    );
  });

  it('uses walk and sprint speeds in the current local heading', () => {
    const input = new TestInput();
    input.movement = { x: 0, z: -1 };
    const walking = new PlayerController(
      new PerspectiveCamera(), new Object3D(), new Vector3(0, 3.7, 0), [],
      TEST_NAVIGATION_BOUNDS, vi.fn(),
    );
    const sprinting = new PlayerController(
      new PerspectiveCamera(), new Object3D(), new Vector3(0, 3.7, 0), [],
      TEST_NAVIGATION_BOUNDS, vi.fn(),
    );

    walking.update(1, input.asControllerInput());
    input.sprinting = true;
    sprinting.update(1, input.asControllerInput());

    expect(walking.localPosition.z).toBeCloseTo(3.8);
    expect(sprinting.localPosition.z).toBeCloseTo(6.2);
  });

  it('jumps, ignores another jump while airborne, and can jump again after landing', () => {
    const start = new Vector3(0, 3.7, 0);
    const input = new TestInput();
    const controller = new PlayerController(
      new PerspectiveCamera(), new Object3D(), start, [], TEST_NAVIGATION_BOUNDS, vi.fn(),
    );

    input.queueJump();
    controller.update(0.1, input.asControllerInput());
    expect(controller.localPosition.y).toBeGreaterThan(start.y);

    input.queueJump();
    for (let index = 0; index < 10; index += 1) {
      controller.update(0.1, input.asControllerInput());
    }
    expect(controller.localPosition.y).toBeCloseTo(start.y);

    input.queueJump();
    controller.update(0.1, input.asControllerInput());
    expect(controller.localPosition.y).toBeGreaterThan(start.y);
  });

  it('lands on a 0.6-unit object, stands on it, then falls to deck after stepping off', () => {
    const deckEyeHeight = 3.72;
    const supportTop = deckEyeHeight - 1.5 + 0.6;
    const support = {
      minX: -0.7, maxX: 0.7,
      minY: deckEyeHeight - 1.5, maxY: supportTop,
      minZ: 0.75, maxZ: 2.0,
    };
    const input = new TestInput();
    const controller = new PlayerController(
      new PerspectiveCamera(),
      new Object3D(),
      new Vector3(0, deckEyeHeight, 0),
      [support],
      TEST_NAVIGATION_BOUNDS,
      vi.fn(),
    );

    input.movement = { x: 0, z: -1 };
    input.queueJump();
    for (let frame = 0; frame < 4; frame += 1) {
      controller.update(0.1, input.asControllerInput());
    }
    input.movement = { x: 0, z: 0 };
    for (let frame = 0; frame < 12; frame += 1) {
      controller.update(0.1, input.asControllerInput());
    }

    expect(controller.localPosition.y).toBeCloseTo(supportTop + 1.5);
    const standingY = controller.localPosition.y;
    controller.update(0.1, input.asControllerInput());
    expect(controller.localPosition.y).toBeCloseTo(standingY);

    input.movement = { x: 0, z: -1 };
    for (let frame = 0; frame < 5; frame += 1) {
      controller.update(0.1, input.asControllerInput());
    }
    input.movement = { x: 0, z: 0 };
    for (let frame = 0; frame < 12; frame += 1) {
      controller.update(0.1, input.asControllerInput());
    }

    expect(controller.localPosition.y).toBeCloseTo(deckEyeHeight);
  });

  it.each([
    ['KeyW', { x: 0, z: -1 }, new Vector3(0, 0, -1)],
    ['KeyD', { x: 1, z: 0 }, new Vector3(1, 0, 0)],
  ])('moves %s along its visible camera-space direction at yaw pi/2', (
    _key,
    movement,
    cameraDirection,
  ) => {
    const ship = new Object3D();
    const camera = new PerspectiveCamera();
    const input = new TestInput();
    const controller = new PlayerController(
      camera, ship, new Vector3(0, 3.7, 0), [], TEST_NAVIGATION_BOUNDS, vi.fn(),
    );
    input.queueLook(Math.PI / (2 * 0.0018), 0);
    controller.update(0, input.asControllerInput());
    const visibleDirection = cameraDirection.clone().applyQuaternion(camera.quaternion);
    visibleDirection.y = 0;
    visibleDirection.normalize();
    const before = controller.localPosition.clone();
    input.movement = movement;

    controller.update(0.5, input.asControllerInput());

    const displacement = controller.localPosition.clone().sub(before).normalize();
    expect(displacement.dot(visibleDirection)).toBeCloseTo(1, 8);
  });

  it('stops forward movement at the bow arc barrier', () => {
    const input = new TestInput();
    input.movement = { x: 0, z: -1 };
    const controller = new PlayerController(
      new PerspectiveCamera(),
      new Object3D(),
      new Vector3(0, 3.72, 17),
      [],
      TEST_NAVIGATION_BOUNDS,
      vi.fn(),
      [{
        centerX: 0,
        centerZ: 14,
        radiusX: 6,
        radiusZ: 4,
        end: 'bow',
        thickness: 0.25,
        minY: 2.22,
        maxY: 3.27,
      }],
    );

    controller.update(0.5, input.asControllerInput());

    expect(controller.localPosition.z).toBeCloseTo(17.525);
  });

  it('preserves the approved cabin start without trapping movement', () => {
    const shipBuild = createTestShip();
    const input = new TestInput();
    const controller = new PlayerController(
      new PerspectiveCamera(),
      shipBuild.root,
      shipBuild.playerStart,
      shipBuild.colliders,
      shipBuild.playerNavigationBounds,
      vi.fn(),
    );

    controller.update(0, input.asControllerInput());
    expect(controller.localPosition.z).toBeCloseTo(7.2);
    const resolvedStart = controller.localPosition.clone();

    input.movement = { x: 0, z: 1 };
    controller.update(0.1, input.asControllerInput());
    expect(controller.localPosition.z).toBeLessThan(resolvedStart.z);
    const forwardPosition = controller.localPosition.clone();

    input.movement = { x: 0, z: -1 };
    controller.update(0.1, input.asControllerInput());
    expect(controller.localPosition.z).toBeGreaterThan(forwardPosition.z);
  });

  it('restores the latest safe inboard position and reports a fall', () => {
    const onFall = vi.fn();
    const input = new TestInput();
    input.movement = { x: 1, z: 0 };
    const controller = new PlayerController(
      new PerspectiveCamera(), new Object3D(), new Vector3(0, 3.7, 0), [],
      TEST_NAVIGATION_BOUNDS, onFall,
    );

    controller.update(0.5, input.asControllerInput());
    const safePosition = controller.localPosition.clone();
    controller.update(2, input.asControllerInput());

    expectVector(controller.localPosition, safePosition);
    expect(onFall).toHaveBeenCalledOnce();
  });

  it.each([
    ['forward port exterior', new Vector3(-4.5, 3.72, 14.5)],
    ['forward starboard exterior', new Vector3(4.5, 3.72, 14.5)],
    ['aft port exterior', new Vector3(-3.4, 3.72, -15.9)],
    ['storage room', new Vector3(0, 3.72, -9.2)],
    ['lifeboat approach', new Vector3(5.9, 3.72, -6.5)],
  ])('keeps the freighter %s inside the playable bounds', (_label, position) => {
    const shipBuild = createTestShip();
    const onFall = vi.fn();
    const controller = new PlayerController(
      new PerspectiveCamera(), shipBuild.root, position, shipBuild.colliders,
      shipBuild.playerNavigationBounds, onFall,
    );

    controller.update(0, new TestInput().asControllerInput());

    expectVector(controller.localPosition, position);
    expect(onFall).not.toHaveBeenCalled();
    shipBuild.dispose();
  });

  it('places the shared camera from the player pose without a movement tick', () => {
    const ship = new Object3D();
    ship.position.set(4, 1, -3);
    ship.rotation.y = Math.PI / 6;
    ship.updateMatrixWorld(true);
    const camera = new PerspectiveCamera();
    const start = new Vector3(1, 3.7, 2);
    const controller = new PlayerController(
      camera, ship, start, [], TEST_NAVIGATION_BOUNDS, vi.fn(),
    );
    const expectedPosition = ship.localToWorld(start.clone());
    const expectedForward = new Vector3(0, 0, 1).applyQuaternion(ship.quaternion);

    controller.placeCamera();

    expectVector(camera.position, expectedPosition);
    expectVector(camera.getWorldDirection(new Vector3()), expectedForward);
    expectVector(controller.localPosition, start);
  });

  it('reset restores the supplied local start and default view', () => {
    const ship = new Object3D();
    const camera = new PerspectiveCamera();
    const input = new TestInput();
    input.movement = { x: 1, z: 0 };
    input.queueLook(250, -400);
    const controller = new PlayerController(
      camera, ship, new Vector3(0, 3.7, 0), [], TEST_NAVIGATION_BOUNDS, vi.fn(),
    );
    controller.update(0.25, input.asControllerInput());
    const resetStart = new Vector3(2, 3.8, -1);

    controller.reset(resetStart);
    input.movement = { x: 0, z: 0 };
    controller.update(0, input.asControllerInput());

    expectVector(controller.localPosition, resetStart);
    expectVector(camera.position, resetStart);
    expectRotation(
      camera.quaternion,
      new Quaternion().setFromEuler(new Euler(0, Math.PI, 0, 'YXZ')),
    );
  });
});

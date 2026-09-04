// Importance: 10/10 (scaled from 5/5). Protects player movement and recovery.
import { describe, expect, it, vi } from 'vitest';
import { Euler, Object3D, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { InputController } from '../src/input/InputController';
import type { LocalPlayerPosition, MovementAxes } from '../src/player/collisions';
import type { LadderClimbZone } from '../src/player/LadderTraversal';
import {
  PlayerController,
  type DynamicMovementResolver,
  type PlayerNavigationBounds,
} from '../src/player/PlayerController';
import { SCAVENGE_SPRINT_SPEED, SCAVENGE_WALK_SPEED } from '../src/game/scavengeMovement';
import { SHIP_LAYOUT } from '../src/world/shipLayoutData';
import { FREIGHTER_DIMENSIONS } from '../src/world/ShipLayoutTypes';
import { createTestShip } from './helpers/shipFurniture';

const TEST_NAVIGATION_BOUNDS: PlayerNavigationBounds = {
  safe: { minX: -5.9, maxX: 5.9, minZ: -16, maxZ: 15.2 },
  fall: { minX: -7, maxX: 7, minZ: -18, maxZ: 18 },
};

const noDynamicMovement: DynamicMovementResolver = () => undefined;

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

function navigationTarget(id: string): Vector3 {
  const position = SHIP_LAYOUT.targets.find((candidate) => candidate.id === id)!.position;
  return new Vector3(position[0], FREIGHTER_DIMENSIONS.deckY + 1.5, position[1]);
}

function testLadderZone(): LadderClimbZone {
  return {
    id: 'test-ladder',
    climbX: 0,
    climbZ: 4,
    outwardX: 0,
    outwardZ: -1,
    bottomEyeY: 3.72,
    topEyeY: 6.42,
    topFloor: { minX: -1, maxX: 1, minZ: 4, maxZ: 6 },
    bottomEntry: { minX: -0.4, maxX: 0.4, minZ: 3.6, maxZ: 3.9 },
    topEntry: { minX: -0.4, maxX: 0.4, minZ: 3.6, maxZ: 3.9 },
    bottomDismount: [0, 3.5],
    topDismount: [0, 4.5],
  };
}

describe('PlayerController', () => {
  it('places the camera from ship-local position and view rotation', () => {
    const ship = new Object3D();
    ship.position.set(8, -2, 5);
    ship.rotation.set(0.2, 0.35, -0.1);
    const camera = new PerspectiveCamera();
    const start = new Vector3(1.25, 3.7, -2.5);
    const controller = new PlayerController(
      camera, ship, start, [], TEST_NAVIGATION_BOUNDS, vi.fn(), noDynamicMovement,
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
      noDynamicMovement,
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
      noDynamicMovement,
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
      TEST_NAVIGATION_BOUNDS, vi.fn(), noDynamicMovement,
    );
    const sprinting = new PlayerController(
      new PerspectiveCamera(), new Object3D(), new Vector3(0, 3.7, 0), [],
      TEST_NAVIGATION_BOUNDS, vi.fn(), noDynamicMovement,
    );

    walking.update(1, input.asControllerInput());
    input.sprinting = true;
    sprinting.update(1, input.asControllerInput());

    expect(walking.localPosition.z).toBeCloseTo(SCAVENGE_WALK_SPEED);
    expect(sprinting.localPosition.z).toBeCloseTo(SCAVENGE_SPRINT_SPEED);
  });

  it('resolves dynamic movement after static collision', () => {
    let receivedDesiredZ = Number.NaN;
    const resolveDynamicMovement = vi.fn((
      _current: Readonly<LocalPlayerPosition>,
      desired: LocalPlayerPosition,
    ) => {
      receivedDesiredZ = desired.z;
      desired.z = Math.max(desired.z, -0.1);
    });
    const controller = new PlayerController(
      new PerspectiveCamera(),
      new Object3D(),
      new Vector3(0, 3.72, 0),
      [],
      TEST_NAVIGATION_BOUNDS,
      vi.fn(),
      resolveDynamicMovement,
    );
    const input = new TestInput();
    input.movement = { x: 0, z: 1 };

    controller.update(1, input.asControllerInput());

    expect(resolveDynamicMovement).toHaveBeenCalledOnce();
    expect(resolveDynamicMovement.mock.calls[0]![0]).toEqual({ x: 0, y: 3.72, z: 0 });
    expect(receivedDesiredZ).toBeCloseTo(-SCAVENGE_WALK_SPEED);
    expect(controller.localPosition.z).toBe(-0.1);
  });

  it.each([
    [1, SCAVENGE_WALK_SPEED],
    [0.88, SCAVENGE_WALK_SPEED * 0.88],
    [0.76, SCAVENGE_WALK_SPEED * 0.76],
  ])('applies planar speed multiplier %s', (multiplier, expectedDistance) => {
    const input = new TestInput();
    const controller = new PlayerController(
      new PerspectiveCamera(),
      new Object3D(),
      new Vector3(0, 3.72, 0),
      [],
      TEST_NAVIGATION_BOUNDS,
      vi.fn(),
      noDynamicMovement,
    );
    input.movement = { x: 0, z: -1 };

    const sample = controller.update(1, input.asControllerInput(), multiplier);

    expect(sample.movedDistance).toBeCloseTo(expectedDistance);
  });

  it('keeps jump height equal across speed multipliers', () => {
    const fullSpeedInput = new TestInput();
    const carriedInput = new TestInput();
    const fullSpeed = new PlayerController(
      new PerspectiveCamera(), new Object3D(), new Vector3(0, 3.72, 0), [],
      TEST_NAVIGATION_BOUNDS, vi.fn(), noDynamicMovement,
    );
    const carried = new PlayerController(
      new PerspectiveCamera(), new Object3D(), new Vector3(0, 3.72, 0), [],
      TEST_NAVIGATION_BOUNDS, vi.fn(), noDynamicMovement,
    );
    fullSpeedInput.queueJump();
    carriedInput.queueJump();

    fullSpeed.update(0.1, fullSpeedInput.asControllerInput(), 1);
    carried.update(0.1, carriedInput.asControllerInput(), 0.76);

    expect(carried.localPosition.y).toBeCloseTo(fullSpeed.localPosition.y);
  });

  it('automatically climbs and keeps the balcony as its active floor', () => {
    const input = new TestInput();
    const zone = testLadderZone();
    const controller = new PlayerController(
      new PerspectiveCamera(),
      new Object3D(),
      new Vector3(0, zone.bottomEyeY, zone.bottomEntry.minZ),
      [],
      TEST_NAVIGATION_BOUNDS,
      vi.fn(),
      noDynamicMovement,
      [],
      [zone],
    );
    input.movement = { x: 0, z: -1 };

    for (let frame = 0; frame < 15; frame += 1) {
      controller.update(0.1, input.asControllerInput());
    }

    expect(controller.localPosition.y).toBeCloseTo(zone.topEyeY);
    expect(controller.localPosition.x).toBeCloseTo(zone.topDismount[0]);
    expect(controller.localPosition.z).toBeCloseTo(zone.topDismount[1]);
    input.movement = { x: 0, z: 0 };
    controller.update(0.5, input.asControllerInput());
    expect(controller.localPosition.y).toBeCloseTo(zone.topEyeY);
  });

  it('grabs the ladder at the current height after jumping into it', () => {
    const input = new TestInput();
    const zone = testLadderZone();
    const controller = new PlayerController(
      new PerspectiveCamera(),
      new Object3D(),
      new Vector3(0, zone.bottomEyeY, 3.3),
      [],
      TEST_NAVIGATION_BOUNDS,
      vi.fn(),
      noDynamicMovement,
      [],
      [zone],
    );
    input.movement = { x: 0, z: -1 };
    input.queueJump();

    controller.update(0.05, input.asControllerInput());
    controller.update(0.05, input.asControllerInput());
    const contactY = controller.localPosition.y;
    const capture = controller.update(0.05, input.asControllerInput());

    expect(contactY).toBeGreaterThan(zone.bottomEyeY);
    expect(controller.localPosition.y).toBeCloseTo(contactY);
    expect(capture.jumped).toBe(false);
    expect(capture.grounded).toBe(false);
  });

  it('falls to the main deck after jumping off the balcony floor', () => {
    const input = new TestInput();
    const zone = testLadderZone();
    const controller = new PlayerController(
      new PerspectiveCamera(),
      new Object3D(),
      new Vector3(0, zone.bottomEyeY, zone.bottomEntry.minZ),
      [],
      TEST_NAVIGATION_BOUNDS,
      vi.fn(),
      noDynamicMovement,
      [],
      [zone],
    );
    input.movement = { x: 0, z: -1 };
    for (let frame = 0; frame < 15; frame += 1) {
      controller.update(0.1, input.asControllerInput());
    }

    input.movement = { x: -1, z: 0 };
    input.queueJump();
    for (let frame = 0; frame < 4; frame += 1) {
      controller.update(0.1, input.asControllerInput());
    }
    input.movement = { x: 0, z: 0 };
    for (let frame = 0; frame < 20; frame += 1) {
      controller.update(0.1, input.asControllerInput());
    }

    expect(controller.localPosition.x).toBeGreaterThan(1);
    expect(controller.localPosition.y).toBeCloseTo(zone.bottomEyeY);
  });

  it('automatically descends and keeps the lower deck as its active floor', () => {
    const input = new TestInput();
    const zone = testLadderZone();
    const controller = new PlayerController(
      new PerspectiveCamera(),
      new Object3D(),
      new Vector3(0, zone.topEyeY, zone.topEntry.maxZ),
      [],
      TEST_NAVIGATION_BOUNDS,
      vi.fn(),
      noDynamicMovement,
      [],
      [zone],
    );
    input.movement = { x: 0, z: 1 };

    for (let frame = 0; frame < 14; frame += 1) {
      controller.update(0.1, input.asControllerInput());
    }

    expect(controller.localPosition.y).toBeCloseTo(zone.bottomEyeY);
    expect(controller.localPosition.x).toBeCloseTo(zone.bottomDismount[0]);
    expect(controller.localPosition.z).toBeCloseTo(zone.bottomDismount[1]);
    input.movement = { x: 0, z: 0 };
    controller.update(0.5, input.asControllerInput());
    expect(controller.localPosition.y).toBeCloseTo(zone.bottomEyeY);
  });

  it('suppresses gravity but still consumes camera look while climbing', () => {
    const input = new TestInput();
    const zone = testLadderZone();
    const camera = new PerspectiveCamera();
    const controller = new PlayerController(
      camera,
      new Object3D(),
      new Vector3(0, zone.bottomEyeY, zone.bottomEntry.minZ),
      [],
      TEST_NAVIGATION_BOUNDS,
      vi.fn(),
      noDynamicMovement,
      [],
      [zone],
    );
    input.movement = { x: 0, z: -1 };
    controller.update(0.1, input.asControllerInput());
    input.movement = { x: 0, z: 0 };
    input.queueLook(100, -50);

    controller.update(0.5, input.asControllerInput());

    expect(controller.localPosition.y).toBeCloseTo(zone.bottomEyeY);
    expectRotation(
      camera.quaternion,
      new Quaternion().setFromEuler(new Euler(0.09, Math.PI - 0.18, 0, 'YXZ')),
    );

    input.movement = { x: 0, z: -1 };
    for (let frame = 0; frame < 16; frame += 1) {
      controller.update(0.1, input.asControllerInput());
    }
    input.movement = { x: 0, z: 0 };
    controller.update(0.1, input.asControllerInput());
    expect(controller.localPosition.y).toBeCloseTo(zone.topEyeY);
  });

  it('jumps outward from the current ladder height without an instant re-grab', () => {
    const input = new TestInput();
    const zone = testLadderZone();
    const controller = new PlayerController(
      new PerspectiveCamera(),
      new Object3D(),
      new Vector3(0, zone.bottomEyeY, zone.bottomEntry.minZ),
      [],
      TEST_NAVIGATION_BOUNDS,
      vi.fn(),
      noDynamicMovement,
      [],
      [zone],
    );
    input.movement = { x: 0, z: -1 };
    for (let frame = 0; frame < 4; frame += 1) {
      controller.update(0.1, input.asControllerInput());
    }
    const ladderY = controller.localPosition.y;
    input.movement = { x: 0, z: 0 };
    input.queueJump();

    const jump = controller.update(0.1, input.asControllerInput());

    expect(jump.jumped).toBe(true);
    expect(jump.grounded).toBe(false);
    expect(controller.localPosition.y).toBeGreaterThan(ladderY);
    expect(controller.localPosition.z).toBeLessThan(zone.climbZ);

    const firstJumpZ = controller.localPosition.z;
    input.movement = { x: 0, z: -1 };
    controller.update(0.1, input.asControllerInput());
    expect(controller.localPosition.z).toBeLessThan(firstJumpZ);
  });

  it.each([
    ['right to left', 0.3, 1],
    ['left to right', -0.3, -1],
  ])('does not capture the ladder when crossing its entry sideways %s', (
    _direction,
    startX,
    movementX,
  ) => {
    const input = new TestInput();
    const zone = testLadderZone();
    const controller = new PlayerController(
      new PerspectiveCamera(),
      new Object3D(),
      new Vector3(startX, zone.bottomEyeY, 3.7),
      [],
      TEST_NAVIGATION_BOUNDS,
      vi.fn(),
      noDynamicMovement,
      [],
      [zone],
    );
    input.movement = { x: movementX, z: 0 };

    controller.update(0.15, input.asControllerInput());

    expect(controller.localPosition.x).toBeCloseTo(
      startX - movementX * SCAVENGE_WALK_SPEED * 0.15,
    );
    expect(controller.localPosition.y).toBeCloseTo(zone.bottomEyeY);
    expect(controller.localPosition.z).toBeCloseTo(3.7);
  });

  it('jumps, ignores another jump while airborne, and can jump again after landing', () => {
    const start = new Vector3(0, 3.7, 0);
    const input = new TestInput();
    const controller = new PlayerController(
      new PerspectiveCamera(), new Object3D(), start, [], TEST_NAVIGATION_BOUNDS, vi.fn(),
      noDynamicMovement,
    );

    input.queueJump();
    const firstJump = controller.update(0.1, input.asControllerInput());
    expect(controller.localPosition.y).toBeGreaterThan(start.y);
    expect(firstJump.jumped).toBe(true);
    expect(firstJump.grounded).toBe(false);

    input.queueJump();
    const rejectedJump = controller.update(0.1, input.asControllerInput());
    expect(rejectedJump.jumped).toBe(false);
    for (let index = 0; index < 10; index += 1) {
      controller.update(0.1, input.asControllerInput());
    }
    expect(controller.localPosition.y).toBeCloseTo(start.y);

    input.queueJump();
    const secondJump = controller.update(0.1, input.asControllerInput());
    expect(controller.localPosition.y).toBeGreaterThan(start.y);
    expect(secondJump.jumped).toBe(true);
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
      noDynamicMovement,
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
      noDynamicMovement,
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
      noDynamicMovement,
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
      noDynamicMovement,
    );

    controller.update(0, input.asControllerInput());
    expectVector(controller.localPosition, shipBuild.playerStart);
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
      noDynamicMovement,
    );

    controller.update(0.5, input.asControllerInput());
    const safePosition = controller.localPosition.clone();
    controller.update(2, input.asControllerInput());

    expectVector(controller.localPosition, safePosition);
    expect(onFall).toHaveBeenCalledOnce();
  });

  it.each([
    ['forward port exterior', navigationTarget('port-loop-forward')],
    ['forward starboard exterior', navigationTarget('starboard-loop-forward')],
    ['aft port exterior', navigationTarget('port-loop-aft')],
    ['storage room', navigationTarget('storage-shelf-forward:shelf-left-standing-0')],
    ['lifeboat approach', navigationTarget('evacuation')],
  ])('keeps the freighter %s inside the playable bounds', (_label, position) => {
    const shipBuild = createTestShip();
    const onFall = vi.fn();
    const controller = new PlayerController(
      new PerspectiveCamera(), shipBuild.root, position, shipBuild.colliders,
      shipBuild.playerNavigationBounds, onFall,
      noDynamicMovement,
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
      camera, ship, start, [], TEST_NAVIGATION_BOUNDS, vi.fn(), noDynamicMovement,
    );
    const expectedPosition = ship.localToWorld(start.clone());
    const expectedForward = new Vector3(0, 0, 1).applyQuaternion(ship.quaternion);

    controller.placeCamera();

    expectVector(camera.position, expectedPosition);
    expectVector(camera.getWorldDirection(new Vector3()), expectedForward);
    expectVector(controller.localPosition, start);
  });

  it('applies one complete scripted local pose', () => {
    const ship = new Object3D();
    ship.position.set(4, 1, -3);
    ship.rotation.y = Math.PI / 6;
    ship.updateMatrixWorld(true);
    const camera = new PerspectiveCamera();
    const controller = new PlayerController(
      camera, ship, new Vector3(0, 3.72, 0), [], TEST_NAVIGATION_BOUNDS, vi.fn(),
      noDynamicMovement,
    );

    controller.setScriptedPose({
      position: [0, 14.22, -0.85],
      yaw: Math.PI + 0.4,
      pitch: -0.25,
      floorEyeY: 14.22,
    });
    controller.placeCamera();

    expect(controller.localPosition.toArray()).toEqual([0, 14.22, -0.85]);
    expectVector(camera.position, ship.localToWorld(new Vector3(0, 14.22, -0.85)));
  });

  it('clears prior ladder and jump state before a passive update', () => {
    const input = new TestInput();
    const zone = testLadderZone();
    const controller = new PlayerController(
      new PerspectiveCamera(),
      new Object3D(),
      new Vector3(0, zone.bottomEyeY, zone.bottomEntry.minZ),
      [],
      TEST_NAVIGATION_BOUNDS,
      vi.fn(),
      noDynamicMovement,
      [],
      [zone],
    );
    input.movement = { x: 0, z: -1 };
    controller.update(0.1, input.asControllerInput());

    const pose = {
      position: [2, zone.bottomEyeY, -1] as const,
      yaw: 0,
      pitch: 0,
      floorEyeY: zone.bottomEyeY,
    };
    controller.setScriptedPose(pose);
    controller.updatePassive(0.1);

    expectVector(controller.localPosition, new Vector3(...pose.position));
    controller.update(0.1, new TestInput().asControllerInput());
    expectVector(controller.localPosition, new Vector3(...pose.position));

    const jumper = new PlayerController(
      new PerspectiveCamera(),
      new Object3D(),
      new Vector3(0, zone.bottomEyeY, 0),
      [],
      TEST_NAVIGATION_BOUNDS,
      vi.fn(),
      noDynamicMovement,
    );
    input.queueJump();
    jumper.update(0.1, input.asControllerInput());
    jumper.setScriptedPose(pose);
    jumper.updatePassive(0.1);

    expectVector(jumper.localPosition, new Vector3(...pose.position));
  });

  it('keeps the player attached to the moving ship during a passive update', () => {
    const ship = new Object3D();
    const camera = new PerspectiveCamera();
    const start = new Vector3(1, 3.7, 2);
    const controller = new PlayerController(
      camera, ship, start, [], TEST_NAVIGATION_BOUNDS, vi.fn(), noDynamicMovement,
    );

    controller.updatePassive(0);
    ship.position.set(4, -1, 7);
    ship.rotation.set(0.15, Math.PI / 4, -0.08);
    ship.updateMatrixWorld(true);
    controller.updatePassive(0.016);

    expectVector(camera.position, ship.localToWorld(start.clone()));
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
      noDynamicMovement,
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

  it('reset uses the supplied start height as the floor for an immediate jump', () => {
    const input = new TestInput();
    const controller = new PlayerController(
      new PerspectiveCamera(),
      new Object3D(),
      new Vector3(0, 3.7, 0),
      [],
      TEST_NAVIGATION_BOUNDS,
      vi.fn(),
      noDynamicMovement,
    );
    const resetStart = new Vector3(2, 4.2, -1);

    controller.reset(resetStart);
    input.queueJump();
    controller.update(0.1, input.asControllerInput());

    expect(controller.localPosition.y).toBeGreaterThan(resetStart.y);
  });
});

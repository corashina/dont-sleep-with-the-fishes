import { Euler, Object3D, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { InputController } from '../input/InputController';
import type { CollisionArc, CollisionBox, LocalPlayerPosition } from './collisions';
import {
  findSupportEyeHeight,
  resolveLocalMovement,
} from './collisions';
import {
  resolveLadderTraversal,
  type LadderClimbZone,
  type LadderEntryArea,
} from './LadderTraversal';

const JUMP_SPEED = 5.2;
const GRAVITY = 14;
const GROUND_EPSILON = 1e-6;
const DEFAULT_YAW = Math.PI;
const LOOK_SENSITIVITY = 0.0018;
const PITCH_LIMIT = 1.35;

export interface PlayerNavigationBounds {
  safe: { minX: number; maxX: number; minZ: number; maxZ: number };
  fall: { minX: number; maxX: number; minZ: number; maxZ: number };
}

function containsLocalPosition(
  bounds: PlayerNavigationBounds['safe'],
  position: Vector3,
): boolean {
  return position.x >= bounds.minX
    && position.x <= bounds.maxX
    && position.z >= bounds.minZ
    && position.z <= bounds.maxZ;
}

function containsElevatedFloor(
  floor: LadderEntryArea,
  position: Pick<LocalPlayerPosition, 'x' | 'z'>,
): boolean {
  return position.x >= floor.minX
    && position.x <= floor.maxX
    && position.z >= floor.minZ
    && position.z <= floor.maxZ;
}

export class PlayerController {
  readonly localPosition: Vector3;
  private readonly safePosition: Vector3;
  private yaw = DEFAULT_YAW;
  private pitch = 0;
  private readonly localView = new Quaternion();
  private readonly localViewEuler = new Euler();
  private readonly worldPosition = new Vector3();
  private readonly movement = new Vector3();
  private readonly baseDeckEyeHeight: number;
  private floorEyeHeight: number;
  private activeLadderId: string | null = null;
  private verticalVelocity = 0;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly ship: Object3D,
    start: Vector3,
    private readonly colliders: readonly CollisionBox[],
    private readonly navigationBounds: PlayerNavigationBounds,
    private readonly onFall: () => void,
    private readonly arcColliders: readonly CollisionArc[] = [],
    private readonly climbZones: readonly LadderClimbZone[] = [],
  ) {
    this.localPosition = start.clone();
    this.safePosition = start.clone();
    this.baseDeckEyeHeight = start.y;
    this.floorEyeHeight = start.y;
  }

  update(delta: number, input: InputController): void {
    const look = input.consumeLook();
    this.yaw -= look.x * LOOK_SENSITIVITY;
    this.pitch = Math.max(
      -PITCH_LIMIT,
      Math.min(PITCH_LIMIT, this.pitch - look.y * LOOK_SENSITIVITY),
    );

    const axes = input.movement;
    const speed = input.sprinting ? 6.2 : 3.8;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    this.movement.set(
      (axes.x * cos + axes.z * sin) * speed * delta,
      0,
      (-axes.x * sin + axes.z * cos) * speed * delta,
    );

    const ladderTraversal = resolveLadderTraversal({
      position: this.localPosition,
      activeLadderId: this.activeLadderId,
      planarMovement: [this.movement.x, this.movement.z],
      verticalInput: -axes.z,
      deltaSeconds: delta,
      floorEyeY: this.floorEyeHeight,
    }, this.climbZones);
    if (ladderTraversal.consumed) {
      this.localPosition.set(
        ladderTraversal.position.x,
        ladderTraversal.position.y,
        ladderTraversal.position.z,
      );
      this.activeLadderId = ladderTraversal.activeLadderId;
      this.floorEyeHeight = ladderTraversal.floorEyeY;
      this.verticalVelocity = 0;
      input.consumeJump();
      this.safePosition.set(
        ladderTraversal.position.x,
        ladderTraversal.floorEyeY,
        ladderTraversal.position.z,
      );
      this.placeCamera();
      return;
    }

    this.integrate(delta, input.consumeJump());
  }

  updatePassive(delta: number): void {
    this.movement.set(0, 0, 0);
    this.integrate(delta, false);
  }

  private integrate(delta: number, jumpRequested: boolean): void {
    const currentSupport = findSupportEyeHeight(
      this.localPosition,
      0.35,
      this.floorEyeHeight,
      this.colliders,
    );
    const grounded = this.localPosition.y <= currentSupport + GROUND_EPSILON
      && this.verticalVelocity <= 0;
    if (jumpRequested && grounded) this.verticalVelocity = JUMP_SPEED;

    const nextY = this.localPosition.y
      + this.verticalVelocity * delta
      - 0.5 * GRAVITY * delta * delta;
    this.verticalVelocity -= GRAVITY * delta;

    const current: LocalPlayerPosition = {
      x: this.localPosition.x,
      y: this.localPosition.y,
      z: this.localPosition.z,
    };
    const desired: LocalPlayerPosition = {
      x: current.x + this.movement.x,
      y: Math.max(this.floorEyeHeight, nextY),
      z: current.z + this.movement.z,
    };
    const resolved = resolveLocalMovement(
      current,
      desired,
      0.35,
      this.colliders,
      this.arcColliders,
    );
    const supportedByActiveElevatedFloor = this.climbZones.some((zone) =>
      Math.abs(zone.topEyeY - this.floorEyeHeight) <= GROUND_EPSILON
      && containsElevatedFloor(zone.topFloor, resolved));
    if (
      this.floorEyeHeight > this.baseDeckEyeHeight + GROUND_EPSILON
      && !supportedByActiveElevatedFloor
    ) {
      this.floorEyeHeight = this.baseDeckEyeHeight;
      resolved.y = Math.max(this.floorEyeHeight, nextY);
    }
    const support = findSupportEyeHeight(
      resolved,
      0.35,
      this.floorEyeHeight,
      this.colliders,
    );
    if (
      this.verticalVelocity <= 0
      && current.y >= support - GROUND_EPSILON
      && resolved.y <= support + GROUND_EPSILON
    ) {
      resolved.y = support;
      this.verticalVelocity = 0;
    }
    this.localPosition.set(resolved.x, resolved.y, resolved.z);

    if (containsLocalPosition(this.navigationBounds.safe, this.localPosition)) {
      this.safePosition.set(this.localPosition.x, this.floorEyeHeight, this.localPosition.z);
    }
    if (!containsLocalPosition(this.navigationBounds.fall, this.localPosition)) {
      this.localPosition.copy(this.safePosition);
      this.verticalVelocity = 0;
      this.onFall();
    }

    this.placeCamera();
  }

  placeCamera(): void {
    this.worldPosition.copy(this.localPosition);
    this.ship.localToWorld(this.worldPosition);
    this.camera.position.copy(this.worldPosition);
    this.localViewEuler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.localView.setFromEuler(this.localViewEuler);
    this.camera.quaternion.copy(this.ship.quaternion).multiply(this.localView);
    this.camera.updateMatrixWorld(true);
  }

  reset(start: Vector3): void {
    this.localPosition.copy(start);
    this.safePosition.copy(start);
    this.floorEyeHeight = start.y;
    this.activeLadderId = null;
    this.verticalVelocity = 0;
    this.yaw = DEFAULT_YAW;
    this.pitch = 0;
  }
}

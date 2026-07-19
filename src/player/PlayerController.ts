import { Euler, Object3D, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { InputController } from '../input/InputController';
import type { CollisionArc, CollisionBox, LocalPlayerPosition } from './collisions';
import {
  findSupportEyeHeight,
  resolveLocalMovement,
} from './collisions';

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

export class PlayerController {
  readonly localPosition: Vector3;
  private readonly safePosition: Vector3;
  private yaw = DEFAULT_YAW;
  private pitch = 0;
  private readonly localView = new Quaternion();
  private readonly worldPosition = new Vector3();
  private readonly movement = new Vector3();
  private deckEyeHeight: number;
  private verticalVelocity = 0;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly ship: Object3D,
    start: Vector3,
    private readonly colliders: readonly CollisionBox[],
    private readonly navigationBounds: PlayerNavigationBounds,
    private readonly onFall: () => void,
    private readonly arcColliders: readonly CollisionArc[] = [],
  ) {
    this.localPosition = start.clone();
    this.safePosition = start.clone();
    this.deckEyeHeight = start.y;
  }

  update(delta: number, input: InputController, reducedMotionShake = 0): void {
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

    const currentSupport = findSupportEyeHeight(
      this.localPosition,
      0.35,
      this.deckEyeHeight,
      this.colliders,
    );
    const grounded = this.localPosition.y <= currentSupport + GROUND_EPSILON
      && this.verticalVelocity <= 0;
    if (input.consumeJump() && grounded) this.verticalVelocity = JUMP_SPEED;

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
      y: Math.max(this.deckEyeHeight, nextY),
      z: current.z + this.movement.z,
    };
    const resolved = resolveLocalMovement(
      current,
      desired,
      0.35,
      this.colliders,
      this.arcColliders,
    );
    const support = findSupportEyeHeight(
      resolved,
      0.35,
      this.deckEyeHeight,
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
      this.safePosition.set(this.localPosition.x, this.deckEyeHeight, this.localPosition.z);
    }
    if (!containsLocalPosition(this.navigationBounds.fall, this.localPosition)) {
      this.localPosition.copy(this.safePosition);
      this.verticalVelocity = 0;
      this.onFall();
    }

    this.placeCamera(reducedMotionShake);
  }

  placeCamera(reducedMotionShake = 0): void {
    this.worldPosition.copy(this.localPosition);
    this.ship.localToWorld(this.worldPosition);
    this.camera.position.copy(this.worldPosition);
    this.localView.setFromEuler(new Euler(this.pitch + reducedMotionShake, this.yaw, 0, 'YXZ'));
    this.camera.quaternion.copy(this.ship.quaternion).multiply(this.localView);
    this.camera.updateMatrixWorld(true);
  }

  reset(start: Vector3): void {
    this.localPosition.copy(start);
    this.safePosition.copy(start);
    this.deckEyeHeight = start.y;
    this.verticalVelocity = 0;
    this.yaw = DEFAULT_YAW;
    this.pitch = 0;
  }
}

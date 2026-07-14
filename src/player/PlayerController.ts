import { Euler, Object3D, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { InputController } from '../input/InputController';
import type { CollisionBox, LocalPlayerPosition } from './collisions';
import { resolveLocalMovement } from './collisions';

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
  private yaw = Math.PI;
  private pitch = 0;
  private readonly localView = new Quaternion();
  private readonly worldPosition = new Vector3();
  private readonly movement = new Vector3();

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly ship: Object3D,
    start: Vector3,
    private readonly colliders: readonly CollisionBox[],
    private readonly navigationBounds: PlayerNavigationBounds,
    private readonly onFall: () => void,
  ) {
    this.localPosition = start.clone();
    this.safePosition = start.clone();
  }

  update(delta: number, input: InputController, reducedMotionShake = 0): void {
    const look = input.consumeLook();
    this.yaw -= look.x * 0.0018;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch - look.y * 0.0018));

    const axes = input.movement;
    const speed = input.sprinting ? 6.2 : 3.8;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    this.movement.set(
      (axes.x * cos + axes.z * sin) * speed * delta,
      0,
      (-axes.x * sin + axes.z * cos) * speed * delta,
    );

    const current: LocalPlayerPosition = {
      x: this.localPosition.x,
      y: this.localPosition.y,
      z: this.localPosition.z,
    };
    const desired: LocalPlayerPosition = {
      x: current.x + this.movement.x,
      y: current.y,
      z: current.z + this.movement.z,
    };
    const resolved = resolveLocalMovement(current, desired, 0.35, this.colliders);
    this.localPosition.set(resolved.x, resolved.y, resolved.z);

    if (containsLocalPosition(this.navigationBounds.safe, this.localPosition)) {
      this.safePosition.copy(this.localPosition);
    }
    if (!containsLocalPosition(this.navigationBounds.fall, this.localPosition)) {
      this.localPosition.copy(this.safePosition);
      this.onFall();
    }

    this.worldPosition.copy(this.localPosition);
    this.ship.localToWorld(this.worldPosition);
    this.camera.position.copy(this.worldPosition);
    this.localView.setFromEuler(new Euler(this.pitch + reducedMotionShake, this.yaw, 0, 'YXZ'));
    this.camera.quaternion.copy(this.ship.quaternion).multiply(this.localView);
  }

  reset(start: Vector3): void {
    this.localPosition.copy(start);
    this.safePosition.copy(start);
    this.yaw = Math.PI;
    this.pitch = 0;
  }
}

import { Euler, Matrix4, Object3D, Quaternion, Vector3 } from 'three';

export class StationaryEventCamera {
  private readonly basePosition = new Vector3();
  private readonly baseQuaternion = new Quaternion();
  private readonly offsetEuler = new Euler(0, 0, 0, 'YXZ');
  private readonly offsetQuaternion = new Quaternion();
  private readonly lookMatrix = new Matrix4();
  private readonly cameraWorldPosition = new Vector3();
  private readonly targetWorldPosition = new Vector3();
  private readonly worldUp = new Vector3();
  private readonly parentWorldQuaternion = new Quaternion();
  private readonly lookWorldQuaternion = new Quaternion();
  private readonly lookLocalQuaternion = new Quaternion();
  private readonly baseInverseQuaternion = new Quaternion();
  private readonly targetLocalPosition = new Vector3();
  private readonly targetDirection = new Vector3();
  private readonly cameraTravel = new Vector3();
  private captured = false;

  constructor(private readonly camera: Object3D) {}

  capture(): void {
    this.basePosition.copy(this.camera.position);
    this.baseQuaternion.copy(this.camera.quaternion);
    this.baseInverseQuaternion.copy(this.baseQuaternion).invert();
    this.captured = true;
  }

  apply(yaw: number, pitch: number, roll = 0): void {
    if (!this.captured) this.capture();
    this.camera.position.copy(this.basePosition);
    this.applyRotation(yaw, pitch, roll);
  }

  private applyRotation(yaw: number, pitch: number, roll = 0): void {
    this.offsetEuler.set(pitch, yaw, roll, 'YXZ');
    this.offsetQuaternion.setFromEuler(this.offsetEuler);
    this.camera.quaternion
      .copy(this.baseQuaternion)
      .multiply(this.offsetQuaternion);
  }

  applyLookAt(target: Object3D, strength = 1): void {
    if (!this.captured) this.capture();
    this.camera.position.copy(this.basePosition);
    this.camera.updateWorldMatrix(true, false);
    target.updateWorldMatrix(true, false);
    this.camera.getWorldPosition(this.cameraWorldPosition);
    target.getWorldPosition(this.targetWorldPosition);
    if (this.cameraWorldPosition.distanceToSquared(this.targetWorldPosition) <= 1e-8) {
      this.camera.quaternion.copy(this.baseQuaternion);
      return;
    }

    const parent = this.camera.parent;
    this.worldUp.copy(this.camera.up);
    if (parent !== null) {
      parent.getWorldQuaternion(this.parentWorldQuaternion);
      this.worldUp.applyQuaternion(this.parentWorldQuaternion);
    }
    this.lookMatrix.lookAt(
      this.cameraWorldPosition,
      this.targetWorldPosition,
      this.worldUp,
    );
    this.lookWorldQuaternion.setFromRotationMatrix(this.lookMatrix);
    if (parent === null) {
      this.lookLocalQuaternion.copy(this.lookWorldQuaternion);
    } else {
      this.parentWorldQuaternion.invert();
      this.lookLocalQuaternion.copy(this.parentWorldQuaternion)
        .multiply(this.lookWorldQuaternion);
    }
    this.camera.quaternion.copy(this.baseQuaternion).slerp(
      this.lookLocalQuaternion,
      Math.max(0, Math.min(1, strength)),
    );
  }

  applyLookAtWithFixedYaw(
    target: Object3D,
    yaw: number,
    strength = 1,
    forwardTravel = 0,
  ): void {
    if (!this.captured) this.capture();
    const clampedStrength = Math.max(0, Math.min(1, strength));
    this.camera.position.copy(this.basePosition);
    this.cameraTravel.set(0, 0, -forwardTravel * clampedStrength)
      .applyQuaternion(this.baseQuaternion);
    this.camera.position.add(this.cameraTravel);
    this.camera.updateWorldMatrix(true, false);
    target.updateWorldMatrix(true, false);
    target.getWorldPosition(this.targetWorldPosition);
    this.targetLocalPosition.copy(this.targetWorldPosition);
    this.camera.parent?.worldToLocal(this.targetLocalPosition);
    this.targetDirection.copy(this.targetLocalPosition)
      .sub(this.camera.position)
      .applyQuaternion(this.baseInverseQuaternion);
    const horizontalDistance = Math.hypot(
      this.targetDirection.x,
      this.targetDirection.z,
    );
    const pitch = Math.atan2(this.targetDirection.y, horizontalDistance);
    this.applyRotation(yaw * clampedStrength, pitch * clampedStrength);
  }

  restore(): void {
    if (!this.captured) return;
    this.camera.position.copy(this.basePosition);
    this.camera.quaternion.copy(this.baseQuaternion);
    this.captured = false;
  }
}

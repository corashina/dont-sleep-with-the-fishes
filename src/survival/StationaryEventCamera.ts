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
  private captured = false;

  constructor(private readonly camera: Object3D) {}

  capture(): void {
    this.basePosition.copy(this.camera.position);
    this.baseQuaternion.copy(this.camera.quaternion);
    this.captured = true;
  }

  apply(yaw: number, pitch: number, roll = 0): void {
    if (!this.captured) this.capture();
    this.camera.position.copy(this.basePosition);
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

  restore(): void {
    if (!this.captured) return;
    this.camera.position.copy(this.basePosition);
    this.camera.quaternion.copy(this.baseQuaternion);
    this.captured = false;
  }
}

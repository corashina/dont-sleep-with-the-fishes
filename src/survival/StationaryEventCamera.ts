import { Euler, Object3D, Quaternion, Vector3 } from 'three';

export class StationaryEventCamera {
  private readonly basePosition = new Vector3();
  private readonly baseQuaternion = new Quaternion();
  private readonly offsetEuler = new Euler(0, 0, 0, 'YXZ');
  private readonly offsetQuaternion = new Quaternion();
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

  restore(): void {
    if (!this.captured) return;
    this.camera.position.copy(this.basePosition);
    this.camera.quaternion.copy(this.baseQuaternion);
    this.captured = false;
  }
}

import { Euler, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import type { EventItemUseSample } from './eventItemUseChoreography';
import { NET_ATTACK_CONTACT, NET_ATTACK_GRIP } from './netAttackChoreography';

/** Places the shared swing around the handle, in the target's direction. */
export class NetAttackPose {
  private readonly grip = new Vector3();
  private readonly target = new Vector3();
  private readonly contactGrip = new Vector3();
  private readonly offset = new Vector3();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly up = new Vector3();
  private readonly cameraRotation = new Quaternion();
  private readonly targetRotation = new Quaternion();
  private readonly aimRotation = new Quaternion();
  private readonly rotation = new Quaternion();
  private readonly swingRotation = new Quaternion();
  private readonly parentRotation = new Quaternion();
  private readonly basis = new Matrix4();
  private readonly angles = new Euler(0, 0, 0, 'YXZ');

  apply(root: Object3D, sample: Readonly<EventItemUseSample>, cameraMatrix: Matrix4, target: Object3D | null): void {
    if (sample.cameraSpaceBlend <= 0) return;
    root.updateWorldMatrix(true, false);
    root.getWorldPosition(this.position);
    root.getWorldQuaternion(this.rotation);
    root.getWorldScale(this.scale);
    this.cameraRotation.setFromRotationMatrix(cameraMatrix);
    this.grip.set(sample.viewX, sample.viewY, sample.viewZ).applyMatrix4(cameraMatrix);
    this.aimRotation.copy(this.cameraRotation);
    if (target !== null) {
      target.updateWorldMatrix(true, false);
      target.getWorldPosition(this.target);
      this.up.set(0, 1, 0).applyQuaternion(this.cameraRotation);
      this.basis.lookAt(this.grip, this.target, this.up);
      this.aimRotation.setFromRotationMatrix(this.basis);
      this.offset.set(
        NET_ATTACK_CONTACT[0] - NET_ATTACK_GRIP[0],
        NET_ATTACK_CONTACT[1] - NET_ATTACK_GRIP[1],
        NET_ATTACK_CONTACT[2] - NET_ATTACK_GRIP[2],
      ).multiply(this.scale).applyQuaternion(this.aimRotation);
      this.contactGrip.copy(this.target).sub(this.offset);
      this.grip.lerp(this.contactGrip, sample.targetBlend);
    }
    this.targetRotation.copy(this.cameraRotation).slerp(this.aimRotation, sample.aimBlend);
    this.angles.set(sample.pitch, sample.yaw, sample.roll, 'YXZ');
    this.swingRotation.setFromEuler(this.angles);
    this.targetRotation.multiply(this.swingRotation);
    this.rotation.slerp(this.targetRotation, sample.cameraSpaceBlend);
    this.offset.set(...NET_ATTACK_GRIP).multiply(this.scale).applyQuaternion(this.rotation);
    this.grip.sub(this.offset);
    this.position.lerp(this.grip, sample.cameraSpaceBlend);
    if (root.parent !== null) {
      root.parent.worldToLocal(this.position);
      root.parent.getWorldQuaternion(this.parentRotation).invert();
      this.rotation.premultiply(this.parentRotation);
    }
    root.position.copy(this.position);
    root.quaternion.copy(this.rotation);
  }
}

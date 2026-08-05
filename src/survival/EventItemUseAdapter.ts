import {
  Matrix4,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';
import type { ItemId } from '../game/ItemState';
import type {
  BorrowedSupplyActor,
  MutableSupplyPose,
} from './BoatSupplyDisplay';
import { EventItemEffects } from './EventItemEffects';
import { StationaryEventCamera } from './StationaryEventCamera';
import type { EventItemUseSample } from './eventItemUseChoreography';
import {
  eventItemMotionProfile,
  type EventItemMotionProfile,
} from './eventItemMotionProfile';

const IDENTITY_POSE: MutableSupplyPose = {
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1,
};
const THROW_WATER_CONTACT_Y = 0.04;
const THROW_FALLBACK_DISTANCE = 6;

/** Adapts sampled item-use poses to a borrowed supply actor. */
export class EventItemUseAdapter {
  private readonly cameraLook: StationaryEventCamera;
  private readonly storedActorPosition = new Vector3();
  private readonly cameraSpacePosition = new Vector3();
  private readonly actorParentPosition = new Vector3();
  private readonly targetWorldPosition = new Vector3();
  private readonly actorWorldPosition = new Vector3();
  private readonly actionOriginPosition = new Vector3();
  private readonly actionOriginOffset = new Vector3();
  private readonly currentWorldForward = new Vector3();
  private readonly targetDirection = new Vector3();
  private readonly fallbackTargetDirection = new Vector3();
  private readonly cameraWorldMatrix = new Matrix4();
  private readonly actorParentWorldInverse = new Matrix4();
  private readonly actorWorldQuaternion = new Quaternion();
  private readonly aimDeltaQuaternion = new Quaternion();
  private readonly solvedWorldQuaternion = new Quaternion();
  private readonly actorParentWorldQuaternion = new Quaternion();
  private readonly actorParentQuaternion = new Quaternion();
  private readonly facingWorldQuaternion = new Quaternion();
  private readonly facingTargetQuaternion = new Quaternion();
  private readonly facingCameraPosition = new Vector3();
  private readonly facingNormal = new Vector3();
  private readonly facingRight = new Vector3();
  private readonly facingDown = new Vector3();
  private readonly facingBasis = new Matrix4();
  private readonly pose: MutableSupplyPose = {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
  };
  private actor: BorrowedSupplyActor | null = null;
  private profile: EventItemMotionProfile | null = null;
  private aimTarget: Object3D | null = null;
  private faceCamera = false;
  private baseFieldOfView: number;
  private active = false;
  private disposed = false;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly effects: EventItemEffects,
  ) {
    this.cameraLook = new StationaryEventCamera(camera);
    this.baseFieldOfView = camera.fov;
  }

  begin(
    actor: BorrowedSupplyActor,
    itemId: ItemId,
    aimTarget: Object3D | null,
  ): void {
    if (this.disposed) return;
    this.clear();
    this.actor = actor;
    this.profile = eventItemMotionProfile(itemId);
    this.effects.setHeldItem(itemId);
    this.aimTarget = aimTarget;
    this.faceCamera = itemId === 'map';
    this.storedActorPosition.copy(actor.root.position);
    this.baseFieldOfView = this.camera.fov;
    this.cameraLook.capture();
    this.active = true;
  }

  setAimTarget(aimTarget: Object3D | null): void {
    if (this.disposed) return;
    this.aimTarget = aimTarget;
  }

  apply(sample: Readonly<EventItemUseSample>): void {
    const actor = this.actor;
    const profile = this.profile;
    if (this.disposed || !this.active || actor === null || profile === null) return;

    this.cameraLook.apply(sample.cameraYaw, sample.cameraPitch);
    this.applyFieldOfView(sample.fovScale);
    this.camera.updateWorldMatrix(true, false);
    this.cameraWorldMatrix.copy(this.camera.matrixWorld);
    this.cameraSpacePosition
      .set(sample.viewX, sample.viewY, sample.viewZ)
      .applyMatrix4(this.cameraWorldMatrix);

    const parent = actor.root.parent;
    this.actorParentPosition.copy(this.cameraSpacePosition);
    if (parent !== null) {
      parent.updateWorldMatrix(true, false);
      this.actorParentWorldInverse.copy(parent.matrixWorld).invert();
      this.actorParentPosition.applyMatrix4(this.actorParentWorldInverse);
    }
    this.actorParentPosition.sub(this.storedActorPosition)
      .multiplyScalar(sample.cameraSpaceBlend);

    this.pose.x = this.actorParentPosition.x;
    this.pose.y = this.actorParentPosition.y;
    this.pose.z = this.actorParentPosition.z;
    this.pose.yaw = sample.yaw;
    this.pose.pitch = sample.pitch;
    this.pose.roll = sample.roll;
    this.pose.scaleX = sample.scaleX;
    this.pose.scaleY = sample.scaleY;
    this.pose.scaleZ = sample.scaleZ;
    actor.applyPose(this.pose);
    this.applyTargetTravel(sample, actor, profile);
    this.applyCameraFacing(sample, actor);
    this.applyAim(sample, actor, profile);
    this.effects.apply(sample, actor.root);
    actor.root.visible = sample.itemVisible;
  }

  clear(): void {
    if (this.disposed) return;
    this.effects.setHeldItem(null);
    this.effects.clear();
    if (!this.active) return;
    this.actor?.applyPose(IDENTITY_POSE);
    this.cameraLook.restore();
    this.restoreFieldOfView();
    this.actor = null;
    this.profile = null;
    this.aimTarget = null;
    this.faceCamera = false;
    this.active = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.effects.dispose();
  }

  private applyFieldOfView(fovScale: number): void {
    const fieldOfView = this.baseFieldOfView * fovScale;
    if (this.camera.fov === fieldOfView) return;
    this.camera.fov = fieldOfView;
    this.camera.updateProjectionMatrix();
  }

  private restoreFieldOfView(): void {
    if (this.camera.fov === this.baseFieldOfView) return;
    this.camera.fov = this.baseFieldOfView;
    this.camera.updateProjectionMatrix();
  }

  private applyTargetTravel(
    sample: Readonly<EventItemUseSample>,
    actor: BorrowedSupplyActor,
    profile: EventItemMotionProfile,
  ): void {
    const aimTarget = this.aimTarget;
    if (sample.targetBlend <= 0) return;

    if (aimTarget === null) {
      if (!sample.ballisticFlight) return;
      this.camera.getWorldPosition(this.targetWorldPosition);
      this.camera.getWorldDirection(this.fallbackTargetDirection);
      this.targetWorldPosition.addScaledVector(
        this.fallbackTargetDirection,
        THROW_FALLBACK_DISTANCE,
      );
    } else {
      aimTarget.updateWorldMatrix(true, false);
      aimTarget.getWorldPosition(this.targetWorldPosition);
    }
    if (sample.ballisticFlight) {
      this.targetWorldPosition.y = THROW_WATER_CONTACT_Y;
    }
    const horizontalDistance = Math.hypot(
      this.targetWorldPosition.x - this.cameraSpacePosition.x,
      this.targetWorldPosition.z - this.cameraSpacePosition.z,
    );
    this.cameraSpacePosition.lerp(this.targetWorldPosition, sample.targetBlend);
    if (sample.ballisticFlight) {
      const arcHeight = Math.min(2.2, Math.max(0.5, horizontalDistance * 0.14));
      this.cameraSpacePosition.y += sample.flightArc * arcHeight;
    }

    actor.root.updateWorldMatrix(true, false);
    actor.root.getWorldPosition(this.actorWorldPosition);
    this.actionOriginPosition
      .set(
        profile.actionOrigin[0],
        profile.actionOrigin[1],
        profile.actionOrigin[2],
      )
      .applyMatrix4(actor.root.matrixWorld);
    this.actionOriginOffset.subVectors(
      this.actionOriginPosition,
      this.actorWorldPosition,
    );
    this.cameraSpacePosition.sub(this.actionOriginOffset);

    this.actorParentPosition.copy(this.cameraSpacePosition);
    const parent = actor.root.parent;
    if (parent !== null) {
      parent.updateWorldMatrix(true, false);
      this.actorParentWorldInverse.copy(parent.matrixWorld).invert();
      this.actorParentPosition.applyMatrix4(this.actorParentWorldInverse);
    }
    this.actorParentPosition.sub(this.storedActorPosition);
    this.pose.x = this.actorParentPosition.x;
    this.pose.y = this.actorParentPosition.y;
    this.pose.z = this.actorParentPosition.z;
    actor.applyPose(this.pose);
  }

  private applyAim(
    sample: Readonly<EventItemUseSample>,
    actor: BorrowedSupplyActor,
    profile: EventItemMotionProfile,
  ): void {
    const aimTarget = this.aimTarget;
    if (
      sample.aimBlend <= 0
      || profile.aim === 'none'
      || aimTarget === null
    ) return;

    aimTarget.updateWorldMatrix(true, false);
    aimTarget.getWorldPosition(this.targetWorldPosition);
    actor.root.updateWorldMatrix(true, false);
    actor.root.getWorldPosition(this.actorWorldPosition);
    this.targetDirection.subVectors(
      this.targetWorldPosition,
      this.actorWorldPosition,
    );
    if (profile.aim === 'horizontal-entity') {
      this.targetDirection.y = 0;
    }
    if (this.targetDirection.lengthSq() === 0) return;
    this.targetDirection.normalize();
    actor.root.getWorldQuaternion(this.actorWorldQuaternion);
    this.currentWorldForward
      .set(profile.forward[0], profile.forward[1], profile.forward[2])
      .applyQuaternion(this.actorWorldQuaternion)
      .normalize();
    this.aimDeltaQuaternion.setFromUnitVectors(
      this.currentWorldForward,
      this.targetDirection,
    );
    this.solvedWorldQuaternion
      .copy(this.aimDeltaQuaternion)
      .multiply(this.actorWorldQuaternion);
    this.actorWorldQuaternion.slerp(this.solvedWorldQuaternion, sample.aimBlend);

    const parent = actor.root.parent;
    if (parent === null) {
      this.actorParentQuaternion.copy(this.actorWorldQuaternion);
    } else {
      parent.updateWorldMatrix(true, false);
      parent.getWorldQuaternion(this.actorParentWorldQuaternion).invert();
      this.actorParentQuaternion
        .copy(this.actorParentWorldQuaternion)
        .multiply(this.actorWorldQuaternion);
    }
    actor.root.quaternion.copy(this.actorParentQuaternion);
  }

  private applyCameraFacing(
    sample: Readonly<EventItemUseSample>,
    actor: BorrowedSupplyActor,
  ): void {
    if (!this.faceCamera || sample.cameraSpaceBlend <= 0) return;

    actor.root.updateWorldMatrix(true, false);
    actor.root.getWorldQuaternion(this.facingWorldQuaternion);
    actor.root.getWorldPosition(this.actorWorldPosition);
    this.camera.getWorldPosition(this.facingCameraPosition);
    this.facingNormal.subVectors(
      this.facingCameraPosition,
      this.actorWorldPosition,
    );
    if (this.facingNormal.lengthSq() === 0) return;
    this.facingNormal.normalize();

    this.camera.getWorldQuaternion(this.facingTargetQuaternion);
    this.facingRight.set(1, 0, 0)
      .applyQuaternion(this.facingTargetQuaternion)
      .addScaledVector(
        this.facingNormal,
        -this.facingRight.dot(this.facingNormal),
      );
    if (this.facingRight.lengthSq() === 0) return;
    this.facingRight.normalize();
    this.facingDown.crossVectors(this.facingRight, this.facingNormal).normalize();
    this.facingBasis.makeBasis(
      this.facingRight,
      this.facingNormal,
      this.facingDown,
    );
    this.facingTargetQuaternion.setFromRotationMatrix(this.facingBasis);
    this.facingWorldQuaternion.slerp(
      this.facingTargetQuaternion,
      sample.cameraSpaceBlend,
    );

    const parent = actor.root.parent;
    if (parent === null) {
      actor.root.quaternion.copy(this.facingWorldQuaternion);
      return;
    }
    parent.updateWorldMatrix(true, false);
    parent.getWorldQuaternion(this.actorParentWorldQuaternion).invert();
    this.actorParentQuaternion
      .copy(this.actorParentWorldQuaternion)
      .multiply(this.facingWorldQuaternion);
    actor.root.quaternion.copy(this.actorParentQuaternion);
  }
}

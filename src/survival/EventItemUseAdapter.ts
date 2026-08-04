import {
  Matrix4,
  PerspectiveCamera,
  Vector3,
} from 'three';
import type {
  BorrowedSupplyActor,
  MutableSupplyPose,
} from './BoatSupplyDisplay';
import { EventItemEffects } from './EventItemEffects';
import { StationaryEventCamera } from './StationaryEventCamera';
import type { EventItemUseSample } from './eventItemUseChoreography';

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

/** Adapts sampled item-use poses to a borrowed supply actor. */
export class EventItemUseAdapter {
  private readonly cameraLook: StationaryEventCamera;
  private readonly storedActorPosition = new Vector3();
  private readonly cameraSpacePosition = new Vector3();
  private readonly actorParentPosition = new Vector3();
  private readonly cameraWorldMatrix = new Matrix4();
  private readonly actorParentWorldInverse = new Matrix4();
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

  begin(actor: BorrowedSupplyActor): void {
    if (this.disposed) return;
    this.clear();
    this.actor = actor;
    this.storedActorPosition.copy(actor.root.position);
    this.baseFieldOfView = this.camera.fov;
    this.cameraLook.capture();
    this.active = true;
  }

  apply(sample: Readonly<EventItemUseSample>): void {
    const actor = this.actor;
    if (this.disposed || !this.active || actor === null) return;

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
    this.effects.apply(sample, actor.root);
  }

  clear(): void {
    if (this.disposed) return;
    this.effects.clear();
    if (!this.active) return;
    this.actor?.applyPose(IDENTITY_POSE);
    this.cameraLook.restore();
    this.restoreFieldOfView();
    this.actor = null;
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
}

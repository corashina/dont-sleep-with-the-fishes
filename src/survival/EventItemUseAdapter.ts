import {
  BackSide,
  DoubleSide,
  Euler,
  Material,
  Matrix4,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { ItemId } from '../game/ItemState';
import { lifeboatHullHalfWidthAt } from '../world/Lifeboat';
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
const ANCHOR_WATER_Z = 0.55;
const ANCHOR_WATER_X = (lifeboatHullHalfWidthAt(ANCHOR_WATER_Z) ?? 1.63) + 0.48;
const BUCKET_WATER_X = (lifeboatHullHalfWidthAt(ANCHOR_WATER_Z) ?? 1.63) + 0.82;
const BUCKET_HELMET_COVERAGE_RADIUS = 0.48;
const BUCKET_HELMET_COVERAGE_START = 0.9;
export const BUCKET_HELMET_COVERAGE_NAME = 'bucket-helmet-interior-coverage';
type CameraFacingSurface = 'none' | 'x' | 'y' | 'z';

interface InteriorMaterialBinding {
  readonly mesh: Mesh;
  readonly original: Material | Material[];
}

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
  private readonly heldCameraLocalMatrix = new Matrix4();
  private readonly heldCameraWorldMatrix = new Matrix4();
  private readonly heldCameraWorldPosition = new Vector3();
  private readonly heldCameraWorldQuaternion = new Quaternion();
  private readonly heldCameraWorldScale = new Vector3();
  private readonly cameraWorldQuaternion = new Quaternion();
  private readonly cameraTargetWorldQuaternion = new Quaternion();
  private readonly actorParentWorldInverse = new Matrix4();
  private readonly actorWorldQuaternion = new Quaternion();
  private readonly storedActorWorldQuaternion = new Quaternion();
  private readonly aimDeltaQuaternion = new Quaternion();
  private readonly solvedWorldQuaternion = new Quaternion();
  private readonly actorParentWorldQuaternion = new Quaternion();
  private readonly actorParentQuaternion = new Quaternion();
  private readonly cameraAlignedEuler = new Euler(0, 0, 0, 'YXZ');
  private readonly facingWorldQuaternion = new Quaternion();
  private readonly facingTargetQuaternion = new Quaternion();
  private readonly facingDeltaQuaternion = new Quaternion();
  private readonly facingStepQuaternion = new Quaternion();
  private readonly facingCameraPosition = new Vector3();
  private readonly facingNormal = new Vector3();
  private readonly facingRight = new Vector3();
  private readonly facingDown = new Vector3();
  private readonly facingUp = new Vector3();
  private readonly facingAxis = new Vector3();
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
  private knifeAttack = false;
  private cameraFacingSurface: CameraFacingSurface = 'none';
  private lockItemToHeldCamera = false;
  private alignItemToCamera = false;
  private readonly interiorMaterialBindings: InteriorMaterialBinding[] = [];
  private readonly interiorMaterials = new Set<Material>();
  private interiorCoverage: Mesh | null = null;
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
    renderInterior = false,
    facingSurface: CameraFacingSurface | null = null,
    alignItemToCamera = false,
  ): void {
    if (this.disposed) return;
    this.clear();
    this.actor = actor;
    this.profile = eventItemMotionProfile(itemId);
    this.aimTarget = aimTarget;
    this.knifeAttack = itemId === 'knife';
    this.cameraFacingSurface = facingSurface ?? (itemId === 'map'
      ? 'y'
      : itemId === 'compass' || itemId === 'spyglass' ? 'z' : 'none');
    this.lockItemToHeldCamera = itemId === 'map';
    this.alignItemToCamera = alignItemToCamera;
    this.heldCameraLocalMatrix.compose(
      this.camera.position,
      this.camera.quaternion,
      this.camera.scale,
    );
    this.storedActorPosition.copy(actor.root.position);
    actor.root.updateWorldMatrix(true, false);
    actor.root.getWorldQuaternion(this.storedActorWorldQuaternion);
    this.baseFieldOfView = this.camera.fov;
    this.cameraLook.capture();
    if (renderInterior) {
      this.enableInteriorMaterials(actor.root);
      if (alignItemToCamera) this.enableInteriorCoverage();
    }
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
    this.applyCameraTarget(sample, actor);
    this.applyFieldOfView(sample.fovScale);
    this.camera.updateWorldMatrix(true, false);
    this.cameraWorldMatrix.copy(this.camera.matrixWorld);
    if (this.lockItemToHeldCamera) this.updateHeldCameraWorldTransform();
    this.cameraSpacePosition
      .set(sample.viewX, sample.viewY, sample.viewZ)
      .applyMatrix4(
        this.lockItemToHeldCamera
          ? this.heldCameraWorldMatrix
          : this.cameraWorldMatrix,
      );

    const parent = actor.root.parent;
    this.actorParentPosition.copy(this.cameraSpacePosition);
    if (parent !== null) {
      parent.updateWorldMatrix(true, false);
      this.actorParentWorldInverse.copy(parent.matrixWorld).invert();
      this.actorParentPosition.applyMatrix4(this.actorParentWorldInverse);
    }
    if (sample.cameraSpaceBlend === 0) {
      this.actorParentPosition.set(0, 0, 0);
    } else {
      this.actorParentPosition.sub(this.storedActorPosition)
        .multiplyScalar(sample.cameraSpaceBlend);
    }
    if (sample.minimumLiftY > 0) {
      this.actorParentPosition.y = Math.max(
        this.actorParentPosition.y,
        sample.minimumLiftY,
      );
    }

    this.pose.x = this.actorParentPosition.x;
    this.pose.y = this.actorParentPosition.y;
    this.pose.z = this.actorParentPosition.z;
    this.setPoseRotation(sample);
    this.pose.scaleX = sample.scaleX;
    this.pose.scaleY = sample.scaleY;
    this.pose.scaleZ = sample.scaleZ;
    actor.applyPose(this.pose);
    this.applyCameraAlignedRotation(sample, actor);
    this.applyKnifeAimBeforeTravel(sample, actor, profile);
    this.applyTargetTravel(sample, actor, profile);
    this.applyKnifeGripAfterTravel(sample, actor);
    this.applyCameraFacing(sample, actor);
    this.applyAim(sample, actor, profile);
    this.effects.apply(sample, actor.root);
    this.updateInteriorCoverage(sample.primaryEffect);
    actor.root.visible = sample.itemVisible;
  }

  clear(): void {
    if (this.disposed) return;
    this.effects.clear();
    if (!this.active) return;
    this.actor?.applyPose(IDENTITY_POSE);
    this.clearInteriorCoverage();
    this.restoreInteriorMaterials();
    this.cameraLook.restore();
    this.restoreFieldOfView();
    this.actor = null;
    this.profile = null;
    this.aimTarget = null;
    this.knifeAttack = false;
    this.cameraFacingSurface = 'none';
    this.lockItemToHeldCamera = false;
    this.alignItemToCamera = false;
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

  private readAimTargetWorldPosition(aimTarget: Object3D): void {
    aimTarget.updateWorldMatrix(true, false);
    aimTarget.getWorldPosition(this.targetWorldPosition);
  }

  private applyCameraAlignedRotation(
    sample: Readonly<EventItemUseSample>,
    actor: BorrowedSupplyActor,
  ): void {
    if (!this.alignItemToCamera || sample.cameraSpaceBlend <= 0) return;
    actor.root.updateWorldMatrix(true, false);
    actor.root.getWorldQuaternion(this.actorWorldQuaternion);
    this.camera.getWorldQuaternion(this.cameraWorldQuaternion);
    this.cameraAlignedEuler.set(sample.pitch, sample.yaw, sample.roll, 'YXZ');
    this.solvedWorldQuaternion
      .setFromEuler(this.cameraAlignedEuler)
      .premultiply(this.cameraWorldQuaternion);
    this.actorWorldQuaternion.slerp(
      this.solvedWorldQuaternion,
      sample.cameraSpaceBlend,
    );

    const parent = actor.root.parent;
    if (parent === null) {
      actor.root.quaternion.copy(this.actorWorldQuaternion);
      return;
    }
    parent.updateWorldMatrix(true, false);
    parent.getWorldQuaternion(this.actorParentWorldQuaternion).invert();
    actor.root.quaternion
      .copy(this.actorParentWorldQuaternion)
      .multiply(this.actorWorldQuaternion);
  }

  private enableInteriorMaterials(root: Object3D): void {
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const original = object.material;
      const clone = (material: Material): Material => {
        const interior = material.clone();
        interior.side = DoubleSide;
        interior.needsUpdate = true;
        this.interiorMaterials.add(interior);
        return interior;
      };
      this.interiorMaterialBindings.push({ mesh: object, original });
      object.material = Array.isArray(original)
        ? original.map(clone)
        : clone(original);
    });
  }

  private restoreInteriorMaterials(): void {
    for (const binding of this.interiorMaterialBindings) {
      binding.mesh.material = binding.original;
    }
    this.interiorMaterialBindings.length = 0;
    for (const material of this.interiorMaterials) material.dispose();
    this.interiorMaterials.clear();
  }

  private enableInteriorCoverage(): void {
    const source = this.interiorMaterials.values().next().value;
    if (source === undefined) return;
    const material = source.clone();
    material.side = BackSide;
    material.needsUpdate = true;
    const coverage = new Mesh(
      new SphereGeometry(BUCKET_HELMET_COVERAGE_RADIUS, 16, 12),
      material,
    );
    coverage.name = BUCKET_HELMET_COVERAGE_NAME;
    coverage.frustumCulled = false;
    coverage.visible = false;
    this.camera.add(coverage);
    this.interiorCoverage = coverage;
  }

  private updateInteriorCoverage(strength: number): void {
    if (this.interiorCoverage === null) return;
    this.interiorCoverage.visible = strength >= BUCKET_HELMET_COVERAGE_START;
  }

  private clearInteriorCoverage(): void {
    const coverage = this.interiorCoverage;
    if (coverage === null) return;
    coverage.removeFromParent();
    coverage.geometry.dispose();
    const materials = Array.isArray(coverage.material)
      ? coverage.material
      : [coverage.material];
    for (const material of materials) material.dispose();
    this.interiorCoverage = null;
  }

  private applyCameraTarget(
    sample: Readonly<EventItemUseSample>,
    actor: BorrowedSupplyActor,
  ): void {
    const blend = sample.cameraTargetBlend;
    if (blend <= 0) return;
    if (sample.flightTarget === 'starboard-water' || sample.flightTarget === 'bucket-water') {
      this.setStarboardWaterTarget(actor, sample.flightTarget);
    } else {
      const aimTarget = this.aimTarget;
      if (aimTarget === null) return;
      this.readAimTargetWorldPosition(aimTarget);
    }
    this.cameraWorldQuaternion.copy(this.camera.quaternion);
    this.camera.lookAt(this.targetWorldPosition);
    this.cameraTargetWorldQuaternion.copy(this.camera.quaternion);
    this.camera.quaternion
      .copy(this.cameraWorldQuaternion)
      .slerp(
      this.cameraTargetWorldQuaternion,
      Math.min(1, blend),
    );
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

    if (sample.flightTarget === 'starboard-water' || sample.flightTarget === 'bucket-water') {
      this.setStarboardWaterTarget(actor, sample.flightTarget);
    } else if (aimTarget === null) {
      if (!sample.ballisticFlight) return;
      this.camera.getWorldPosition(this.targetWorldPosition);
      this.camera.getWorldDirection(this.fallbackTargetDirection);
      this.targetWorldPosition.addScaledVector(
        this.fallbackTargetDirection,
        THROW_FALLBACK_DISTANCE,
      );
    } else {
      this.readAimTargetWorldPosition(aimTarget);
    }
    if (sample.ballisticFlight) {
      this.targetWorldPosition.y = THROW_WATER_CONTACT_Y;
    }
    const horizontalDistance = Math.hypot(
      this.targetWorldPosition.x - this.cameraSpacePosition.x,
      this.targetWorldPosition.z - this.cameraSpacePosition.z,
    );
    this.cameraSpacePosition.lerp(this.targetWorldPosition, sample.targetBlend);
    if (sample.flightArc > 0) {
      const arcHeight = sample.flightArcHeight > 0
        ? sample.flightArcHeight
        : Math.min(2.2, Math.max(0.5, horizontalDistance * 0.14));
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
    this.cameraSpacePosition.addScaledVector(
      this.actionOriginOffset,
      -sample.targetBlend,
    );

    this.actorParentPosition.copy(this.cameraSpacePosition);
    const parent = actor.root.parent;
    if (parent !== null) {
      parent.updateWorldMatrix(true, false);
      this.actorParentWorldInverse.copy(parent.matrixWorld).invert();
      this.actorParentPosition.applyMatrix4(this.actorParentWorldInverse);
    }
    this.actorParentPosition.sub(this.storedActorPosition);
    if (sample.minimumLiftY > 0) {
      this.actorParentPosition.y = Math.max(
        this.actorParentPosition.y,
        sample.minimumLiftY,
      );
    }
    this.pose.x = this.actorParentPosition.x;
    this.pose.y = this.actorParentPosition.y;
    this.pose.z = this.actorParentPosition.z;
    actor.applyPose(this.pose);
  }

  private setStarboardWaterTarget(
    actor: BorrowedSupplyActor,
    target: 'starboard-water' | 'bucket-water',
  ): void {
    this.targetWorldPosition.set(
      target === 'bucket-water' ? BUCKET_WATER_X : ANCHOR_WATER_X,
      0,
      ANCHOR_WATER_Z,
    );
    const actorParent = actor.root.parent;
    if (actorParent !== null) {
      actorParent.updateWorldMatrix(true, false);
      this.targetWorldPosition.applyMatrix4(actorParent.matrixWorld);
    }
    this.targetWorldPosition.y = THROW_WATER_CONTACT_Y;
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

    this.readAimTargetWorldPosition(aimTarget);
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

  private updateHeldCameraWorldTransform(): void {
    const parent = this.camera.parent;
    if (parent === null) {
      this.heldCameraWorldMatrix.copy(this.heldCameraLocalMatrix);
    } else {
      parent.updateWorldMatrix(true, false);
      this.heldCameraWorldMatrix.multiplyMatrices(
        parent.matrixWorld,
        this.heldCameraLocalMatrix,
      );
    }
    this.heldCameraWorldMatrix.decompose(
      this.heldCameraWorldPosition,
      this.heldCameraWorldQuaternion,
      this.heldCameraWorldScale,
    );
  }

  private applyCameraFacing(
    sample: Readonly<EventItemUseSample>,
    actor: BorrowedSupplyActor,
  ): void {
    if (
      this.cameraFacingSurface === 'none'
      || sample.surfaceFacing === 'none'
      || sample.cameraSpaceBlend <= 0
    ) return;

    actor.root.updateWorldMatrix(true, false);
    actor.root.getWorldQuaternion(this.facingWorldQuaternion);
    actor.root.getWorldPosition(this.actorWorldPosition);
    const targetPlane = sample.surfaceFacing === 'target-plane'
      || sample.surfaceFacing === 'target-plane-opposite';
    if (!this.resolveFacingNormal(sample, targetPlane)) return;
    if (!this.resolveFacingRight(targetPlane)) return;
    this.applyFacingRotation(sample, targetPlane);
    this.writeActorFacing(actor);
  }

  private resolveFacingNormal(
    sample: Readonly<EventItemUseSample>,
    targetPlane: boolean,
  ): boolean {
    if (targetPlane) {
      const aimTarget = this.aimTarget;
      if (aimTarget === null) return false;
      aimTarget.updateWorldMatrix(true, false);
      aimTarget.getWorldQuaternion(this.facingTargetQuaternion);
      this.facingRight.set(1, 0, 0).applyQuaternion(this.facingTargetQuaternion);
      this.facingNormal.set(0, 0, 1).applyQuaternion(this.facingTargetQuaternion);
      if (sample.surfaceFacing === 'target-plane-opposite') {
        this.facingNormal.multiplyScalar(-1);
      }
    } else if (sample.surfaceFacing === 'target') {
      const aimTarget = this.aimTarget;
      if (aimTarget === null) return false;
      aimTarget.updateWorldMatrix(true, false);
      aimTarget.getWorldPosition(this.targetWorldPosition);
      this.facingNormal.subVectors(
        this.targetWorldPosition,
        this.actorWorldPosition,
      );
    } else if (this.cameraFacingSurface === 'x') {
      this.camera.getWorldQuaternion(this.facingTargetQuaternion);
      this.facingNormal.set(0, 0, 1)
        .applyQuaternion(this.facingTargetQuaternion);
    } else if (this.lockItemToHeldCamera) {
      this.facingNormal.set(0, 0, 1)
        .applyQuaternion(this.heldCameraWorldQuaternion);
    } else {
      this.camera.getWorldPosition(this.facingCameraPosition);
      this.facingNormal.subVectors(
        this.facingCameraPosition,
        this.actorWorldPosition,
      );
    }
    if (this.facingNormal.lengthSq() === 0) return false;
    this.facingNormal.normalize();
    return true;
  }

  private resolveFacingRight(targetPlane: boolean): boolean {
    if (!targetPlane) {
      if (this.lockItemToHeldCamera) {
        this.facingTargetQuaternion.copy(this.heldCameraWorldQuaternion);
      } else {
        this.camera.getWorldQuaternion(this.facingTargetQuaternion);
      }
      this.facingRight.set(1, 0, 0)
        .applyQuaternion(this.facingTargetQuaternion)
        .addScaledVector(
          this.facingNormal,
          -this.facingRight.dot(this.facingNormal),
        );
    }
    if (this.facingRight.lengthSq() === 0) return false;
    this.facingRight.normalize();
    this.facingDown.crossVectors(this.facingRight, this.facingNormal).normalize();
    return true;
  }

  private applyFacingRotation(
    sample: Readonly<EventItemUseSample>,
    targetPlane: boolean,
  ): void {
    if (this.cameraFacingSurface === 'x') {
      this.facingBasis.makeBasis(
        this.facingNormal,
        this.facingDown,
        this.facingRight,
      );
    } else if (this.cameraFacingSurface === 'y') {
      this.facingBasis.makeBasis(
        this.facingRight,
        this.facingNormal,
        this.facingDown,
      );
    } else {
      this.facingUp.copy(this.facingDown).multiplyScalar(-1);
      this.facingBasis.makeBasis(
        this.facingRight,
        this.facingUp,
        this.facingNormal,
      );
    }
    this.facingTargetQuaternion.setFromRotationMatrix(this.facingBasis);
    const facingBlend = targetPlane || this.cameraFacingSurface === 'x'
      ? sample.aimBlend
      : sample.cameraSpaceBlend;
    if (this.cameraFacingSurface === 'x') {
      this.applyStableCameraFacingTurn(facingBlend);
    } else {
      this.facingWorldQuaternion.slerp(
        this.facingTargetQuaternion,
        facingBlend,
      );
    }
  }

  private applyKnifeAimBeforeTravel(
    sample: Readonly<EventItemUseSample>,
    actor: BorrowedSupplyActor,
    profile: EventItemMotionProfile,
  ): void {
    if (!this.knifeAttack || sample.targetBlend <= 0) return;
    this.applyAim(sample, actor, profile);
  }

  private applyKnifeGripAfterTravel(
    sample: Readonly<EventItemUseSample>,
    actor: BorrowedSupplyActor,
  ): void {
    if (!this.knifeAttack || sample.targetBlend <= 0) return;
    this.applyCameraAlignedRotation(sample, actor);
  }

  private setPoseRotation(sample: Readonly<EventItemUseSample>): void {
    this.pose.yaw = sample.yaw;
    this.pose.pitch = sample.pitch;
    this.pose.roll = sample.roll;
    if (!this.knifeAttack) return;
    this.pose.yaw = 0;
    this.pose.pitch = 0;
    this.pose.roll = 0;
  }

  private writeActorFacing(actor: BorrowedSupplyActor): void {
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

  private applyStableCameraFacingTurn(blend: number): void {
    this.actorWorldQuaternion.copy(this.storedActorWorldQuaternion).invert();
    this.facingDeltaQuaternion
      .copy(this.facingTargetQuaternion)
      .multiply(this.actorWorldQuaternion)
      .normalize();

    const delta = this.facingDeltaQuaternion;
    const dominantAxisComponent = Math.abs(delta.x) >= Math.abs(delta.y)
      ? Math.abs(delta.x) >= Math.abs(delta.z) ? delta.x : delta.z
      : Math.abs(delta.y) >= Math.abs(delta.z) ? delta.y : delta.z;
    if (dominantAxisComponent < 0) {
      delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
    }

    const axisLength = Math.hypot(delta.x, delta.y, delta.z);
    if (axisLength <= Number.EPSILON) {
      this.facingWorldQuaternion.copy(this.storedActorWorldQuaternion);
      return;
    }
    this.facingAxis.set(
      delta.x / axisLength,
      delta.y / axisLength,
      delta.z / axisLength,
    );
    const angle = 2 * Math.atan2(axisLength, delta.w);
    this.facingStepQuaternion
      .setFromAxisAngle(this.facingAxis, angle * blend);
    this.facingWorldQuaternion
      .copy(this.facingStepQuaternion)
      .multiply(this.storedActorWorldQuaternion);
  }
}

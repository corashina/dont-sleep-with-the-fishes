import type RAPIER from '@dimforge/rapier3d-deterministic-compat';
import type { CollisionBox } from '../player/collisions';
import type { PlayerNavigationBounds } from '../player/PlayerController';
import { FixedStepClock } from './FixedStepClock';
import type { PhysicsRuntime, PhysicsVector3 } from './PhysicsRuntime';

const PHYSICS_STEP_SECONDS = 1 / 60;
const MAX_PHYSICS_SUBSTEPS = 3;
const DECK_THICKNESS = 0.2;
const BARRIER_THICKNESS = 0.25;
const BARRIER_HEIGHT = 2;
const BARREL_RADIUS = 0.54;
const BARREL_HALF_HEIGHT = 0.55;
const BARREL_MASS = 35;
const BARREL_FRICTION = 0.65;
const BARREL_RESTITUTION = 0.05;
const BARREL_LINEAR_DAMPING = 0.15;
const BARREL_ANGULAR_DAMPING = 0.1;
const BARREL_SPAWN_LOCAL = { x: 6, y: 2.22 + 0.575, z: -6 };

interface MutablePhysicsVector3 {
  x: number;
  y: number;
  z: number;
}

interface MutablePhysicsQuaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

interface MutablePhysicsPose {
  translation: MutablePhysicsVector3;
  rotation: MutablePhysicsQuaternion;
}

export interface PhysicsQuaternion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export interface PhysicsPose {
  readonly translation: PhysicsVector3;
  readonly rotation: PhysicsQuaternion;
}

export interface ScavengePhysicsConfig {
  readonly colliders: readonly CollisionBox[];
  readonly safeBounds: PlayerNavigationBounds['safe'];
  readonly deckY: number;
  readonly shipWidth: number;
  readonly shipLength: number;
  readonly initialShipPose: PhysicsPose;
}

export interface ScavengePhysicsController {
  readonly barrelPose: PhysicsPose;
  update(shipPose: PhysicsPose, deltaSeconds: number, active: boolean): void;
  dispose(): void;
}

export function collisionBoxToCuboid(box: CollisionBox): {
  center: PhysicsVector3;
  halfExtents: PhysicsVector3;
} {
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  const length = box.maxZ - box.minZ;
  if (
    !Number.isFinite(width)
    || !Number.isFinite(height)
    || !Number.isFinite(length)
    || width <= 0
    || height <= 0
    || length <= 0
  ) {
    throw new Error('Physics collider must have finite positive extents');
  }
  return {
    center: {
      x: (box.minX + box.maxX) / 2,
      y: (box.minY + box.maxY) / 2,
      z: (box.minZ + box.maxZ) / 2,
    },
    halfExtents: {
      x: width / 2,
      y: height / 2,
      z: length / 2,
    },
  };
}

function copyVector(target: MutablePhysicsVector3, source: PhysicsVector3): void {
  target.x = source.x;
  target.y = source.y;
  target.z = source.z;
}

function copyNormalizedQuaternion(
  target: MutablePhysicsQuaternion,
  source: PhysicsQuaternion,
): void {
  const length = Math.hypot(source.x, source.y, source.z, source.w);
  if (!Number.isFinite(length) || length <= Number.EPSILON) {
    target.x = 0;
    target.y = 0;
    target.z = 0;
    target.w = 1;
    return;
  }
  const inverseLength = 1 / length;
  target.x = source.x * inverseLength;
  target.y = source.y * inverseLength;
  target.z = source.z * inverseLength;
  target.w = source.w * inverseLength;
}

function interpolateNormalizedQuaternion(
  target: MutablePhysicsQuaternion,
  start: PhysicsQuaternion,
  end: PhysicsQuaternion,
  fraction: number,
): void {
  const dot = start.x * end.x + start.y * end.y + start.z * end.z + start.w * end.w;
  const sign = dot < 0 ? -1 : 1;
  const inverseFraction = 1 - fraction;
  target.x = start.x * inverseFraction + end.x * fraction * sign;
  target.y = start.y * inverseFraction + end.y * fraction * sign;
  target.z = start.z * inverseFraction + end.z * fraction * sign;
  target.w = start.w * inverseFraction + end.w * fraction * sign;
  copyNormalizedQuaternion(target, target);
}

function localToWorld(
  target: MutablePhysicsVector3,
  local: PhysicsVector3,
  pose: PhysicsPose,
): void {
  const q = pose.rotation;
  const tx = 2 * (q.y * local.z - q.z * local.y);
  const ty = 2 * (q.z * local.x - q.x * local.z);
  const tz = 2 * (q.x * local.y - q.y * local.x);
  target.x = pose.translation.x + local.x + q.w * tx + q.y * tz - q.z * ty;
  target.y = pose.translation.y + local.y + q.w * ty + q.z * tx - q.x * tz;
  target.z = pose.translation.z + local.z + q.w * tz + q.x * ty - q.y * tx;
}

function worldToLocal(
  target: MutablePhysicsVector3,
  world: PhysicsVector3,
  pose: PhysicsPose,
): void {
  const x = world.x - pose.translation.x;
  const y = world.y - pose.translation.y;
  const z = world.z - pose.translation.z;
  const q = pose.rotation;
  const tx = 2 * (-q.y * z + q.z * y);
  const ty = 2 * (-q.z * x + q.x * z);
  const tz = 2 * (-q.x * y + q.y * x);
  target.x = x + q.w * tx - q.y * tz + q.z * ty;
  target.y = y + q.w * ty - q.z * tx + q.x * tz;
  target.z = z + q.w * tz - q.x * ty + q.y * tx;
}

function isFinitePose(translation: PhysicsVector3, rotation: PhysicsQuaternion): boolean {
  return Number.isFinite(translation.x)
    && Number.isFinite(translation.y)
    && Number.isFinite(translation.z)
    && Number.isFinite(rotation.x)
    && Number.isFinite(rotation.y)
    && Number.isFinite(rotation.z)
    && Number.isFinite(rotation.w);
}

export class ScavengePhysics implements ScavengePhysicsController {
  readonly barrelPose: MutablePhysicsPose = {
    translation: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  };

  readonly barrelLocalPositionForTest: MutablePhysicsVector3 = { x: 0, y: 0, z: 0 };

  private readonly world: RAPIER.World;
  private readonly clock: FixedStepClock;
  private readonly shipBody: RAPIER.RigidBody;
  private readonly barrelBody: RAPIER.RigidBody;
  private readonly safeBounds: PlayerNavigationBounds['safe'];
  private readonly deckY: number;
  private readonly previousShipPose: MutablePhysicsPose = {
    translation: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  };
  private readonly targetShipPose: MutablePhysicsPose = {
    translation: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  };
  private readonly currentShipPose: MutablePhysicsPose = {
    translation: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  };
  private readonly spawnWorld: MutablePhysicsVector3 = { x: 0, y: 0, z: 0 };
  private disposed = false;

  private readonly stepPhysics = (
    stepSeconds: number,
    stepIndex: number,
    stepCount: number,
  ): void => {
    const fraction = (stepIndex + 1) / stepCount;
    this.currentShipPose.translation.x = this.previousShipPose.translation.x
      + (this.targetShipPose.translation.x - this.previousShipPose.translation.x) * fraction;
    this.currentShipPose.translation.y = this.previousShipPose.translation.y
      + (this.targetShipPose.translation.y - this.previousShipPose.translation.y) * fraction;
    this.currentShipPose.translation.z = this.previousShipPose.translation.z
      + (this.targetShipPose.translation.z - this.previousShipPose.translation.z) * fraction;
    interpolateNormalizedQuaternion(
      this.currentShipPose.rotation,
      this.previousShipPose.rotation,
      this.targetShipPose.rotation,
      fraction,
    );
    this.shipBody.setNextKinematicTranslation(this.currentShipPose.translation);
    this.shipBody.setNextKinematicRotation(this.currentShipPose.rotation);
    this.world.timestep = stepSeconds;
    this.world.step();
    this.validateAndCopyBarrel();
  };

  constructor(runtime: PhysicsRuntime, config: ScavengePhysicsConfig) {
    this.safeBounds = config.safeBounds;
    this.deckY = config.deckY;
    copyVector(this.previousShipPose.translation, config.initialShipPose.translation);
    copyNormalizedQuaternion(this.previousShipPose.rotation, config.initialShipPose.rotation);
    copyVector(this.targetShipPose.translation, this.previousShipPose.translation);
    copyNormalizedQuaternion(this.targetShipPose.rotation, this.previousShipPose.rotation);
    copyVector(this.currentShipPose.translation, this.previousShipPose.translation);
    copyNormalizedQuaternion(this.currentShipPose.rotation, this.previousShipPose.rotation);

    this.world = runtime.createWorld({ x: 0, y: -9.81, z: 0 });
    this.clock = new FixedStepClock(PHYSICS_STEP_SECONDS, MAX_PHYSICS_SUBSTEPS);
    this.shipBody = this.world.createRigidBody(
      runtime.rapier.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(
          config.initialShipPose.translation.x,
          config.initialShipPose.translation.y,
          config.initialShipPose.translation.z,
        )
        .setRotation(config.initialShipPose.rotation),
    );

    this.addCuboid(
      { x: 0, y: config.deckY - DECK_THICKNESS / 2, z: 0 },
      { x: config.shipWidth / 2, y: DECK_THICKNESS / 2, z: config.shipLength / 2 },
      runtime,
    );
    config.colliders.forEach((box) => {
      const cuboid = collisionBoxToCuboid(box);
      this.addCuboid(cuboid.center, cuboid.halfExtents, runtime);
    });
    this.addContainmentBarriers(config.safeBounds, config.deckY, runtime);

    localToWorld(this.spawnWorld, BARREL_SPAWN_LOCAL, this.currentShipPose);
    this.barrelBody = this.world.createRigidBody(
      runtime.rapier.RigidBodyDesc.dynamic()
        .setTranslation(this.spawnWorld.x, this.spawnWorld.y, this.spawnWorld.z)
        .setLinearDamping(BARREL_LINEAR_DAMPING)
        .setAngularDamping(BARREL_ANGULAR_DAMPING),
    );
    this.world.createCollider(
      runtime.rapier.ColliderDesc.cylinder(BARREL_HALF_HEIGHT, BARREL_RADIUS)
        .setMass(BARREL_MASS)
        .setFriction(BARREL_FRICTION)
        .setRestitution(BARREL_RESTITUTION),
      this.barrelBody,
    );
    this.validateAndCopyBarrel();
  }

  update(shipPose: PhysicsPose, deltaSeconds: number, active: boolean): void {
    if (!active || this.disposed) return;
    copyVector(this.targetShipPose.translation, shipPose.translation);
    copyNormalizedQuaternion(this.targetShipPose.rotation, shipPose.rotation);
    this.clock.advance(deltaSeconds, this.stepPhysics);
    copyVector(this.previousShipPose.translation, this.targetShipPose.translation);
    copyNormalizedQuaternion(this.previousShipPose.rotation, this.targetShipPose.rotation);
  }

  setBarrelPoseForTest(pose: PhysicsPose): void {
    if (this.disposed) return;
    this.barrelBody.setTranslation(pose.translation, true);
    this.barrelBody.setRotation(pose.rotation, true);
  }

  setBarrelVelocityForTest(velocity: PhysicsVector3): void {
    if (this.disposed) return;
    this.barrelBody.setLinvel(velocity, true);
    this.barrelBody.setAngvel(velocity, true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.world.free();
  }

  private addCuboid(
    center: PhysicsVector3,
    halfExtents: PhysicsVector3,
    runtime: PhysicsRuntime,
  ): void {
    this.world.createCollider(
      runtime.rapier.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
        .setTranslation(center.x, center.y, center.z),
      this.shipBody,
    );
  }

  private addContainmentBarriers(
    bounds: PlayerNavigationBounds['safe'],
    deckY: number,
    runtime: PhysicsRuntime,
  ): void {
    const width = bounds.maxX - bounds.minX;
    const length = bounds.maxZ - bounds.minZ;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;
    const centerY = deckY + BARRIER_HEIGHT / 2;

    this.addCuboid(
      { x: bounds.minX + BARRIER_THICKNESS / 2, y: centerY, z: centerZ },
      { x: BARRIER_THICKNESS / 2, y: BARRIER_HEIGHT / 2, z: length / 2 },
      runtime,
    );
    this.addCuboid(
      { x: bounds.maxX - BARRIER_THICKNESS / 2, y: centerY, z: centerZ },
      { x: BARRIER_THICKNESS / 2, y: BARRIER_HEIGHT / 2, z: length / 2 },
      runtime,
    );
    this.addCuboid(
      { x: centerX, y: centerY, z: bounds.minZ + BARRIER_THICKNESS / 2 },
      { x: width / 2, y: BARRIER_HEIGHT / 2, z: BARRIER_THICKNESS / 2 },
      runtime,
    );
    this.addCuboid(
      { x: centerX, y: centerY, z: bounds.maxZ - BARRIER_THICKNESS / 2 },
      { x: width / 2, y: BARRIER_HEIGHT / 2, z: BARRIER_THICKNESS / 2 },
      runtime,
    );
  }

  private validateAndCopyBarrel(): void {
    let translation = this.barrelBody.translation();
    let rotation = this.barrelBody.rotation();
    let recover = !isFinitePose(translation, rotation);
    if (!recover) {
      worldToLocal(this.barrelLocalPositionForTest, translation, this.currentShipPose);
      recover = this.barrelLocalPositionForTest.x < this.safeBounds.minX
        || this.barrelLocalPositionForTest.x > this.safeBounds.maxX
        || this.barrelLocalPositionForTest.z < this.safeBounds.minZ
        || this.barrelLocalPositionForTest.z > this.safeBounds.maxZ
        || this.barrelLocalPositionForTest.y < this.deckY - 2;
    }
    if (recover) {
      localToWorld(this.spawnWorld, BARREL_SPAWN_LOCAL, this.currentShipPose);
      this.barrelBody.setTranslation(this.spawnWorld, true);
      this.barrelBody.setRotation(this.currentShipPose.rotation, true);
      this.barrelBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.barrelBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
      translation = this.barrelBody.translation();
      rotation = this.barrelBody.rotation();
      copyVector(this.barrelLocalPositionForTest, BARREL_SPAWN_LOCAL);
    }
    copyVector(this.barrelPose.translation, translation);
    copyNormalizedQuaternion(this.barrelPose.rotation, rotation);
  }
}

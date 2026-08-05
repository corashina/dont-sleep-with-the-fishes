import type RAPIER from '@dimforge/rapier3d-deterministic-compat';
import type { CollisionArc, CollisionBox } from '../player/collisions';
import type { PlayerNavigationBounds } from '../player/PlayerController';
import { FixedStepClock } from './FixedStepClock';
import type { PhysicsRuntime, PhysicsVector3 } from './PhysicsRuntime';
import type {
  PhysicsObjectBodyProfile,
  PhysicsObjectCollider,
} from './ScavengePhysicsObjectTypes';

const PHYSICS_STEP_SECONDS = 1 / 60;
const MAX_PHYSICS_SUBSTEPS = 3;
const DECK_THICKNESS = 0.2;
const ARC_COLLIDER_SEGMENTS = 8;
const PLAYER_RADIUS = 0.35;
const PLAYER_CAPSULE_HALF_HEIGHT = 0.4;
const PLAYER_CAPSULE_CENTER_BELOW_EYE = 0.75;
const PLAYER_CHARACTER_OFFSET = 0.01;
const PLAYER_CHARACTER_MASS = 6;

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

interface MutableRigidBodyState {
  translation: MutablePhysicsVector3;
  rotation: MutablePhysicsQuaternion;
  linearVelocity: MutablePhysicsVector3;
  angularVelocity: MutablePhysicsVector3;
  force: MutablePhysicsVector3;
  torque: MutablePhysicsVector3;
  sleeping: boolean;
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
  readonly arcColliders: readonly CollisionArc[];
  readonly safeBounds: PlayerNavigationBounds['safe'];
  readonly deckY: number;
  readonly deckBounds: {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
  };
  readonly initialShipPose: PhysicsPose;
  readonly objects: readonly ScavengePhysicsObjectConfig[];
}

export interface ScavengePhysicsObjectConfig {
  readonly id: string;
  readonly spawn: PhysicsVector3;
  readonly rotation: PhysicsQuaternion;
  readonly profile: PhysicsObjectBodyProfile;
}

export interface ScavengePhysicsController {
  readonly objectPoses: readonly PhysicsPose[];
  resolvePlayerMovement(
    currentLocal: PhysicsVector3,
    desiredLocal: { x: number; y: number; z: number },
  ): void;
  update(shipPose: PhysicsPose, deltaSeconds: number, active: boolean): void;
  dispose(): void;
}

export interface PhysicsCuboid {
  center: PhysicsVector3;
  halfExtents: PhysicsVector3;
  rotation?: PhysicsQuaternion;
}

export function collisionBoxToCuboid(box: CollisionBox): PhysicsCuboid {
  const footprint = box.orientedFootprint;
  const width = footprint ? footprint.halfWidth * 2 : box.maxX - box.minX;
  const height = box.maxY - box.minY;
  const length = footprint ? footprint.halfDepth * 2 : box.maxZ - box.minZ;
  if (
    !Number.isFinite(width)
    || !Number.isFinite(height)
    || !Number.isFinite(length)
    || (footprint && (
      !Number.isFinite(footprint.centerX)
      || !Number.isFinite(footprint.centerZ)
      || !Number.isFinite(footprint.rotationY)
    ))
    || width <= 0
    || height <= 0
    || length <= 0
  ) {
    throw new Error('Physics collider must have finite positive extents');
  }
  const cuboid: PhysicsCuboid = {
    center: {
      x: footprint ? footprint.centerX : (box.minX + box.maxX) / 2,
      y: (box.minY + box.maxY) / 2,
      z: footprint ? footprint.centerZ : (box.minZ + box.maxZ) / 2,
    },
    halfExtents: {
      x: width / 2,
      y: height / 2,
      z: length / 2,
    },
  };
  if (footprint) {
    cuboid.rotation = {
      x: 0,
      y: Math.sin(footprint.rotationY / 2),
      z: 0,
      w: Math.cos(footprint.rotationY / 2),
    };
  }
  return cuboid;
}

export function collisionArcToCuboids(arc: CollisionArc): readonly PhysicsCuboid[] {
  const height = arc.maxY - arc.minY;
  if (
    ![
      arc.centerX,
      arc.centerZ,
      arc.radiusX,
      arc.radiusZ,
      arc.thickness,
      arc.minY,
      arc.maxY,
    ].every(Number.isFinite)
    || arc.radiusX <= 0
    || arc.radiusZ <= 0
    || arc.thickness <= 0
    || height <= 0
  ) {
    throw new Error('Physics arc collider must have finite positive extents');
  }
  const direction = arc.end === 'bow' ? 1 : -1;
  const pointAt = (index: number): PhysicsVector3 => {
    const angle = Math.PI * index / ARC_COLLIDER_SEGMENTS;
    return {
      x: arc.centerX + arc.radiusX * Math.cos(angle),
      y: (arc.minY + arc.maxY) / 2,
      z: arc.centerZ + direction * arc.radiusZ * Math.sin(angle),
    };
  };
  return Array.from({ length: ARC_COLLIDER_SEGMENTS }, (_, index) => {
    const start = pointAt(index);
    const end = pointAt(index + 1);
    const deltaX = end.x - start.x;
    const deltaZ = end.z - start.z;
    const rotationY = Math.atan2(deltaX, deltaZ);
    return {
      center: {
        x: (start.x + end.x) / 2,
        y: start.y,
        z: (start.z + end.z) / 2,
      },
      halfExtents: {
        x: arc.thickness / 2,
        y: height / 2,
        z: Math.hypot(deltaX, deltaZ) / 2,
      },
      rotation: {
        x: 0,
        y: Math.sin(rotationY / 2),
        z: 0,
        w: Math.cos(rotationY / 2),
      },
    };
  });
}

export function createScavengeStaticCuboids(
  config: Pick<
    ScavengePhysicsConfig,
    'colliders' | 'arcColliders' | 'deckY' | 'deckBounds'
  >,
): readonly PhysicsCuboid[] {
  const { deckY } = config;
  return [
    {
      center: {
        x: (config.deckBounds.minX + config.deckBounds.maxX) / 2,
        y: deckY - DECK_THICKNESS / 2,
        z: (config.deckBounds.minZ + config.deckBounds.maxZ) / 2,
      },
      halfExtents: {
        x: (config.deckBounds.maxX - config.deckBounds.minX) / 2,
        y: DECK_THICKNESS / 2,
        z: (config.deckBounds.maxZ - config.deckBounds.minZ) / 2,
      },
    },
    ...config.colliders.map(collisionBoxToCuboid),
    ...config.arcColliders.flatMap(collisionArcToCuboids),
  ];
}

function multiplyQuaternions(
  target: MutablePhysicsQuaternion,
  left: PhysicsQuaternion,
  right: PhysicsQuaternion,
): void {
  target.x = left.w * right.x + left.x * right.w + left.y * right.z - left.z * right.y;
  target.y = left.w * right.y - left.x * right.z + left.y * right.w + left.z * right.x;
  target.z = left.w * right.z + left.x * right.y - left.y * right.x + left.z * right.w;
  target.w = left.w * right.w - left.x * right.x - left.y * right.y - left.z * right.z;
  copyNormalizedQuaternion(target, target);
}

function worldRotationToLocal(
  target: MutablePhysicsQuaternion,
  world: PhysicsQuaternion,
  frame: PhysicsQuaternion,
): void {
  const frameX = -frame.x;
  const frameY = -frame.y;
  const frameZ = -frame.z;
  const frameW = frame.w;
  target.x = frameW * world.x + frameX * world.w + frameY * world.z - frameZ * world.y;
  target.y = frameW * world.y - frameX * world.z + frameY * world.w + frameZ * world.x;
  target.z = frameW * world.z + frameX * world.y - frameY * world.x + frameZ * world.w;
  target.w = frameW * world.w - frameX * world.x - frameY * world.y - frameZ * world.z;
  copyNormalizedQuaternion(target, target);
}

function createObjectColliderDesc(
  rapier: PhysicsRuntime['rapier'],
  collider: PhysicsObjectCollider,
): RAPIER.ColliderDesc {
  if (collider.kind === 'sphere') return rapier.ColliderDesc.ball(collider.radius);
  if (collider.kind === 'cylinder') {
    return rapier.ColliderDesc.cylinder(collider.halfHeight, collider.radius);
  }
  return rapier.ColliderDesc.cuboid(
    collider.halfExtents.x,
    collider.halfExtents.y,
    collider.halfExtents.z,
  );
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
  readonly objectPoses: readonly MutablePhysicsPose[];
  readonly objectLocalPositionsForTest: readonly MutablePhysicsVector3[];

  private readonly world: RAPIER.World;
  private readonly clock: FixedStepClock;
  private readonly shipBody: RAPIER.RigidBody;
  private readonly playerCollider: RAPIER.Collider;
  private readonly playerController: RAPIER.KinematicCharacterController;
  private readonly objectBodies: readonly RAPIER.RigidBody[];
  private readonly objectSceneQuerySnapshots: readonly MutableRigidBodyState[];
  private readonly objectHorizontalRadii: readonly number[];
  private readonly dynamicColliderHandles = new Set<number>();
  private readonly objectSpawns: readonly MutablePhysicsVector3[];
  private readonly objectRotations: readonly MutablePhysicsQuaternion[];
  private readonly objectLocalRotations: readonly MutablePhysicsQuaternion[];
  private readonly objectSpawnWorlds: readonly MutablePhysicsVector3[];
  private readonly objectSpawnWorldRotations: readonly MutablePhysicsQuaternion[];
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
  private readonly zeroVelocity: MutablePhysicsVector3 = { x: 0, y: 0, z: 0 };
  private readonly playerCurrentLocalCenter: MutablePhysicsVector3 = { x: 0, y: 0, z: 0 };
  private readonly playerDesiredLocalCenter: MutablePhysicsVector3 = { x: 0, y: 0, z: 0 };
  private readonly playerCurrentWorldCenter: MutablePhysicsVector3 = { x: 0, y: 0, z: 0 };
  private readonly playerDesiredWorldCenter: MutablePhysicsVector3 = { x: 0, y: 0, z: 0 };
  private readonly playerDesiredWorldDelta: MutablePhysicsVector3 = { x: 0, y: 0, z: 0 };
  private readonly playerResolvedWorldCenter: MutablePhysicsVector3 = { x: 0, y: 0, z: 0 };
  private readonly playerResolvedLocalCenter: MutablePhysicsVector3 = { x: 0, y: 0, z: 0 };
  private recoveryCount = 0;
  private sceneQueriesInitialized = false;
  private disposed = false;

  private readonly dynamicColliderFilter = (collider: RAPIER.Collider): boolean => (
    this.dynamicColliderHandles.has(collider.handle)
  );

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
    this.sceneQueriesInitialized = true;
  };

  constructor(runtime: PhysicsRuntime, config: ScavengePhysicsConfig) {
    if (config.objects.length === 0) {
      throw new Error('Scavenging physics requires at least one object');
    }
    const staticCuboids = createScavengeStaticCuboids(config);
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

    staticCuboids.forEach((cuboid) => this.addCuboid(cuboid, runtime));

    this.playerCollider = this.world.createCollider(
      runtime.rapier.ColliderDesc.capsule(
        PLAYER_CAPSULE_HALF_HEIGHT,
        PLAYER_RADIUS,
      ).setSensor(true),
    );
    this.playerController = this.world.createCharacterController(PLAYER_CHARACTER_OFFSET);
    this.playerController.setApplyImpulsesToDynamicBodies(true);
    this.playerController.setCharacterMass(PLAYER_CHARACTER_MASS);
    this.playerController.setSlideEnabled(true);
    this.playerController.disableAutostep();
    this.playerController.disableSnapToGround();

    this.objectSpawns = config.objects.map(({ spawn }) => ({ ...spawn }));
    this.objectRotations = config.objects.map(({ rotation }) => {
      const copy = { x: 0, y: 0, z: 0, w: 1 };
      copyNormalizedQuaternion(copy, rotation);
      return copy;
    });
    this.objectLocalRotations = this.objectRotations.map((rotation) => ({ ...rotation }));
    this.objectSpawnWorlds = config.objects.map(() => ({ x: 0, y: 0, z: 0 }));
    this.objectSpawnWorldRotations = config.objects.map(() => ({ x: 0, y: 0, z: 0, w: 1 }));
    this.objectHorizontalRadii = config.objects.map(({ profile }) => {
      const { collider } = profile;
      if (collider.kind === 'sphere' || collider.kind === 'cylinder') return collider.radius;
      return Math.hypot(collider.halfExtents.x, collider.halfExtents.z);
    });
    this.objectPoses = config.objects.map(() => ({
      translation: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    }));
    this.objectLocalPositionsForTest = config.objects.map(() => ({ x: 0, y: 0, z: 0 }));
    this.objectSceneQuerySnapshots = config.objects.map(() => ({
      translation: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      force: { x: 0, y: 0, z: 0 },
      torque: { x: 0, y: 0, z: 0 },
      sleeping: false,
    }));
    this.objectBodies = config.objects.map(({ profile }, index) => {
      const spawn = this.objectSpawns[index]!;
      const spawnWorld = this.objectSpawnWorlds[index]!;
      const spawnWorldRotation = this.objectSpawnWorldRotations[index]!;
      localToWorld(spawnWorld, spawn, this.currentShipPose);
      multiplyQuaternions(
        spawnWorldRotation,
        this.currentShipPose.rotation,
        this.objectRotations[index]!,
      );
      const body = this.world.createRigidBody(
        runtime.rapier.RigidBodyDesc.dynamic()
          .setTranslation(spawnWorld.x, spawnWorld.y, spawnWorld.z)
          .setRotation(spawnWorldRotation)
          .setLinearDamping(profile.linearDamping)
          .setAngularDamping(profile.angularDamping),
      );
      const collider = this.world.createCollider(
        createObjectColliderDesc(runtime.rapier, profile.collider)
        .setMass(profile.mass)
        .setFriction(profile.friction)
        .setFrictionCombineRule(runtime.rapier.CoefficientCombineRule.Average)
        .setRestitution(profile.restitution),
        body,
      );
      this.dynamicColliderHandles.add(collider.handle);
      return body;
    });
    this.validateAndCopyObjects();
  }

  resolvePlayerMovement(
    currentLocal: PhysicsVector3,
    desiredLocal: { x: number; y: number; z: number },
  ): void {
    if (this.disposed) return;
    if (
      !this.sceneQueriesInitialized
      && this.playerMovementMayContactDynamic(currentLocal, desiredLocal)
    ) {
      this.initializeSceneQueries();
    }
    this.playerCurrentLocalCenter.x = currentLocal.x;
    this.playerCurrentLocalCenter.y = currentLocal.y - PLAYER_CAPSULE_CENTER_BELOW_EYE;
    this.playerCurrentLocalCenter.z = currentLocal.z;
    this.playerDesiredLocalCenter.x = desiredLocal.x;
    this.playerDesiredLocalCenter.y = desiredLocal.y - PLAYER_CAPSULE_CENTER_BELOW_EYE;
    this.playerDesiredLocalCenter.z = desiredLocal.z;
    localToWorld(
      this.playerCurrentWorldCenter,
      this.playerCurrentLocalCenter,
      this.currentShipPose,
    );
    localToWorld(
      this.playerDesiredWorldCenter,
      this.playerDesiredLocalCenter,
      this.currentShipPose,
    );
    this.playerCollider.setTranslation(this.playerCurrentWorldCenter);
    this.playerDesiredWorldDelta.x = this.playerDesiredWorldCenter.x
      - this.playerCurrentWorldCenter.x;
    this.playerDesiredWorldDelta.y = this.playerDesiredWorldCenter.y
      - this.playerCurrentWorldCenter.y;
    this.playerDesiredWorldDelta.z = this.playerDesiredWorldCenter.z
      - this.playerCurrentWorldCenter.z;
    this.playerController.computeColliderMovement(
      this.playerCollider,
      this.playerDesiredWorldDelta,
      undefined,
      undefined,
      this.dynamicColliderFilter,
    );
    const movement = this.playerController.computedMovement();
    this.playerResolvedWorldCenter.x = this.playerCurrentWorldCenter.x + movement.x;
    this.playerResolvedWorldCenter.y = this.playerCurrentWorldCenter.y + movement.y;
    this.playerResolvedWorldCenter.z = this.playerCurrentWorldCenter.z + movement.z;
    worldToLocal(
      this.playerResolvedLocalCenter,
      this.playerResolvedWorldCenter,
      this.currentShipPose,
    );
    desiredLocal.x = this.playerResolvedLocalCenter.x;
    desiredLocal.z = this.playerResolvedLocalCenter.z;
  }

  private playerMovementMayContactDynamic(
    currentLocal: PhysicsVector3,
    desiredLocal: PhysicsVector3,
  ): boolean {
    const movementX = desiredLocal.x - currentLocal.x;
    const movementZ = desiredLocal.z - currentLocal.z;
    const movementLengthSquared = movementX * movementX + movementZ * movementZ;
    for (let index = 0; index < this.objectLocalPositionsForTest.length; index += 1) {
      const object = this.objectLocalPositionsForTest[index]!;
      const relativeX = object.x - currentLocal.x;
      const relativeZ = object.z - currentLocal.z;
      const fraction = movementLengthSquared > Number.EPSILON
        ? Math.max(0, Math.min(
          1,
          (relativeX * movementX + relativeZ * movementZ) / movementLengthSquared,
        ))
        : 0;
      const closestX = currentLocal.x + movementX * fraction;
      const closestZ = currentLocal.z + movementZ * fraction;
      const deltaX = object.x - closestX;
      const deltaZ = object.z - closestZ;
      const radius = PLAYER_RADIUS + this.objectHorizontalRadii[index]!;
      if (deltaX * deltaX + deltaZ * deltaZ <= radius * radius) return true;
    }
    return false;
  }

  private initializeSceneQueries(): void {
    for (let index = 0; index < this.objectBodies.length; index += 1) {
      const body = this.objectBodies[index]!;
      const snapshot = this.objectSceneQuerySnapshots[index]!;
      copyVector(snapshot.translation, body.translation());
      copyVector(snapshot.linearVelocity, body.linvel());
      copyVector(snapshot.angularVelocity, body.angvel());
      copyVector(snapshot.force, body.userForce());
      copyVector(snapshot.torque, body.userTorque());
      const rotation = body.rotation();
      snapshot.rotation.x = rotation.x;
      snapshot.rotation.y = rotation.y;
      snapshot.rotation.z = rotation.z;
      snapshot.rotation.w = rotation.w;
      snapshot.sleeping = body.isSleeping();
    }
    this.world.timestep = PHYSICS_STEP_SECONDS;
    this.world.step();
    this.sceneQueriesInitialized = true;
    for (let index = 0; index < this.objectBodies.length; index += 1) {
      const body = this.objectBodies[index]!;
      const snapshot = this.objectSceneQuerySnapshots[index]!;
      body.setTranslation(snapshot.translation, false);
      body.setRotation(snapshot.rotation, false);
      body.setLinvel(snapshot.linearVelocity, false);
      body.setAngvel(snapshot.angularVelocity, false);
      body.resetForces(false);
      body.resetTorques(false);
      body.addForce(snapshot.force, false);
      body.addTorque(snapshot.torque, false);
      if (snapshot.sleeping) body.sleep();
      else body.wakeUp();
    }
    this.world.propagateModifiedBodyPositionsToColliders();
  }

  update(shipPose: PhysicsPose, deltaSeconds: number, active: boolean): void {
    if (this.disposed) return;
    if (!active) {
      this.trackInactiveShip(shipPose);
      return;
    }
    copyVector(this.targetShipPose.translation, shipPose.translation);
    copyNormalizedQuaternion(this.targetShipPose.rotation, shipPose.rotation);
    const stepCount = this.clock.advance(deltaSeconds, this.stepPhysics);
    if (stepCount > 0) {
      this.validateAndCopyObjects();
    }
    copyVector(this.previousShipPose.translation, this.targetShipPose.translation);
    copyNormalizedQuaternion(this.previousShipPose.rotation, this.targetShipPose.rotation);
  }

  private trackInactiveShip(shipPose: PhysicsPose): void {
    copyVector(this.previousShipPose.translation, shipPose.translation);
    copyNormalizedQuaternion(this.previousShipPose.rotation, shipPose.rotation);
    copyVector(this.targetShipPose.translation, this.previousShipPose.translation);
    copyNormalizedQuaternion(this.targetShipPose.rotation, this.previousShipPose.rotation);
    copyVector(this.currentShipPose.translation, this.previousShipPose.translation);
    copyNormalizedQuaternion(this.currentShipPose.rotation, this.previousShipPose.rotation);
    this.shipBody.setTranslation(this.currentShipPose.translation, false);
    this.shipBody.setRotation(this.currentShipPose.rotation, false);
    for (let index = 0; index < this.objectBodies.length; index += 1) {
      const body = this.objectBodies[index]!;
      const worldPosition = this.objectSpawnWorlds[index]!;
      const worldRotation = this.objectSpawnWorldRotations[index]!;
      localToWorld(
        worldPosition,
        this.objectLocalPositionsForTest[index]!,
        this.currentShipPose,
      );
      multiplyQuaternions(
        worldRotation,
        this.currentShipPose.rotation,
        this.objectLocalRotations[index]!,
      );
      body.setTranslation(worldPosition, false);
      body.setRotation(worldRotation, false);
      copyVector(this.objectPoses[index]!.translation, worldPosition);
      copyNormalizedQuaternion(this.objectPoses[index]!.rotation, worldRotation);
    }
    this.world.propagateModifiedBodyPositionsToColliders();
  }

  get recoveryCountForTest(): number {
    return this.recoveryCount;
  }

  setObjectPoseForTest(pose: PhysicsPose, index = 0): void {
    if (this.disposed) return;
    const body = this.objectBodies[index];
    if (!body) throw new Error(`Missing physics object ${index}`);
    body.setTranslation(pose.translation, true);
    body.setRotation(pose.rotation, true);
  }

  setObjectVelocityForTest(velocity: PhysicsVector3, index = 0): void {
    if (this.disposed) return;
    const body = this.objectBodies[index];
    if (!body) throw new Error(`Missing physics object ${index}`);
    body.setLinvel(velocity, true);
    body.setAngvel(velocity, true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.world.removeCharacterController(this.playerController);
    this.world.free();
  }

  private addCuboid(
    cuboid: PhysicsCuboid,
    runtime: PhysicsRuntime,
  ): void {
    const descriptor = runtime.rapier.ColliderDesc.cuboid(
      cuboid.halfExtents.x,
      cuboid.halfExtents.y,
      cuboid.halfExtents.z,
    ).setTranslation(cuboid.center.x, cuboid.center.y, cuboid.center.z);
    if (cuboid.rotation) descriptor.setRotation(cuboid.rotation);
    this.world.createCollider(
      descriptor,
      this.shipBody,
    );
  }

  private validateAndCopyObjects(): void {
    for (let index = 0; index < this.objectBodies.length; index += 1) {
      this.validateAndCopyObject(this.objectBodies[index]!, index);
    }
  }

  private validateAndCopyObject(body: RAPIER.RigidBody, index: number): void {
    const translation = body.translation();
    const rotation = body.rotation();
    const localPosition = this.objectLocalPositionsForTest[index]!;
    const spawn = this.objectSpawns[index]!;
    const spawnWorld = this.objectSpawnWorlds[index]!;
    const spawnWorldRotation = this.objectSpawnWorldRotations[index]!;
    const pose = this.objectPoses[index]!;
    let recover = !isFinitePose(translation, rotation);
    if (!recover) {
      worldToLocal(localPosition, translation, this.currentShipPose);
      recover = localPosition.x < this.safeBounds.minX
        || localPosition.x > this.safeBounds.maxX
        || localPosition.z < this.safeBounds.minZ
        || localPosition.z > this.safeBounds.maxZ
        || localPosition.y < this.deckY - 2;
    }
    if (recover) {
      localToWorld(spawnWorld, spawn, this.currentShipPose);
      multiplyQuaternions(
        spawnWorldRotation,
        this.currentShipPose.rotation,
        this.objectRotations[index]!,
      );
      body.setTranslation(spawnWorld, true);
      body.setRotation(spawnWorldRotation, true);
      body.setLinvel(this.zeroVelocity, true);
      body.setAngvel(this.zeroVelocity, true);
      this.recoveryCount += 1;
      copyVector(localPosition, spawn);
      copyNormalizedQuaternion(this.objectLocalRotations[index]!, this.objectRotations[index]!);
      copyVector(pose.translation, spawnWorld);
      copyNormalizedQuaternion(pose.rotation, spawnWorldRotation);
      return;
    }
    copyVector(pose.translation, translation);
    copyNormalizedQuaternion(pose.rotation, rotation);
    worldRotationToLocal(
      this.objectLocalRotations[index]!,
      rotation,
      this.currentShipPose.rotation,
    );
  }
}

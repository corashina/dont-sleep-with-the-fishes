import type { PhysicsObjectCollider } from '../physics/ScavengePhysicsObjectTypes';
import type { ShipFurnitureAssetId } from './shipFurnitureManifest';

export const SCAVENGE_PHYSICS_OBJECT_IDS = [
  'barrel', 'pumpkin', 'propaneTank', 'redCan',
  'cargoBox', 'shippingBox', 'package',
] as const;

export type ScavengePhysicsObjectId = typeof SCAVENGE_PHYSICS_OBJECT_IDS[number];

export interface ScavengePhysicsObjectSpec {
  readonly id: ScavengePhysicsObjectId;
  readonly modelId: ShipFurnitureAssetId;
  readonly visualScale: readonly [number, number, number];
  readonly visualHalfHeight: number;
  readonly collider: PhysicsObjectCollider;
  readonly mass: number;
  readonly friction: number;
  readonly restitution: number;
  readonly linearDamping: number;
  readonly angularDamping: number;
}

type ObjectSpecTuple = readonly [
  ScavengePhysicsObjectId,
  ShipFurnitureAssetId,
  readonly [number, number, number],
  number,
  PhysicsObjectCollider,
  number,
  number,
  number,
  number,
  number,
];

const OBJECT_SPEC_TUPLES: readonly ObjectSpecTuple[] = [
  ['barrel', 'barrel', [1, 1, 1], 0.575,
    { kind: 'cylinder', halfHeight: 0.55775, radius: 0.547811 },
    36, 0.30, 0.03, 0.08, 0.06],
  ['pumpkin', 'pumpkin', [1 / 3, 1.6 / 3, 1 / 3], 0.64 / 3,
    { kind: 'sphere', radius: 0.6208 / 3 },
    8, 0.22, 0.08, 0.06, 0.025],
  ['propaneTank', 'propaneTank', [0.5, 0.5, 0.5], 0.425,
    { kind: 'cylinder', halfHeight: 0.41225, radius: 0.2922855 },
    30, 0.34, 0.025, 0.10, 0.08],
  ['redCan', 'redCan', [1.129507 / 1.187991, 1.15 / 1.6, 1.129507 / 1.187991], 0.575,
    { kind: 'cylinder', halfHeight: 0.55775, radius: 0.547811 },
    16, 0.40, 0.04, 0.14, 0.12],
  ['cargoBox', 'cargoBox', [1.5, 1.5, 1.5], 0.4125,
    { kind: 'cuboid', halfExtents: { x: 0.45365325, y: 0.400125, z: 0.4606335 } },
    7, 0.62, 0.015, 0.26, 0.32],
  ['shippingBox', 'shippingBox', [0.5, 0.5, 0.5], 0.2875,
    { kind: 'cuboid', halfExtents: { x: 0.278875, y: 0.278875, z: 0.278875 } },
    10, 0.56, 0.02, 0.22, 0.28],
  ['package', 'package', [0.75, 0.75, 0.75], 0.39375,
    { kind: 'cuboid', halfExtents: { x: 0.458538, y: 0.3819375, z: 0.45351 } },
    5, 0.68, 0.01, 0.30, 0.38],
];

function freezeCollider(collider: PhysicsObjectCollider): PhysicsObjectCollider {
  if (collider.kind === 'cuboid') {
    return Object.freeze({
      kind: 'cuboid' as const,
      halfExtents: Object.freeze({ ...collider.halfExtents }),
    });
  }
  return Object.freeze({ ...collider });
}

function createSpec(tuple: ObjectSpecTuple): ScavengePhysicsObjectSpec {
  const [
    id,
    modelId,
    visualScale,
    visualHalfHeight,
    collider,
    mass,
    friction,
    restitution,
    linearDamping,
    angularDamping,
  ] = tuple;
  return Object.freeze({
    id,
    modelId,
    visualScale: Object.freeze([...visualScale]) as readonly [number, number, number],
    visualHalfHeight,
    collider: freezeCollider(collider),
    mass,
    friction,
    restitution,
    linearDamping,
    angularDamping,
  });
}

export const SCAVENGE_PHYSICS_OBJECT_SPECS: readonly ScavengePhysicsObjectSpec[] = Object.freeze(
  OBJECT_SPEC_TUPLES.map(createSpec),
);

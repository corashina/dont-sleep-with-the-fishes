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
  ['pumpkin', 'pumpkin', [1, 1.6, 1], 0.64,
    { kind: 'sphere', radius: 0.6208 },
    8, 0.22, 0.08, 0.06, 0.025],
  ['propaneTank', 'propaneTank', [1, 1, 1], 0.85,
    { kind: 'cylinder', halfHeight: 0.8245, radius: 0.584571 },
    30, 0.34, 0.025, 0.10, 0.08],
  ['redCan', 'redCan', [1, 1, 1], 0.8,
    { kind: 'cylinder', halfHeight: 0.776, radius: 0.576176 },
    16, 0.40, 0.04, 0.14, 0.12],
  ['cargoBox', 'cargoBox', [2, 2, 2], 0.55,
    { kind: 'cuboid', halfExtents: { x: 0.604871, y: 0.5335, z: 0.614178 } },
    7, 0.62, 0.015, 0.26, 0.32],
  ['shippingBox', 'shippingBox', [1, 1, 1], 0.575,
    { kind: 'cuboid', halfExtents: { x: 0.55775, y: 0.55775, z: 0.55775 } },
    10, 0.56, 0.02, 0.22, 0.28],
  ['package', 'package', [1, 1, 1], 0.525,
    { kind: 'cuboid', halfExtents: { x: 0.611384, y: 0.50925, z: 0.60468 } },
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

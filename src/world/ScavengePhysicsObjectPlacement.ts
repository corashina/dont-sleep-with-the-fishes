import type { PhysicsVector3 } from '../physics/PhysicsRuntime';
import type { CollisionBox } from '../player/collisions';
import { circleOverlapsCollisionFootprint } from '../player/collisions';
import {
  SCAVENGE_PHYSICS_OBJECT_SPECS,
  type ScavengePhysicsObjectId,
} from './ScavengePhysicsObjectCatalog';
import { FREIGHTER_DIMENSIONS } from './ShipLayoutTypes';

const REQUIRED_COUNTS = {
  door: 2,
  exterior: 2,
  center: 2,
  storage: 1,
} as const;

const CANDIDATE_RADIUS = 0.66;
const CANDIDATE_HEIGHT = Math.max(
  ...SCAVENGE_PHYSICS_OBJECT_SPECS.map(({ visualHalfHeight }) => visualHalfHeight * 2),
);

export type ScavengePhysicsObjectPlacementCategory = keyof typeof REQUIRED_COUNTS;

export interface ScavengePhysicsObjectPlacement {
  readonly id: string;
  readonly category: ScavengePhysicsObjectPlacementCategory;
  readonly position: PhysicsVector3;
  readonly rotationY: number;
}

type PlacementTuple = readonly [
  string,
  ScavengePhysicsObjectPlacementCategory,
  number,
  number,
  number,
];

const PLACEMENT_TUPLES: readonly PlacementTuple[] = [
  ['door-cabin-port', 'door', -5.75, 7.25, Math.PI / 2],
  ['door-cabin-starboard', 'door', 5.75, 7.25, Math.PI / 2],
  ['door-wheelhouse-aft', 'door', 0, 17, 0],
  ['door-wheelhouse-port', 'door', -5.5, 19.5, Math.PI / 2],
  ['exterior-cabin-port', 'exterior', -7, 10.2, 0],
  ['exterior-cabin-starboard', 'exterior', 7, 10.2, 0],
  ['exterior-storage-port', 'exterior', -7, -12.5, 0],
  ['exterior-storage-starboard', 'exterior', 7, -12.5, 0],
  ['center-hatch-port-forward', 'center', -2.2, -4.6, 0],
  ['center-hatch-starboard-forward', 'center', 2.2, -4.6, 0],
  ['center-hatch-port-aft', 'center', -2.2, -9.1, 0],
  ['center-hatch-starboard-aft', 'center', 2.2, -9.1, 0],
  ['storage-center-port', 'storage', -1.3, -13.8, 0],
  ['storage-center-starboard', 'storage', 1.3, -15.4, 0],
];

function createPlacement([
  id,
  category,
  x,
  z,
  rotationY,
]: PlacementTuple): ScavengePhysicsObjectPlacement {
  const placement: ScavengePhysicsObjectPlacement = {
    id,
    category,
    position: Object.freeze({ x, y: FREIGHTER_DIMENSIONS.deckY, z }),
    rotationY,
  };
  return Object.freeze(placement);
}

export const SCAVENGE_PHYSICS_OBJECT_PLACEMENTS: readonly ScavengePhysicsObjectPlacement[] = Object.freeze(
  PLACEMENT_TUPLES.map(createPlacement),
);

function randomUnit(random: () => number): number {
  const sample = random();
  return Number.isFinite(sample)
    ? Math.min(Math.max(sample, 0), 1 - Number.EPSILON)
    : 0;
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(randomUnit(random) * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

function requiredObjectCount(): number {
  return Object.values(REQUIRED_COUNTS).reduce((total, count) => total + count, 0);
}

function uniqueObjectIds(objectIds: readonly ScavengePhysicsObjectId[]): void {
  if (new Set(objectIds).size !== objectIds.length) {
    throw new Error('Scavenge physics object IDs must be unique');
  }
}

function selectPositions(random: () => number): ScavengePhysicsObjectPlacement[] {
  const selected: ScavengePhysicsObjectPlacement[] = [];
  for (const [category, count] of Object.entries(REQUIRED_COUNTS) as readonly [
    ScavengePhysicsObjectPlacementCategory,
    number,
  ][]) {
    const candidates = SCAVENGE_PHYSICS_OBJECT_PLACEMENTS.filter(
      (placement) => placement.category === category,
    );
    if (candidates.length === 0) {
      throw new Error(`Scavenge physics object placement category is missing: ${category}`);
    }
    if (candidates.length < count) {
      throw new Error(`Scavenge physics object placement category has insufficient positions: ${category}`);
    }
    selected.push(...shuffled(candidates, random).slice(0, count));
  }
  return shuffled(selected, random);
}

export function selectScavengePhysicsObjectPlacements(
  objectIds: readonly ScavengePhysicsObjectId[],
  random: () => number,
): ReadonlyMap<ScavengePhysicsObjectId, ScavengePhysicsObjectPlacement> {
  uniqueObjectIds(objectIds);
  const count = requiredObjectCount();
  if (objectIds.length !== count) {
    throw new Error(`Scavenge physics object selection requires ${count} object IDs`);
  }
  const positions = selectPositions(random);
  const shuffledIds = shuffled(objectIds, random);
  const assignments = new Map<ScavengePhysicsObjectId, ScavengePhysicsObjectPlacement>();
  positions.forEach((placement, index) => assignments.set(shuffledIds[index]!, placement));
  return assignments;
}

export function validateScavengePhysicsObjectPlacementPool(
  placements: readonly ScavengePhysicsObjectPlacement[],
  blockers: readonly CollisionBox[],
  protectedPoints: readonly {
    id: string;
    x: number;
    z: number;
    radius: number;
  }[],
): void {
  const ids = new Set<string>();
  const positions = new Set<string>();
  for (const placement of placements) {
    if (ids.has(placement.id)) {
      throw new Error(`Duplicate scavenge physics object placement id: ${placement.id}`);
    }
    ids.add(placement.id);
    if (!Object.hasOwn(REQUIRED_COUNTS, placement.category)) {
      throw new Error(`Invalid scavenge physics object placement category: ${placement.id}`);
    }
    const positionKey = `${placement.position.x}:${placement.position.y}:${placement.position.z}`;
    if (positions.has(positionKey)) {
      throw new Error(`Duplicate scavenge physics object placement position: ${placement.id}`);
    }
    positions.add(positionKey);
    const candidateTop = placement.position.y + CANDIDATE_HEIGHT;
    const overlappingBlocker = blockers.find((blocker) => (
      blocker.minY < candidateTop
      && blocker.maxY > placement.position.y
      && circleOverlapsCollisionFootprint(placement.position, CANDIDATE_RADIUS, blocker)
    ));
    if (overlappingBlocker) {
      throw new Error(`Scavenge physics object placement overlaps a blocker: ${placement.id}`);
    }
    const protectedPoint = protectedPoints.find((point) => (
      Math.hypot(placement.position.x - point.x, placement.position.z - point.z)
        < CANDIDATE_RADIUS + point.radius
    ));
    if (protectedPoint) {
      throw new Error(
        `Scavenge physics object placement overlaps protected point ${protectedPoint.id}: ${placement.id}`,
      );
    }
  }
}

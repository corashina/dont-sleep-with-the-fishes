import { Box3, Euler, Quaternion, Vector3 } from 'three';
import {
  ITEM_DEFINITIONS,
  ITEM_IDS,
  type ItemId,
} from '../game/itemCatalog';
import type { ItemInstance, ItemInstanceId } from '../game/ItemState';
import type { CollisionBox } from '../player/collisions';
import {
  SCAVENGE_REGION_IDS,
  type ScavengeRegionId,
  type ShipFurnitureKind,
  type ShipRouteMetric,
} from './ShipLayoutTypes';
import { ITEM_MODEL_SPECS } from './itemModelManifest';

export interface ShipItemSurface {
  readonly id: string;
  readonly physicalSlotId: string;
  readonly furnitureId: string;
  readonly furnitureModelId: ShipFurnitureKind;
  readonly regionId: ScavengeRegionId;
  readonly branch: boolean;
  readonly position: Vector3;
  readonly rotation: Euler;
  readonly footprint: { readonly width: number; readonly depth: number };
  readonly clearanceHeight: number;
  readonly standingPoints: readonly Vector3[];
}

export interface ShipItemProfile {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

export interface ShipItemTransform {
  readonly surfaceId: string;
  readonly physicalSlotId: string;
  readonly furnitureId: string;
  readonly regionId: ScavengeRegionId;
  readonly branch: boolean;
  readonly standingPoint: Vector3;
  readonly position: Vector3;
  readonly rotation: Euler;
  readonly scale: number;
  readonly placementSource: 'random';
}

export interface ShipPlacementContext {
  readonly routeMetric: ShipRouteMetric;
  readonly deposit: readonly [number, number];
}

export class ShipItemPlacementError extends Error {
  constructor(readonly instanceId: ItemInstanceId) {
    super(`Unable to place ship item: ${instanceId}`);
    this.name = 'ShipItemPlacementError';
  }
}

const MAX_INTERACTION_DISTANCE = 2.2;
const MIN_UNIFORM_SCALE = 0.75;
const STANDING_EYE_HEIGHT = 1.5;
const STRUCTURE_CLEARANCE = 0.1;
const MIN_ITEM_SEPARATION = 1.25;
const MAX_BACKTRACK_NODES_PER_ATTEMPT = 256;
const RANDOM_PLACEMENT_ATTEMPTS = 64;
const EPSILON = 1e-6;
const UMBRELLA_FLOOR_ANGLE = -Math.PI / 4;
const UMBRELLA_REST_TILT = -42.7 * Math.PI / 180;
const UMBRELLA_REST_MIN_Y = -0.3008;
const UMBRELLA_REST_MAX_Y = 0.3742;

export const MAX_HEAVY_ITEM_DEPOSIT_DISTANCE = 14;

const validatedSurfaceInputs = new WeakMap<
  readonly ShipItemSurface[],
  WeakSet<readonly CollisionBox[]>
>();

export const SHIP_ITEM_PROFILES = Object.freeze(Object.fromEntries(
  ITEM_IDS.map((id) => {
    const [width, height, depth] = ITEM_MODEL_SPECS[id].normalizedSize;
    return [id, { width, depth, height }];
  }),
) as Record<ItemId, ShipItemProfile>);

function orientedItemBounds(id: ItemId, rotation: Euler): Box3 {
  const normalized = ITEM_MODEL_SPECS[id].normalizedBounds;
  const bounds = new Box3();
  for (const x of [normalized.min[0], normalized.max[0]]) {
    for (const y of [normalized.min[1], normalized.max[1]]) {
      for (const z of [normalized.min[2], normalized.max[2]]) {
        bounds.expandByPoint(new Vector3(x, y, z).applyEuler(rotation));
      }
    }
  }
  return bounds;
}

export function shipItemTransformBounds(
  itemId: ItemId,
  transform: Pick<ShipItemTransform, 'position' | 'rotation' | 'scale'>,
): Box3 {
  const bounds = orientedItemBounds(itemId, transform.rotation);
  const transformed = new Box3(
    bounds.min.clone().multiplyScalar(transform.scale).add(transform.position),
    bounds.max.clone().multiplyScalar(transform.scale).add(transform.position),
  );
  if (itemId === 'umbrella') {
    transformed.min.y = transform.position.y + UMBRELLA_REST_MIN_Y * transform.scale;
    transformed.max.y = transform.position.y + UMBRELLA_REST_MAX_Y * transform.scale;
  }
  return transformed;
}

function finiteVector(vector: Vector3): boolean {
  return vector.toArray().every(Number.isFinite);
}

function surfaceVolume(surface: ShipItemSurface): Box3 {
  const halfWidth = surface.footprint.width / 2;
  const halfDepth = surface.footprint.depth / 2;
  return new Box3(
    new Vector3(
      surface.position.x - halfWidth,
      surface.position.y,
      surface.position.z - halfDepth,
    ),
    new Vector3(
      surface.position.x + halfWidth,
      surface.position.y + surface.clearanceHeight,
      surface.position.z + halfDepth,
    ),
  );
}

function positiveVolumeOverlap(left: Box3, right: Box3): boolean {
  return left.min.x < right.max.x - EPSILON && left.max.x > right.min.x + EPSILON
    && left.min.y < right.max.y - EPSILON && left.max.y > right.min.y + EPSILON
    && left.min.z < right.max.z - EPSILON && left.max.z > right.min.z + EPSILON;
}

function collisionBounds(collider: CollisionBox): Box3 {
  return new Box3(
    new Vector3(collider.minX, collider.minY, collider.minZ),
    new Vector3(collider.maxX, collider.maxY, collider.maxZ),
  );
}

function positiveVolumeOverlapCollider(bounds: Box3, collider: CollisionBox): boolean {
  if (bounds.min.y >= collider.maxY - EPSILON
    || bounds.max.y <= collider.minY + EPSILON) return false;
  const footprint = collider.orientedFootprint;
  if (!footprint) return positiveVolumeOverlap(bounds, collisionBounds(collider));

  const boundsHalfX = (bounds.max.x - bounds.min.x) / 2;
  const boundsHalfZ = (bounds.max.z - bounds.min.z) / 2;
  const offsetX = (bounds.min.x + bounds.max.x) / 2 - footprint.centerX;
  const offsetZ = (bounds.min.z + bounds.max.z) / 2 - footprint.centerZ;
  const cosine = Math.cos(footprint.rotationY);
  const sine = Math.sin(footprint.rotationY);
  return Math.abs(offsetX)
      < boundsHalfX + Math.abs(cosine) * footprint.halfWidth
        + Math.abs(sine) * footprint.halfDepth - EPSILON
    && Math.abs(offsetZ)
      < boundsHalfZ + Math.abs(sine) * footprint.halfWidth
        + Math.abs(cosine) * footprint.halfDepth - EPSILON
    && Math.abs(cosine * offsetX - sine * offsetZ)
      < footprint.halfWidth + Math.abs(cosine) * boundsHalfX
        + Math.abs(sine) * boundsHalfZ - EPSILON
    && Math.abs(sine * offsetX + cosine * offsetZ)
      < footprint.halfDepth + Math.abs(sine) * boundsHalfX
        + Math.abs(cosine) * boundsHalfZ - EPSILON;
}

export function validateShipItemSurfaces(
  surfaces: readonly ShipItemSurface[],
  shellColliders: readonly CollisionBox[] = [],
  furnitureColliderById?: ReadonlyMap<string, CollisionBox>,
): void {
  const ids = new Set<string>();
  const physicalSlots = new Set<string>();
  for (const surface of surfaces) {
    if (ids.has(surface.id)) throw new Error(`Duplicate ship item surface id: ${surface.id}`);
    ids.add(surface.id);
    if (!surface.furnitureId.trim()) {
      throw new Error(`Ship item surface ${surface.id} has no furniture owner`);
    }
    if (!surface.physicalSlotId.trim()) {
      throw new Error(`Ship item surface ${surface.id} has no physical slot id`);
    }
    if (physicalSlots.has(surface.physicalSlotId)) {
      throw new Error(`Duplicate ship item physical slot id: ${surface.physicalSlotId}`);
    }
    physicalSlots.add(surface.physicalSlotId);
    if (!SCAVENGE_REGION_IDS.has(surface.regionId)) {
      throw new Error(`Ship item surface ${surface.id} has an unknown scavenge region`);
    }
    if (!finiteVector(surface.position)
      || !surface.rotation.toArray().slice(0, 3).every(Number.isFinite)
      || !Number.isFinite(surface.footprint.width)
      || !Number.isFinite(surface.footprint.depth)
      || !Number.isFinite(surface.clearanceHeight)
      || surface.footprint.width <= 0
      || surface.footprint.depth <= 0
      || surface.clearanceHeight <= 0) {
      throw new Error(`Ship item surface ${surface.id} must have positive finite dimensions`);
    }
    if (surface.standingPoints.length === 0
      || surface.standingPoints.some((point) => !finiteVector(point))) {
      throw new Error(`Ship item surface ${surface.id} must have a standing point`);
    }
    if (surface.standingPoints.every(
      (point) => Math.hypot(
        point.x - surface.position.x,
        point.y + STANDING_EYE_HEIGHT - surface.position.y,
        point.z - surface.position.z,
      ) > MAX_INTERACTION_DISTANCE + EPSILON,
    )) {
      throw new Error(`Ship item surface ${surface.id} has no standing point within interaction reach`);
    }
    if (!furnitureColliderById) continue;
    const owner = furnitureColliderById.get(surface.furnitureId);
    if (!owner) {
      throw new Error(`Ship item surface ${surface.id} has missing furniture owner ${surface.furnitureId}`);
    }
    const owned = owner as CollisionBox & { furnitureModelId?: ShipFurnitureKind };
    if (owned.furnitureModelId && owned.furnitureModelId !== surface.furnitureModelId) {
      throw new Error(`Ship item surface ${surface.id} does not match owner ${surface.furnitureId}`);
    }
    const volume = surfaceVolume(surface);
    if (volume.min.x < owner.minX - EPSILON || volume.max.x > owner.maxX + EPSILON
      || volume.min.z < owner.minZ - EPSILON || volume.max.z > owner.maxZ + EPSILON
      || surface.position.y < owner.minY - EPSILON
      || surface.position.y > owner.maxY + EPSILON) {
      throw new Error(`Ship item surface ${surface.id} exceeds owner ${surface.furnitureId} bounds`);
    }
    if (surface.furnitureModelId !== 'bookcaseOpen'
      && surface.furnitureModelId !== 'workroomStorageShelf'
      && surface.furnitureModelId !== 'bedBunk'
      && owner.maxY > surface.position.y + EPSILON) {
      throw new Error(`Ship item surface ${surface.id} is blocked above owner ${surface.furnitureId}`);
    }
    const clearance = volume.clone().expandByVector(
      new Vector3(STRUCTURE_CLEARANCE, 0, STRUCTURE_CLEARANCE),
    );
    shellColliders.forEach((collider, index) => {
      if (positiveVolumeOverlapCollider(clearance, collider)) {
        throw new Error(
          `Ship item surface ${surface.id} violates wall clearance ${STRUCTURE_CLEARANCE} at shell collider ${index}`,
        );
      }
    });
    furnitureColliderById.forEach((collider, furnitureId) => {
      if (furnitureId !== surface.furnitureId
        && positiveVolumeOverlap(clearance, collisionBounds(collider))) {
        throw new Error(`Ship item surface ${surface.id} intersects furniture ${furnitureId}`);
      }
    });
  }

  surfaces.forEach((left, leftIndex) => surfaces.slice(leftIndex + 1).forEach((right) => {
    if (positiveVolumeOverlap(surfaceVolume(left), surfaceVolume(right))) {
      throw new Error(`Overlapping ship item surfaces: ${left.id}, ${right.id}`);
    }
  }));
}

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

interface SurfaceFit {
  readonly bounds: Box3;
  readonly position: Vector3;
  readonly rotation: Euler;
  readonly scale: number;
}

interface PlacementCandidate {
  readonly surface: ShipItemSurface;
  readonly fit: SurfaceFit;
  readonly standingPoint: Vector3;
}

function scavengingRestingRotation(itemId: ItemId, surface: ShipItemSurface): Euler {
  const surfaceRotation = surface.rotation;
  if (itemId === 'compass') {
    const surfaceOrientation = new Quaternion().setFromEuler(surfaceRotation);
    const lyingOrientation = new Quaternion().setFromEuler(
      new Euler(Math.PI / 2, Math.PI, 0),
    );
    return new Euler().setFromQuaternion(surfaceOrientation.multiply(lyingOrientation));
  }
  if (itemId === 'anchor' || itemId === 'ductTape') {
    const surfaceOrientation = new Quaternion().setFromEuler(surfaceRotation);
    const lyingOrientation = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      Math.PI / 2,
    );
    return new Euler().setFromQuaternion(surfaceOrientation.multiply(lyingOrientation));
  }
  if (itemId === 'umbrella') {
    return new Euler(0, surfaceRotation.y + UMBRELLA_FLOOR_ANGLE, UMBRELLA_REST_TILT);
  }
  const rotation = surfaceRotation.clone();
  if (itemId === 'carlitos') {
    rotation.y = Math.atan2(surface.position.x, surface.position.z);
  }
  return rotation;
}

function surfaceFit(surface: ShipItemSurface, itemId: ItemId): SurfaceFit | undefined {
  const rotation = scavengingRestingRotation(itemId, surface);
  const fitBounds = orientedItemBounds(
    itemId,
    itemId === 'anchor' || itemId === 'compass' || itemId === 'ductTape' || itemId === 'carlitos'
      ? rotation
      : surface.rotation,
  );
  const size = fitBounds.getSize(new Vector3());
  const measuredScale = Math.min(
    1,
    surface.footprint.width / size.x,
    surface.footprint.depth / size.z,
    surface.clearanceHeight / size.y,
  );
  const scale = measuredScale >= 1 - EPSILON ? 1 : measuredScale;
  if (!Number.isFinite(scale) || scale < MIN_UNIFORM_SCALE - EPSILON) return undefined;
  const bounds = orientedItemBounds(itemId, rotation);
  const position = surface.position.clone();
  position.y -= (itemId === 'umbrella' ? UMBRELLA_REST_MIN_Y : bounds.min.y) * scale;
  const itemCenter = bounds.getCenter(new Vector3()).multiplyScalar(scale).add(position);
  if (!surface.standingPoints.some((point) => {
    const interactionPoint = point.clone();
    interactionPoint.y += STANDING_EYE_HEIGHT;
    return interactionPoint.distanceTo(itemCenter) <= MAX_INTERACTION_DISTANCE + EPSILON;
  })) return undefined;
  return { bounds, position, rotation, scale };
}

function surfaceFitAvoidsBlockers(
  surface: ShipItemSurface,
  itemId: ItemId,
  fit: SurfaceFit,
  blockers: readonly CollisionBox[],
): boolean {
  const itemBounds = shipItemTransformBounds(itemId, {
    position: fit.position,
    rotation: fit.rotation,
    scale: fit.scale,
  });
  return blockers.every((blocker) => {
    const owned = blocker as CollisionBox & { furnitureId?: string };
    return owned.furnitureId === surface.furnitureId
      || !positiveVolumeOverlap(itemBounds, collisionBounds(blocker));
  });
}

function chosenStandingPoint(
  surface: ShipItemSurface,
  context?: ShipPlacementContext,
): { readonly point: Vector3; readonly depositDistance?: number } | undefined {
  if (!context) return { point: surface.standingPoints[0]!.clone() };
  let selected: { readonly point: Vector3; readonly depositDistance: number } | undefined;
  for (const point of surface.standingPoints) {
    const distance = context.routeMetric.distance(
      [point.x, point.z],
      context.deposit,
    );
    if (distance === null || !Number.isFinite(distance) || distance < 0) continue;
    if (!selected || distance < selected.depositDistance) {
      selected = { point: point.clone(), depositDistance: distance };
    }
  }
  return selected;
}

function candidateFor(
  instance: ItemInstance,
  surface: ShipItemSurface,
  blockers: readonly CollisionBox[],
  context?: ShipPlacementContext,
): PlacementCandidate | undefined {
  const fit = surfaceFit(surface, instance.type);
  if (!fit || !surfaceFitAvoidsBlockers(surface, instance.type, fit, blockers)) return undefined;
  const standing = chosenStandingPoint(surface, context);
  if (!standing) return undefined;
  const weight = ITEM_DEFINITIONS[instance.type].weight;
  if (weight === 3
    && (surface.regionId === 'storageWorkroom' || surface.regionId === 'crewCabin')) {
    return undefined;
  }
  if (standing.depositDistance !== undefined
    && weight === 3
    && standing.depositDistance > MAX_HEAVY_ITEM_DEPOSIT_DISTANCE + EPSILON) return undefined;
  return { surface, fit, standingPoint: standing.point };
}

function transformFor(candidate: PlacementCandidate): ShipItemTransform {
  return {
    surfaceId: candidate.surface.id,
    physicalSlotId: candidate.surface.physicalSlotId,
    furnitureId: candidate.surface.furnitureId,
    regionId: candidate.surface.regionId,
    branch: candidate.surface.branch,
    standingPoint: candidate.standingPoint.clone(),
    position: candidate.fit.position.clone(),
    rotation: candidate.fit.rotation.clone(),
    scale: candidate.fit.scale,
    placementSource: 'random',
  };
}

function separatedFromAssignments(
  candidate: PlacementCandidate,
  assignments: ReadonlyMap<ItemInstanceId, ShipItemTransform>,
): boolean {
  for (const transform of assignments.values()) {
    const dx = candidate.fit.position.x - transform.position.x;
    const dz = candidate.fit.position.z - transform.position.z;
    if (Math.hypot(dx, dz) < MIN_ITEM_SEPARATION - EPSILON) return false;
  }
  return true;
}

function randomAssignment(
  instances: readonly ItemInstance[],
  surfaces: readonly ShipItemSurface[],
  random: () => number,
  blockers: readonly CollisionBox[],
  context?: ShipPlacementContext,
): Map<ItemInstanceId, ShipItemTransform> | undefined {
  const eligible = new Map<ItemInstanceId, PlacementCandidate[]>();
  for (const instance of instances) {
    eligible.set(instance.instanceId, shuffled(
      surfaces.flatMap((surface) => {
        const candidate = candidateFor(instance, surface, blockers, context);
        return candidate ? [candidate] : [];
      }),
      random,
    ));
  }
  if (instances.some((instance) => eligible.get(instance.instanceId)!.length === 0)
    || instances.length > new Set(surfaces.map(({ physicalSlotId }) => physicalSlotId)).size) {
    return undefined;
  }
  const sorted = shuffled(instances, random).sort((left, right) =>
    Number(ITEM_DEFINITIONS[right.type].weight === 3)
      - Number(ITEM_DEFINITIONS[left.type].weight === 3)
  );
  const assignments = new Map<ItemInstanceId, ShipItemTransform>();
  const usedSlots = new Set<string>();
  let visitedNodes = 0;
  const place = (index: number): boolean => {
    if (visitedNodes >= MAX_BACKTRACK_NODES_PER_ATTEMPT) return false;
    visitedNodes += 1;
    if (index === sorted.length) return true;
    const instance = sorted[index]!;
    for (const candidate of eligible.get(instance.instanceId)!) {
      if (usedSlots.has(candidate.surface.physicalSlotId)
        || !separatedFromAssignments(candidate, assignments)) continue;
      usedSlots.add(candidate.surface.physicalSlotId);
      assignments.set(instance.instanceId, transformFor(candidate));
      if (place(index + 1)) return true;
      assignments.delete(instance.instanceId);
      usedSlots.delete(candidate.surface.physicalSlotId);
    }
    return false;
  };
  return place(0) ? assignments : undefined;
}

export function assignShipItems(
  instances: readonly ItemInstance[],
  surfaces: readonly ShipItemSurface[],
  random: () => number = Math.random,
  blockers: readonly CollisionBox[] = [],
  placementContext?: ShipPlacementContext,
): Map<ItemInstanceId, ShipItemTransform> {
  let validatedBlockers = validatedSurfaceInputs.get(surfaces);
  if (!validatedBlockers?.has(blockers)) {
    const furnitureColliderById = new Map<string, CollisionBox>();
    const shellColliders = blockers.filter((blocker) => {
      const furnitureId = (blocker as CollisionBox & { furnitureId?: string }).furnitureId;
      if (!furnitureId) return true;
      furnitureColliderById.set(furnitureId, blocker);
      return false;
    });
    validateShipItemSurfaces(
      surfaces,
      shellColliders,
      blockers.length > 0 ? furnitureColliderById : undefined,
    );
    if (!validatedBlockers) {
      validatedBlockers = new WeakSet();
      validatedSurfaceInputs.set(surfaces, validatedBlockers);
    }
    validatedBlockers.add(blockers);
  }

  if (instances.length === 0) return new Map();
  for (let attempt = 0; attempt < RANDOM_PLACEMENT_ATTEMPTS; attempt += 1) {
    const assignment = randomAssignment(
      instances,
      surfaces,
      random,
      blockers,
      placementContext,
    );
    if (assignment) return assignment;
  }
  throw new ShipItemPlacementError(instances[0]!.instanceId);
}

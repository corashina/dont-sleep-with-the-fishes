import { Box3, Euler, Vector3 } from 'three';
import {
  ITEM_DEFINITIONS,
  ITEM_IDS,
  type ItemId,
} from '../game/itemCatalog';
import {
  planBaselineScavengeRoute,
  planExpertScavengeRoute,
  type ScavengeRouteAssignment,
} from '../game/ScavengeRoutePlanner';
import type { ScavengeItemInstanceId } from '../game/scavengeCatalog';
import type { ItemInstance, ItemInstanceId } from '../game/ItemState';
import type { CollisionBox } from '../player/collisions';
import {
  SCAVENGE_REGION_IDS,
  type ScavengeRegionId,
  type ShipFurnitureKind,
  type ShipRouteMetric,
} from './ShipLayout';
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
  readonly placementSource: 'generated' | 'fallback';
}

export interface ShipPlacementContext {
  readonly routeMetric: ShipRouteMetric;
  readonly start: readonly [number, number];
  readonly deposit: readonly [number, number];
  readonly evacuation: readonly [number, number];
  readonly maxAttempts?: number;
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
const EPSILON = 1e-6;

export const SCAVENGE_GENERATED_PLACEMENT_ATTEMPTS = 64;

const REGION_LIMITS: Readonly<Record<
  ScavengeRegionId,
  { readonly minimum: number; readonly maximum: number }
>> = Object.freeze({
  crewCabin: Object.freeze({ minimum: 3, maximum: 4 }),
  wheelhouse: Object.freeze({ minimum: 2, maximum: 3 }),
  centralCargo: Object.freeze({ minimum: 6, maximum: 7 }),
  storageWorkroom: Object.freeze({ minimum: 3, maximum: 4 }),
  bow: Object.freeze({ minimum: 2, maximum: 3 }),
  stern: Object.freeze({ minimum: 2, maximum: 3 }),
});

const REGION_IDS = Object.freeze([...SCAVENGE_REGION_IDS]);

export const SCAVENGE_FALLBACK_SURFACE_BY_INSTANCE = Object.freeze({
  'cannedFood-1': 'cargo-crate-aft-port:top',
  'cannedFood-2': 'workroom-crate-center-starboard:top',
  'cannedFood-3': 'stern-crate-port:top',
  'baitTin-1': 'storage-shelf-forward:shelf-left',
  'baitTin-2': 'bow-barrel-port-center:top',
  'ductTape-1': 'stern-crate-starboard:top',
  'compass-1': 'cabin-desk-aft:top-left',
  'map-1': 'cargo-crate-forward-port:top',
  'medicalKit-1': 'cargo-crate-aft-starboard:top',
  'spyglass-1': 'chart-table-port:top-far-right',
  'fishingNet-1': 'cargo-rack-starboard:top-left',
  'bucket-1': 'cabin-cabinet-port-forward:top',
  'flareGun-1': 'bow-crate-starboard:top',
  'scubaSet-1': 'cargo-crate-forward-starboard:top',
  'anchor-1': 'cabin-bunk-port:rest',
  'bottledPaper-1': 'chart-table-port:top-left',
  'umbrella-1': 'workbench-starboard:top-right',
  'swimRing-1': 'cabin-desk-starboard-aft:top-left',
  'flashlight-1': 'bow-crate-port:top',
  'harpoonGun-1': 'workroom-crate-center-port:top',
  'captainWhiskers-1': 'cargo-rack-port:top-left',
} satisfies Record<ScavengeItemInstanceId, string>);

const SCAVENGE_GENERATED_BASE_SURFACE_BY_INSTANCE = Object.freeze({
  'cannedFood-1': 'cargo-crate-aft-port:top',
  'cannedFood-2': 'workbench-port:top-left',
  'cannedFood-3': 'stern-crate-port:top',
  'baitTin-1': 'storage-shelf-forward:shelf-left',
  'baitTin-2': 'bow-barrel-port-center:top',
  'ductTape-1': 'stern-barrel-port-center:top',
  'compass-1': 'cargo-crate-forward-port:top',
  'map-1': 'cabin-desk-aft:top-right',
  'medicalKit-1': 'workroom-crate-center-port:top',
  'spyglass-1': 'chart-table-port:top-far-right',
  'fishingNet-1': 'cargo-rack-starboard:top-left',
  'bucket-1': 'cabin-cabinet-port-forward:top',
  'flareGun-1': 'bow-crate-starboard:top',
  'scubaSet-1': 'cargo-crate-forward-starboard:top',
  'anchor-1': 'cabin-bunk-port:rest',
  'bottledPaper-1': 'chart-table-port:top-left',
  'umbrella-1': 'workbench-starboard:top-right',
  'swimRing-1': 'cabin-desk-starboard-aft:top-left',
  'flashlight-1': 'bow-box-starboard-center:top',
  'harpoonGun-1': 'cargo-rod-rack-port:rod',
  'captainWhiskers-1': 'cargo-rack-port:top-right',
} satisfies Record<ScavengeItemInstanceId, string>);

const SCAVENGE_GENERATED_LAYOUT_OVERRIDES = Object.freeze([
  {
    'map-1': 'cabin-bunk-starboard:rest',
  },
  {
    'cannedFood-2': 'workroom-crate-center-starboard:top',
    'ductTape-1': 'stern-crate-starboard:top',
    'medicalKit-1': 'cargo-crate-aft-starboard:top',
    'bucket-1': 'cargo-rack-port:top-right',
    'scubaSet-1': 'cabin-table-starboard-center:top-right',
    'bottledPaper-1': 'chart-table-forward:top-left',
    'swimRing-1': 'cargo-crate-forward-starboard:top',
    'flashlight-1': 'bow-crate-port:top',
    'harpoonGun-1': 'workroom-crate-center-port:top',
    'captainWhiskers-1': 'cabin-cabinet-port-forward:top',
  },
  {
    'cannedFood-2': 'workroom-crate-center-starboard:top',
    'ductTape-1': 'stern-crate-starboard:top',
    'spyglass-1': 'chart-table-forward:top-left',
    'fishingNet-1': 'workbench-starboard:top-right',
    'umbrella-1': 'cargo-rack-starboard:top-right',
    'flashlight-1': 'bow-crate-port:top',
    'captainWhiskers-1': 'cargo-rack-port:top-left',
  },
  {
    'cannedFood-2': 'workroom-crate-center-starboard:top',
    'ductTape-1': 'stern-crate-starboard:top',
    'medicalKit-1': 'cargo-crate-aft-starboard:top',
    'spyglass-1': 'chart-table-forward:top-left',
    'fishingNet-1': 'cargo-rack-starboard:top-right',
    'flareGun-1': 'bow-box-starboard-center:top',
    'scubaSet-1': 'cabin-table-starboard-center:top-right',
    'swimRing-1': 'cargo-crate-forward-starboard:top',
    'flashlight-1': 'bow-crate-port:top',
    'harpoonGun-1': 'workroom-crate-center-port:top',
    'captainWhiskers-1': 'cargo-rack-port:top-left',
  },
  {
    'cannedFood-2': 'workroom-crate-center-starboard:top',
    'ductTape-1': 'stern-crate-starboard:top',
    'compass-1': 'cabin-desk-aft:top-right',
    'map-1': 'cargo-crate-forward-port:top',
    'bucket-1': 'cargo-rack-port:top-right',
    'swimRing-1': 'cabin-table-starboard-center:top-left',
    'captainWhiskers-1': 'cabin-cabinet-port-forward:top',
  },
  {
    'cannedFood-2': 'workroom-crate-center-starboard:top',
    'baitTin-1': 'storage-shelf-forward:shelf-right',
    'ductTape-1': 'stern-crate-starboard:top',
    'medicalKit-1': 'cargo-crate-aft-starboard:top',
    'flareGun-1': 'bow-box-starboard-center:top',
    'scubaSet-1': 'cabin-table-starboard-center:top-right',
    'bottledPaper-1': 'chart-table-forward:top-left',
    'swimRing-1': 'cargo-crate-forward-starboard:top',
    'flashlight-1': 'bow-crate-port:top',
    'harpoonGun-1': 'workroom-crate-center-port:top',
    'captainWhiskers-1': 'cargo-rack-port:top-left',
  },
  {
    'ductTape-1': 'stern-crate-starboard:top',
    'medicalKit-1': 'cargo-crate-aft-starboard:top',
    'flareGun-1': 'bow-box-starboard-center:top',
    'anchor-1': 'cargo-rack-port:top-right',
    'bottledPaper-1': 'chart-table-forward:top-left',
    'flashlight-1': 'bow-crate-port:top',
    'harpoonGun-1': 'workroom-crate-center-port:top',
    'captainWhiskers-1': 'cabin-bunk-port:rest',
  },
  {
    'cannedFood-2': 'workroom-crate-center-starboard:top',
    'baitTin-1': 'storage-shelf-forward:shelf-right',
    'ductTape-1': 'stern-crate-starboard:top',
    'compass-1': 'cabin-desk-aft:top-right',
    'map-1': 'cargo-crate-forward-port:top',
    'medicalKit-1': 'cargo-crate-aft-starboard:top',
    'spyglass-1': 'chart-table-forward:top-left',
    'bucket-1': 'cargo-rack-port:top-right',
    'scubaSet-1': 'cabin-table-starboard-center:top-right',
    'swimRing-1': 'cargo-crate-forward-starboard:top',
    'flashlight-1': 'bow-crate-port:top',
    'harpoonGun-1': 'workroom-crate-center-port:top',
    'captainWhiskers-1': 'cabin-cabinet-port-forward:top',
  },
  {
    'cannedFood-2': 'workroom-crate-center-starboard:top',
    'baitTin-1': 'storage-shelf-forward:shelf-right',
    'compass-1': 'cabin-desk-aft:top-right',
    'map-1': 'cargo-crate-forward-port:top',
    'medicalKit-1': 'cargo-crate-aft-starboard:top',
    'bucket-1': 'cargo-rack-port:top-right',
    'scubaSet-1': 'cabin-table-starboard-center:top-right',
    'bottledPaper-1': 'chart-table-forward:top-left',
    'swimRing-1': 'cargo-crate-forward-starboard:top',
    'flashlight-1': 'bow-crate-port:top',
    'harpoonGun-1': 'workroom-crate-center-port:top',
    'captainWhiskers-1': 'cabin-cabinet-port-forward:top',
  },
  {
    'cannedFood-2': 'workroom-crate-center-starboard:top',
    'ductTape-1': 'stern-crate-starboard:top',
    'compass-1': 'cabin-desk-aft:top-right',
    'map-1': 'cargo-crate-forward-port:top',
    'spyglass-1': 'chart-table-forward:top-left',
    'fishingNet-1': 'workbench-starboard:top-right',
    'flareGun-1': 'bow-box-starboard-center:top',
    'umbrella-1': 'cargo-rack-starboard:top-right',
    'flashlight-1': 'bow-crate-port:top',
  },
  {
    'cannedFood-2': 'workroom-crate-center-starboard:top',
    'spyglass-1': 'chart-table-forward:top-left',
    'fishingNet-1': 'workbench-starboard:top-right',
    'umbrella-1': 'cargo-rack-starboard:top-right',
    'flashlight-1': 'bow-crate-port:top',
    'captainWhiskers-1': 'cargo-rack-port:top-left',
  },
] satisfies readonly Partial<Record<ScavengeItemInstanceId, string>>[]);

const SCAVENGE_GENERATED_SURFACE_MAPS: readonly Readonly<
  Record<ScavengeItemInstanceId, string>
>[] = Object.freeze([
  SCAVENGE_GENERATED_BASE_SURFACE_BY_INSTANCE,
  ...SCAVENGE_GENERATED_LAYOUT_OVERRIDES.map((overrides) => Object.freeze({
    ...SCAVENGE_GENERATED_BASE_SURFACE_BY_INSTANCE,
    ...overrides,
  })),
]);

const PRODUCTION_INSTANCE_IDS = Object.freeze(
  Object.keys(SCAVENGE_GENERATED_BASE_SURFACE_BY_INSTANCE).sort(),
);

const validatedSurfaceInputs = new WeakMap<
  readonly ShipItemSurface[],
  WeakSet<readonly CollisionBox[]>
>();

const generatedTemplateCache = new WeakMap<
  ShipPlacementContext,
  {
    readonly surfaces: readonly ShipItemSurface[];
    readonly blockers: readonly CollisionBox[];
    readonly templates: readonly ReadonlyMap<ItemInstanceId, ShipItemTransform>[];
  }
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
  return new Box3(
    bounds.min.clone().multiplyScalar(transform.scale).add(transform.position),
    bounds.max.clone().multiplyScalar(transform.scale).add(transform.position),
  );
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
      (point) => point.distanceTo(surface.position) > MAX_INTERACTION_DISTANCE + EPSILON,
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
  readonly scale: number;
}

interface PlacementCandidate {
  readonly surface: ShipItemSurface;
  readonly fit: SurfaceFit;
  readonly standingPoint: Vector3;
}

function surfaceFit(surface: ShipItemSurface, itemId: ItemId): SurfaceFit | undefined {
  const bounds = orientedItemBounds(itemId, surface.rotation);
  const size = bounds.getSize(new Vector3());
  const measuredScale = Math.min(
    1,
    surface.footprint.width / size.x,
    surface.footprint.depth / size.z,
    surface.clearanceHeight / size.y,
  );
  const scale = measuredScale >= 1 - EPSILON ? 1 : measuredScale;
  if (!Number.isFinite(scale) || scale < MIN_UNIFORM_SCALE - EPSILON) return undefined;
  const position = surface.position.clone();
  position.y -= bounds.min.y * scale;
  const itemCenter = bounds.getCenter(new Vector3()).multiplyScalar(scale).add(position);
  if (!surface.standingPoints.some((point) => {
    const interactionPoint = point.clone();
    interactionPoint.y += STANDING_EYE_HEIGHT;
    return interactionPoint.distanceTo(itemCenter) <= MAX_INTERACTION_DISTANCE + EPSILON;
  })) return undefined;
  return { bounds, position, scale };
}

function surfaceFitAvoidsBlockers(
  surface: ShipItemSurface,
  itemId: ItemId,
  fit: SurfaceFit,
  blockers: readonly CollisionBox[],
): boolean {
  const itemBounds = shipItemTransformBounds(itemId, {
    position: fit.position,
    rotation: surface.rotation,
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
  if (standing.depositDistance !== undefined
    && ((weight === 3 && standing.depositDistance > 14 + EPSILON)
      || (weight === 2 && standing.depositDistance > 22 + EPSILON))) return undefined;
  return { surface, fit, standingPoint: standing.point };
}

function transformFor(
  candidate: PlacementCandidate,
  placementSource: ShipItemTransform['placementSource'],
): ShipItemTransform {
  return {
    surfaceId: candidate.surface.id,
    physicalSlotId: candidate.surface.physicalSlotId,
    furnitureId: candidate.surface.furnitureId,
    regionId: candidate.surface.regionId,
    branch: candidate.surface.branch,
    standingPoint: candidate.standingPoint.clone(),
    position: candidate.fit.position.clone(),
    rotation: candidate.surface.rotation.clone(),
    scale: candidate.fit.scale,
    placementSource,
  };
}

function isProductionCatalog(instances: readonly ItemInstance[]): boolean {
  if (instances.length !== PRODUCTION_INSTANCE_IDS.length) return false;
  const ids = instances.map(({ instanceId }) => instanceId).sort();
  return ids.every((id, index) => id === PRODUCTION_INSTANCE_IDS[index]);
}

function routeAssignments(
  instances: readonly ItemInstance[],
  assignments: ReadonlyMap<ItemInstanceId, ShipItemTransform>,
): readonly ScavengeRouteAssignment[] {
  return instances.map((instance) => {
    const transform = assignments.get(instance.instanceId)!;
    return {
      instanceId: instance.instanceId,
      weight: ITEM_DEFINITIONS[instance.type].weight,
      position: [transform.standingPoint.x, transform.standingPoint.z] as const,
      branch: transform.branch,
    };
  });
}

function routeChecksPass(
  instances: readonly ItemInstance[],
  assignments: ReadonlyMap<ItemInstanceId, ShipItemTransform>,
  context: ShipPlacementContext,
): boolean {
  const input = {
    assignments: routeAssignments(instances, assignments),
    start: context.start,
    deposit: context.deposit,
    evacuation: context.evacuation,
    metric: context.routeMetric,
  };
  const expert = planExpertScavengeRoute(input);
  if (!expert || expert.seconds < 54 - EPSILON || expert.seconds > 58 + EPSILON) return false;
  const baseline = planBaselineScavengeRoute(input);
  return baseline.savedCount >= 15
    && baseline.savedCount <= 17
    && baseline.evacuated
    && baseline.seconds <= 60 + EPSILON
    && baseline.actions.at(-1)?.type === 'evacuate';
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

function cloneGeneratedTemplate(
  template: ReadonlyMap<ItemInstanceId, ShipItemTransform>,
): Map<ItemInstanceId, ShipItemTransform> {
  return new Map([...template].map(([instanceId, transform]) => [instanceId, {
    ...transform,
    standingPoint: transform.standingPoint.clone(),
    position: transform.position.clone(),
    rotation: transform.rotation.clone(),
    placementSource: 'generated' as const,
  }]));
}

function generatedSpatialTemplates(
  instances: readonly ItemInstance[],
  surfaces: readonly ShipItemSurface[],
  blockers: readonly CollisionBox[],
  context: ShipPlacementContext,
): readonly ReadonlyMap<ItemInstanceId, ShipItemTransform>[] {
  const useCache = context.routeMetric.stable === true;
  const cached = useCache ? generatedTemplateCache.get(context) : undefined;
  if (cached?.surfaces === surfaces && cached.blockers === blockers) return cached.templates;

  const surfaceById = new Map(surfaces.map((surface) => [surface.id, surface]));
  const templates: ReadonlyMap<ItemInstanceId, ShipItemTransform>[] = [];
  for (const surfaceMap of SCAVENGE_GENERATED_SURFACE_MAPS) {
    const assignment = new Map<ItemInstanceId, ShipItemTransform>();
    const usedSlots = new Set<string>();
    let valid = true;
    for (const instance of instances) {
      const surfaceId = surfaceMap[instance.instanceId as ScavengeItemInstanceId];
      const surface = surfaceId ? surfaceById.get(surfaceId) : undefined;
      const candidate = surface
        ? candidateFor(instance, surface, blockers, context)
        : undefined;
      if (!candidate
        || usedSlots.has(candidate.surface.physicalSlotId)
        || !separatedFromAssignments(candidate, assignment)) {
        valid = false;
        break;
      }
      usedSlots.add(candidate.surface.physicalSlotId);
      assignment.set(instance.instanceId, transformFor(candidate, 'generated'));
    }
    if (valid
      && assignment.size === instances.length
      && productionCountsPass(assignment)
      && routeChecksPass(instances, assignment, context)) {
      templates.push(assignment);
    }
  }
  if (useCache) {
    generatedTemplateCache.set(context, { surfaces, blockers, templates });
  }
  return templates;
}

function selectRegionTargets(random: () => number): Record<ScavengeRegionId, number> {
  const targets = Object.fromEntries(REGION_IDS.map((regionId) => [
    regionId,
    REGION_LIMITS[regionId].minimum,
  ])) as Record<ScavengeRegionId, number>;
  const available = [...REGION_IDS];
  for (let index = 0; index < 3; index += 1) {
    const selectedIndex = Math.floor(randomUnit(random) * available.length);
    const regionId = available.splice(selectedIndex, 1)[0]!;
    targets[regionId] += 1;
  }
  return targets;
}

function simpleAssignment(
  instances: readonly ItemInstance[],
  surfaces: readonly ShipItemSurface[],
  random: () => number,
  blockers: readonly CollisionBox[],
): Map<ItemInstanceId, ShipItemTransform> | undefined {
  const eligible = new Map<ItemInstanceId, PlacementCandidate[]>();
  for (const instance of instances) {
    eligible.set(instance.instanceId, shuffled(
      surfaces.flatMap((surface) => {
        const candidate = candidateFor(instance, surface, blockers);
        return candidate ? [candidate] : [];
      }),
      random,
    ));
  }
  if (instances.length > surfaces.length) return undefined;
  const sorted = [...instances].sort((left, right) =>
    eligible.get(left.instanceId)!.length - eligible.get(right.instanceId)!.length
    || ITEM_DEFINITIONS[right.type].weight - ITEM_DEFINITIONS[left.type].weight
    || left.instanceId.localeCompare(right.instanceId)
  );
  const assignments = new Map<ItemInstanceId, ShipItemTransform>();
  const usedSlots = new Set<string>();
  const place = (index: number): boolean => {
    if (index === sorted.length) return true;
    const instance = sorted[index]!;
    for (const candidate of eligible.get(instance.instanceId)!) {
      if (usedSlots.has(candidate.surface.physicalSlotId)) continue;
      usedSlots.add(candidate.surface.physicalSlotId);
      assignments.set(instance.instanceId, transformFor(candidate, 'generated'));
      if (place(index + 1)) return true;
      assignments.delete(instance.instanceId);
      usedSlots.delete(candidate.surface.physicalSlotId);
    }
    return false;
  };
  return place(0) ? assignments : undefined;
}

function generatedProductionAssignment(
  instances: readonly ItemInstance[],
  surfaces: readonly ShipItemSurface[],
  random: () => number,
  blockers: readonly CollisionBox[],
  context: ShipPlacementContext,
): Map<ItemInstanceId, ShipItemTransform> | undefined {
  const templates = generatedSpatialTemplates(instances, surfaces, blockers, context);
  if (templates.length > 0) {
    const selected = templates[Math.floor(randomUnit(random) * templates.length)]!;
    return cloneGeneratedTemplate(selected);
  }

  const regionTargets = selectRegionTargets(random);
  const branchTarget = 4 + Math.floor(randomUnit(random) * 3);
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
  const sorted = [...instances].sort((left, right) =>
    eligible.get(left.instanceId)!.length - eligible.get(right.instanceId)!.length
    || ITEM_DEFINITIONS[right.type].weight - ITEM_DEFINITIONS[left.type].weight
    || left.instanceId.localeCompare(right.instanceId)
  );
  const assignments = new Map<ItemInstanceId, ShipItemTransform>();
  const usedSlots = new Set<string>();
  const regionCounts = Object.fromEntries(
    REGION_IDS.map((regionId) => [regionId, 0]),
  ) as Record<ScavengeRegionId, number>;
  let branchCount = 0;
  let completeChecked = false;
  let visitedNodes = 0;

  const place = (index: number): boolean => {
    if (visitedNodes >= MAX_BACKTRACK_NODES_PER_ATTEMPT) return false;
    visitedNodes += 1;
    if (index === sorted.length) {
      completeChecked = true;
      return branchCount === branchTarget
        && routeChecksPass(instances, assignments, context);
    }
    const instance = sorted[index]!;
    for (const candidate of eligible.get(instance.instanceId)!) {
      if (completeChecked) return false;
      const { surface } = candidate;
      if (usedSlots.has(surface.physicalSlotId)
        || regionCounts[surface.regionId] >= regionTargets[surface.regionId]
        || (surface.branch && branchCount >= branchTarget)
        || !separatedFromAssignments(candidate, assignments)) continue;
      usedSlots.add(surface.physicalSlotId);
      regionCounts[surface.regionId] += 1;
      if (surface.branch) branchCount += 1;
      assignments.set(instance.instanceId, transformFor(candidate, 'generated'));
      const remaining = sorted.length - index - 1;
      if (branchCount <= branchTarget
        && branchCount + remaining >= branchTarget
        && place(index + 1)) return true;
      assignments.delete(instance.instanceId);
      if (surface.branch) branchCount -= 1;
      regionCounts[surface.regionId] -= 1;
      usedSlots.delete(surface.physicalSlotId);
    }
    return false;
  };
  return place(0) ? assignments : undefined;
}

function productionCountsPass(
  assignments: ReadonlyMap<ItemInstanceId, ShipItemTransform>,
): boolean {
  const counts = Object.fromEntries(REGION_IDS.map((regionId) => [
    regionId,
    [...assignments.values()].filter((value) => value.regionId === regionId).length,
  ])) as Record<ScavengeRegionId, number>;
  if (REGION_IDS.some((regionId) => counts[regionId] < REGION_LIMITS[regionId].minimum
    || counts[regionId] > REGION_LIMITS[regionId].maximum)) return false;
  const branchCount = [...assignments.values()].filter(({ branch }) => branch).length;
  return branchCount >= 4 && branchCount <= 6;
}

function fallbackAssignment(
  instances: readonly ItemInstance[],
  surfaces: readonly ShipItemSurface[],
  blockers: readonly CollisionBox[],
  context: ShipPlacementContext,
): Map<ItemInstanceId, ShipItemTransform> | undefined {
  const surfaceById = new Map(surfaces.map((surface) => [surface.id, surface]));
  const assignments = new Map<ItemInstanceId, ShipItemTransform>();
  const usedSlots = new Set<string>();
  for (const instance of instances) {
    const surfaceId = (SCAVENGE_FALLBACK_SURFACE_BY_INSTANCE as Readonly<
      Record<ScavengeItemInstanceId, string>
    >)[
      instance.instanceId as ScavengeItemInstanceId
    ];
    if (!surfaceId) throw new Error(`Fallback has no surface for ${instance.instanceId}`);
    const surface = surfaceById.get(surfaceId);
    if (!surface) throw new Error(`Fallback surface does not exist: ${surfaceId}`);
    const fit = surfaceFit(surface, instance.type);
    if (!fit) {
      const size = orientedItemBounds(instance.type, surface.rotation).getSize(new Vector3());
      throw new Error(
        `Fallback surface does not physically fit ${instance.instanceId}: ${surfaceId}; item ${size.x},${size.y},${size.z}; surface ${surface.footprint.width},${surface.clearanceHeight},${surface.footprint.depth}`,
      );
    }
    if (!surfaceFitAvoidsBlockers(surface, instance.type, fit, blockers)) {
      throw new Error(`Fallback surface blocker check fails ${instance.instanceId}: ${surfaceId}`);
    }
    const standing = chosenStandingPoint(surface, context);
    if (!standing) throw new Error(`Fallback standing route fails ${instance.instanceId}: ${surfaceId}`);
    const weight = ITEM_DEFINITIONS[instance.type].weight;
    if (standing.depositDistance !== undefined
      && ((weight === 3 && standing.depositDistance > 14 + EPSILON)
        || (weight === 2 && standing.depositDistance > 22 + EPSILON))) {
      throw new Error(`Fallback weight route fails ${instance.instanceId}: ${surfaceId}`);
    }
    const candidate = { surface, fit, standingPoint: standing.point };
    if (usedSlots.has(surface.physicalSlotId)) {
      throw new Error(`Fallback reuses physical slot: ${surface.physicalSlotId}`);
    }
    if (!separatedFromAssignments(candidate, assignments)) {
      const conflict = [...assignments.entries()].map(([id, transform]) => ({
        id,
        distance: Math.hypot(
          candidate.fit.position.x - transform.position.x,
          candidate.fit.position.z - transform.position.z,
        ),
      })).sort((left, right) => left.distance - right.distance)[0];
      throw new Error(
        `Fallback separation fails at ${instance.instanceId}: ${surfaceId}; nearest ${conflict?.id} at ${conflict?.distance}`,
      );
    }
    usedSlots.add(surface.physicalSlotId);
    assignments.set(instance.instanceId, transformFor(candidate, 'fallback'));
  }
  if (!productionCountsPass(assignments)) throw new Error('Fallback region or branch counts fail');
  if (!routeChecksPass(instances, assignments, context)) {
    const input = {
      assignments: routeAssignments(instances, assignments),
      start: context.start,
      deposit: context.deposit,
      evacuation: context.evacuation,
      metric: context.routeMetric,
    };
    const expert = planExpertScavengeRoute(input);
    const baseline = planBaselineScavengeRoute(input);
    throw new Error(
      `Fallback route checks fail: expert ${expert?.seconds ?? 'null'}, baseline ${baseline.savedCount}, evacuated ${baseline.evacuated}`,
    );
  }
  return assignments;
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

  const production = isProductionCatalog(instances);
  if (!production) {
    const assignment = simpleAssignment(instances, surfaces, random, blockers);
    if (assignment) return assignment;
    const failure = instances[0];
    if (failure) throw new ShipItemPlacementError(failure.instanceId);
    return new Map();
  }
  if (!placementContext) {
    throw new Error('The production scavenging catalog requires a ship placement context');
  }

  const requestedAttempts = placementContext.maxAttempts
    ?? SCAVENGE_GENERATED_PLACEMENT_ATTEMPTS;
  const attempts = Number.isFinite(requestedAttempts)
    ? Math.min(
      SCAVENGE_GENERATED_PLACEMENT_ATTEMPTS,
      Math.max(0, Math.floor(requestedAttempts)),
    )
    : 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const assignment = generatedProductionAssignment(
      instances,
      surfaces,
      random,
      blockers,
      placementContext,
    );
    if (assignment) return assignment;
  }
  const fallback = fallbackAssignment(instances, surfaces, blockers, placementContext);
  if (fallback) return fallback;
  throw new ShipItemPlacementError(instances[0]!.instanceId);
}

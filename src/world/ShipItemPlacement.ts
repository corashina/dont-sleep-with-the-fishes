import { Box3, Euler, Vector3 } from 'three';
import type { ItemId, ItemInstance, ItemInstanceId } from '../game/ItemState';
import type { CollisionBox } from '../player/collisions';
import type { ShipFurnitureKind } from './ShipLayout';
import { ITEM_MODEL_SPECS } from './itemModelManifest';

export type ShipItemCategory =
  | 'foodWater'
  | 'medicalEmergency'
  | 'toolsRepair'
  | 'fishingDiving';

export interface ShipItemSurface {
  readonly id: string;
  readonly physicalSlotId: string;
  readonly furnitureId: string;
  readonly furnitureModelId: ShipFurnitureKind;
  readonly categories: readonly ShipItemCategory[];
  readonly position: Vector3;
  readonly rotation: Euler;
  readonly footprint: { readonly width: number; readonly depth: number };
  readonly clearanceHeight: number;
  readonly standingPoints: readonly Vector3[];
  readonly fallback: boolean;
}

export interface ShipItemProfile {
  readonly category: ShipItemCategory;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

export interface ShipItemTransform {
  readonly surfaceId: string;
  readonly physicalSlotId: string;
  readonly furnitureId: string;
  readonly position: Vector3;
  readonly rotation: Euler;
  readonly scale: number;
  readonly usedFallbackSurface: boolean;
}

const ITEM_CATEGORIES = new Set<ShipItemCategory>([
  'foodWater', 'medicalEmergency', 'toolsRepair', 'fishingDiving',
]);
const MAX_INTERACTION_DISTANCE = 2.2;
const MIN_UNIFORM_SCALE = 0.75;
const STANDING_EYE_HEIGHT = 1.5;
const EPSILON = 1e-6;

function itemProfile(id: ItemId, category: ShipItemCategory): ShipItemProfile {
  const [width, height, depth] = ITEM_MODEL_SPECS[id].normalizedSize;
  return { category, width, depth, height };
}

export const SHIP_ITEM_PROFILES: Readonly<Record<ItemId, ShipItemProfile>> = {
  flareGun: itemProfile('flareGun', 'medicalEmergency'),
  ductTape: itemProfile('ductTape', 'toolsRepair'),
  fishingRod: itemProfile('fishingRod', 'fishingDiving'),
  baitTin: itemProfile('baitTin', 'fishingDiving'),
  medicalKit: itemProfile('medicalKit', 'medicalEmergency'),
  waterJug: itemProfile('waterJug', 'foodWater'),
  cannedFood: itemProfile('cannedFood', 'foodWater'),
  flashlight: itemProfile('flashlight', 'toolsRepair'),
  scubaSet: itemProfile('scubaSet', 'fishingDiving'),
};

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
  const planar = new Box3();
  for (const x of [-halfWidth, halfWidth]) {
    for (const z of [-halfDepth, halfDepth]) {
      planar.expandByPoint(new Vector3(x, 0, z).applyEuler(surface.rotation).add(surface.position));
    }
  }
  return new Box3(
    new Vector3(planar.min.x, surface.position.y, planar.min.z),
    new Vector3(
      planar.max.x,
      surface.position.y + surface.clearanceHeight,
      planar.max.z,
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

function sameTransform(left: ShipItemSurface, right: ShipItemSurface): boolean {
  return left.position.distanceTo(right.position) <= EPSILON
    && left.rotation.toArray().slice(0, 3).every((value, index) =>
      Math.abs(value as number - (right.rotation.toArray()[index] as number)) <= EPSILON)
    && Math.abs(left.footprint.width - right.footprint.width) <= EPSILON
    && Math.abs(left.footprint.depth - right.footprint.depth) <= EPSILON
    && Math.abs(left.clearanceHeight - right.clearanceHeight) <= EPSILON;
}

export function validateShipItemSurfaces(surfaces: readonly ShipItemSurface[]): void {
  const ids = new Set<string>();
  const physicalSlots = new Map<string, ShipItemSurface[]>();
  for (const surface of surfaces) {
    if (ids.has(surface.id)) throw new Error(`Duplicate ship item surface id: ${surface.id}`);
    ids.add(surface.id);
    if (!surface.furnitureId.trim()) {
      throw new Error(`Ship item surface ${surface.id} has no furniture owner`);
    }
    if (!surface.physicalSlotId.trim()) {
      throw new Error(`Ship item surface ${surface.id} has no physical slot id`);
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
    if (surface.categories.length === 0
      || surface.categories.some((category) => !ITEM_CATEGORIES.has(category))) {
      throw new Error(`Ship item surface ${surface.id} has an unsupported category`);
    }
    if (surface.standingPoints.length === 0
      || surface.standingPoints.some((point) => !finiteVector(point))) {
      throw new Error(`Ship item surface ${surface.id} must have a standing point`);
    }
    if (surface.standingPoints.every((point) => point.distanceTo(surface.position) > MAX_INTERACTION_DISTANCE + EPSILON)) {
      throw new Error(`Ship item surface ${surface.id} has no standing point within interaction reach`);
    }
    const aliases = physicalSlots.get(surface.physicalSlotId) ?? [];
    aliases.push(surface);
    physicalSlots.set(surface.physicalSlotId, aliases);
  }

  for (const [physicalSlotId, aliases] of physicalSlots) {
    if (aliases.length > 2
      || (aliases.length === 2 && (
        aliases[0]!.furnitureId !== aliases[1]!.furnitureId
        || aliases[0]!.fallback === aliases[1]!.fallback
        || !sameTransform(aliases[0]!, aliases[1]!)
      ))) {
      throw new Error(`Invalid physical slot alias group: ${physicalSlotId}`);
    }
  }

  surfaces.forEach((left, leftIndex) => surfaces.slice(leftIndex + 1).forEach((right) => {
    if (left.furnitureId !== right.furnitureId) return;
    if (left.physicalSlotId === right.physicalSlotId) return;
    if (positiveVolumeOverlap(surfaceVolume(left), surfaceVolume(right))) {
      throw new Error(`Overlapping ship item surfaces: ${left.id}, ${right.id}`);
    }
  }));
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

interface SurfaceFit {
  readonly bounds: Box3;
  readonly position: Vector3;
  readonly scale: number;
}

function surfaceFit(surface: ShipItemSurface, itemId: ItemId): SurfaceFit | undefined {
  const profile = SHIP_ITEM_PROFILES[itemId];
  if (!surface.categories.includes(profile.category)) return undefined;
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

export function assignShipItems(
  instances: readonly ItemInstance[],
  surfaces: readonly ShipItemSurface[],
  random: () => number = Math.random,
  blockers: readonly CollisionBox[] = [],
): Map<ItemInstanceId, ShipItemTransform> {
  validateShipItemSurfaces(surfaces);
  const sortedInstances = [...instances].sort((left, right) => {
    const leftProfile = SHIP_ITEM_PROFILES[left.type];
    const rightProfile = SHIP_ITEM_PROFILES[right.type];
    return rightProfile.width * rightProfile.depth - leftProfile.width * leftProfile.depth
      || rightProfile.height - leftProfile.height;
  });
  let deepestFailureIndex = 0;

  const attempt = (includeFallback: boolean): Map<ItemInstanceId, ShipItemTransform> | undefined => {
    const eligible = new Map<ItemInstanceId, ShipItemSurface[]>();
    for (const instance of sortedInstances) {
      const regular = shuffled(surfaces.filter((candidate) => {
        const fit = !candidate.fallback && surfaceFit(candidate, instance.type);
        return fit && surfaceFitAvoidsBlockers(candidate, instance.type, fit, blockers);
      }), random);
      const fallback = includeFallback
        ? shuffled(surfaces.filter((candidate) => {
          const fit = candidate.fallback && surfaceFit(candidate, instance.type);
          return fit && surfaceFitAvoidsBlockers(candidate, instance.type, fit, blockers);
        }), random)
        : [];
      eligible.set(instance.instanceId, [...regular, ...fallback]);
    }

    const assignments = new Map<ItemInstanceId, ShipItemTransform>();
    const usedSurfaceIds = new Set<string>();
    const usedPhysicalSlots = new Set<string>();
    const place = (index: number): boolean => {
      if (index === sortedInstances.length) return true;
      const instance = sortedInstances[index]!;
      for (const candidate of eligible.get(instance.instanceId)!) {
        if (usedSurfaceIds.has(candidate.id) || usedPhysicalSlots.has(candidate.physicalSlotId)) continue;
        const fit = surfaceFit(candidate, instance.type)!;
        usedSurfaceIds.add(candidate.id);
        usedPhysicalSlots.add(candidate.physicalSlotId);
        assignments.set(instance.instanceId, {
          surfaceId: candidate.id,
          physicalSlotId: candidate.physicalSlotId,
          furnitureId: candidate.furnitureId,
          position: fit.position,
          rotation: candidate.rotation.clone(),
          scale: fit.scale,
          usedFallbackSurface: candidate.fallback,
        });
        if (place(index + 1)) return true;
        assignments.delete(instance.instanceId);
        usedSurfaceIds.delete(candidate.id);
        usedPhysicalSlots.delete(candidate.physicalSlotId);
      }
      deepestFailureIndex = Math.max(deepestFailureIndex, index);
      return false;
    };
    return place(0) ? assignments : undefined;
  };

  const regular = attempt(false);
  if (regular) return regular;
  const fallback = attempt(true);
  if (fallback) return fallback;
  const unplaced = sortedInstances[deepestFailureIndex];
  if (unplaced) throw new Error(`Unable to place ship item: ${unplaced.instanceId}`);
  return new Map();
}

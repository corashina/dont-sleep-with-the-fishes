import { Euler, Vector3 } from 'three';
import type { ItemId, ItemInstance, ItemInstanceId } from '../game/ItemState';
import { ITEM_MODEL_SPECS } from './itemModelManifest';

export type ShipItemCategory =
  | 'foodWater'
  | 'medicalEmergency'
  | 'toolsRepair'
  | 'fishingDiving';

export type ShipSurface = 'shelf' | 'desk' | 'cabinet' | 'workbench' | 'rack' | 'crate';

export interface ShipItemAnchor {
  id: string;
  categories: readonly ShipItemCategory[];
  position: Vector3;
  rotation: Euler;
  scale: number;
  surface: ShipSurface;
  surfaceGroupId: string;
  footprint: { width: number; depth: number };
  clearanceHeight: number;
  emergency: boolean;
}

export interface ShipItemProfile {
  category: ShipItemCategory;
  width: number;
  depth: number;
  height: number;
}

export interface ShipItemTransform {
  anchorId: string;
  position: Vector3;
  rotation: Euler;
  scale: number;
  usedEmergencyAnchor: boolean;
}

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

function orientedItemBounds(
  id: ItemId,
  rotation: Euler,
  scale: number,
): { min: Vector3; max: Vector3 } {
  const normalized = ITEM_MODEL_SPECS[id].normalizedBounds;
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const x of [normalized.min[0], normalized.max[0]]) {
    for (const y of [normalized.min[1], normalized.max[1]]) {
      for (const z of [normalized.min[2], normalized.max[2]]) {
        const corner = new Vector3(x, y, z).multiplyScalar(scale).applyEuler(rotation);
        min.min(corner);
        max.max(corner);
      }
    }
  }
  return { min, max };
}

function rectanglesOverlap(left: ShipItemAnchor, right: ShipItemAnchor): boolean {
  const xDistance = Math.abs(left.position.x - right.position.x);
  const zDistance = Math.abs(left.position.z - right.position.z);
  return xDistance < (left.footprint.width + right.footprint.width) / 2
    && zDistance < (left.footprint.depth + right.footprint.depth) / 2;
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

function anchorFits(anchor: ShipItemAnchor, profile: ShipItemProfile, id: ItemId): boolean {
  const oriented = orientedItemBounds(id, anchor.rotation, anchor.scale);
  return anchor.categories.includes(profile.category)
    && oriented.min.x >= -anchor.footprint.width / 2
    && oriented.max.x <= anchor.footprint.width / 2
    && oriented.min.z >= -anchor.footprint.depth / 2
    && oriented.max.z <= anchor.footprint.depth / 2
    && oriented.max.y - oriented.min.y <= anchor.clearanceHeight;
}

export function validateShipItemAnchors(anchors: readonly ShipItemAnchor[]): void {
  const ids = new Set<string>();
  for (const anchor of anchors) {
    if (ids.has(anchor.id)) {
      throw new Error(`Duplicate ship item anchor id: ${anchor.id}`);
    }
    ids.add(anchor.id);

    if (anchor.scale <= 0
      || anchor.footprint.width <= 0
      || anchor.footprint.depth <= 0
      || anchor.clearanceHeight <= 0) {
      throw new Error(`Non-positive ship item anchor dimensions: ${anchor.id}`);
    }
    if (anchor.categories.length === 0) {
      throw new Error(`Ship item anchor has no categories: ${anchor.id}`);
    }
  }

  for (let leftIndex = 0; leftIndex < anchors.length; leftIndex += 1) {
    const left = anchors[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < anchors.length; rightIndex += 1) {
      const right = anchors[rightIndex]!;
      if (left.surfaceGroupId === right.surfaceGroupId && rectanglesOverlap(left, right)) {
        throw new Error(`Overlapping ship item anchors: ${left.id}, ${right.id}`);
      }
    }
  }
}

export function assignShipItems(
  instances: readonly ItemInstance[],
  anchors: readonly ShipItemAnchor[],
  random: () => number = Math.random,
): Map<ItemInstanceId, ShipItemTransform> {
  validateShipItemAnchors(anchors);

  const sortedInstances = [...instances].sort((left, right) => {
    const leftProfile = SHIP_ITEM_PROFILES[left.type];
    const rightProfile = SHIP_ITEM_PROFILES[right.type];
    return (rightProfile.width * rightProfile.depth) - (leftProfile.width * leftProfile.depth)
      || rightProfile.height - leftProfile.height;
  });

  let deepestFailureIndex = 0;

  const attempt = (includeEmergency: boolean): Map<ItemInstanceId, ShipItemTransform> | undefined => {
    const eligibleAnchors = new Map<ItemInstanceId, ShipItemAnchor[]>();
    for (const instance of sortedInstances) {
      const profile = SHIP_ITEM_PROFILES[instance.type];
      const regular = shuffled(
        anchors.filter((candidate) =>
          !candidate.emergency && anchorFits(candidate, profile, instance.type)),
        random,
      );
      const emergency = includeEmergency
        ? anchors.filter((candidate) =>
          candidate.emergency && anchorFits(candidate, profile, instance.type))
        : [];
      eligibleAnchors.set(instance.instanceId, [...regular, ...emergency]);
    }

    const assignments = new Map<ItemInstanceId, ShipItemTransform>();
    const usedAnchorIds = new Set<string>();

    const place = (instanceIndex: number): boolean => {
      if (instanceIndex === sortedInstances.length) return true;

      const instance = sortedInstances[instanceIndex]!;
      for (const candidate of eligibleAnchors.get(instance.instanceId)!) {
        if (usedAnchorIds.has(candidate.id)) continue;

        usedAnchorIds.add(candidate.id);
        const oriented = orientedItemBounds(instance.type, candidate.rotation, candidate.scale);
        const position = candidate.position.clone();
        position.y -= oriented.min.y;
        assignments.set(instance.instanceId, {
          anchorId: candidate.id,
          position,
          rotation: candidate.rotation.clone(),
          scale: candidate.scale,
          usedEmergencyAnchor: candidate.emergency,
        });

        if (place(instanceIndex + 1)) return true;

        assignments.delete(instance.instanceId);
        usedAnchorIds.delete(candidate.id);
      }

      deepestFailureIndex = Math.max(deepestFailureIndex, instanceIndex);
      return false;
    };

    return place(0) ? assignments : undefined;
  };

  const regularAssignments = attempt(false);
  if (regularAssignments) return regularAssignments;

  const emergencyAssignments = attempt(true);
  if (emergencyAssignments) return emergencyAssignments;

  const unplaced = sortedInstances[deepestFailureIndex];
  if (unplaced) throw new Error(`Unable to place ship item: ${unplaced.instanceId}`);
  return new Map();
}

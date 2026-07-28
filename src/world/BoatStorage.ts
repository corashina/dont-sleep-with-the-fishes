import { Euler, Vector3 } from 'three';
import {
  ITEM_DEFINITIONS,
  ITEM_IDS,
  type ItemId,
  type ItemInstance,
} from '../game/ItemState';
import {
  LIFEBOAT_DISPLAY_SHELF_SURFACE_Y,
  LIFEBOAT_FLOOR_SURFACE_Y,
} from './Lifeboat';
import { ITEM_MODEL_SPECS } from './itemModelManifest';

export type BoatItemSurface = 'shelf' | 'floor';
export type BoatSupplyGroupId = ItemId | 'repairMaterial';

export const BOAT_SUPPLY_GROUP_IDS = Object.freeze([
  ...ITEM_IDS,
  'repairMaterial',
] as const satisfies readonly BoatSupplyGroupId[]);

export interface BoatStorageTransform {
  readonly position: Vector3;
  readonly rotation: Euler;
  readonly scale: number;
}

interface SlotSpec {
  readonly surface: BoatItemSurface;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: number;
}

const restingSlot = (
  surface: BoatItemSurface,
  id: ItemId,
  x: number,
  z: number,
  yaw: number,
  scale = 0.5,
): SlotSpec => {
  const supportY = surface === 'shelf'
    ? LIFEBOAT_DISPLAY_SHELF_SURFACE_Y
    : LIFEBOAT_FLOOR_SURFACE_Y;
  return {
    surface,
    position: [
      x,
      supportY - ITEM_MODEL_SPECS[id].normalizedBounds.min[1] * scale,
      z,
    ],
    rotation: [0, yaw, 0],
    scale,
  };
};

const BOAT_STORAGE_SLOTS = {
  cannedFood: [
    restingSlot('shelf', 'cannedFood', -0.76, -1.47, -0.12),
    restingSlot('shelf', 'cannedFood', -0.54, -1.56, 0.10),
    restingSlot('shelf', 'cannedFood', -0.32, -1.43, -0.08),
  ],
  baitTin: [
    restingSlot('shelf', 'baitTin', -0.08, -1.73, -0.05),
    restingSlot('shelf', 'baitTin', 0.16, -1.70, 0.08),
  ],
  ductTape: [restingSlot('shelf', 'ductTape', 0.53, -1.37, 0.16)],
  compass: [restingSlot('shelf', 'compass', 0.82, -1.32, -0.10)],
  map: [restingSlot('shelf', 'map', -0.04, -1.35, 0.05)],
  medicalKit: [restingSlot('shelf', 'medicalKit', -1.17, -1.35, 0.10)],
  spyglass: [restingSlot('shelf', 'spyglass', -1.08, -1.70, 0.14)],
  fishingNet: [restingSlot('floor', 'fishingNet', -0.82, -0.38, 0.18)],
  bucket: [restingSlot('floor', 'bucket', -1.16, 0.20, -0.12)],
  flareGun: [restingSlot('shelf', 'flareGun', 0.59, -1.72, -0.18)],
  scubaSet: [restingSlot('floor', 'scubaSet', -0.42, -0.72, -0.12)],
  anchor: [restingSlot('floor', 'anchor', 0, -0.88, 0.08)],
  bottledPaper: [restingSlot('shelf', 'bottledPaper', 1.17, -1.34, -0.10)],
  umbrella: [restingSlot('floor', 'umbrella', 0.88, -0.42, 0.14)],
  swimRing: [restingSlot('floor', 'swimRing', 1.16, 0.20, -0.08)],
  flashlight: [restingSlot('shelf', 'flashlight', 1.10, -1.74, 0.10)],
  harpoonGun: [restingSlot('floor', 'harpoonGun', 0.52, -0.70, -0.18)],
  energyBar: [restingSlot('shelf', 'energyBar', 0.29, -1.35, -0.08)],
} satisfies Readonly<Record<ItemId, readonly SlotSpec[]>>;

const BAIT_OVERFLOW_SLOT = restingSlot(
  'shelf',
  'baitTin',
  0.23,
  -1.58,
  -0.06,
);

const REPAIR_MATERIAL_SLOTS = [
  {
    surface: 'floor',
    position: [-0.82, LIFEBOAT_FLOOR_SURFACE_Y, 0.34],
    rotation: [0, -0.10, 0],
    scale: 1,
  },
  {
    surface: 'floor',
    position: [-0.65, LIFEBOAT_FLOOR_SURFACE_Y, 0.40],
    rotation: [0, 0.08, 0],
    scale: 1,
  },
  {
    surface: 'floor',
    position: [-0.48, LIFEBOAT_FLOOR_SURFACE_Y, 0.33],
    rotation: [0, -0.04, 0],
    scale: 1,
  },
] as const satisfies readonly SlotSpec[];

function instanceOrdinal(instance: ItemInstance): number {
  const prefix = `${instance.type}-`;
  const suffix = instance.instanceId.startsWith(prefix)
    ? instance.instanceId.slice(prefix.length)
    : '';
  if (!/^[1-9]\d*$/.test(suffix)) {
    throw new Error(`No boat storage slot for ${instance.instanceId}`);
  }
  const oneBased = Number(suffix);
  const ordinal = oneBased - 1;
  if (
    !Number.isInteger(oneBased)
    || oneBased < 1
    || ordinal >= ITEM_DEFINITIONS[instance.type].spawnCount
  ) {
    throw new Error(`No boat storage slot for ${instance.instanceId}`);
  }
  return ordinal;
}

function transformFromSpec(spec: SlotSpec): BoatStorageTransform {
  return {
    position: new Vector3(...spec.position),
    rotation: new Euler(...spec.rotation),
    scale: spec.scale,
  };
}

export function boatStorageSurface(instance: ItemInstance): BoatItemSurface {
  const spec = BOAT_STORAGE_SLOTS[instance.type][instanceOrdinal(instance)];
  if (!spec) throw new Error(`No boat storage slot for ${instance.instanceId}`);
  return spec.surface;
}

export function boatStorageTransform(
  instance: ItemInstance,
): BoatStorageTransform {
  const spec = BOAT_STORAGE_SLOTS[instance.type][instanceOrdinal(instance)];
  if (!spec) throw new Error(`No boat storage slot for ${instance.instanceId}`);
  return transformFromSpec(spec);
}

export function boatSupplyTransform(
  id: BoatSupplyGroupId,
  copyIndex: number,
): BoatStorageTransform {
  if (!Number.isInteger(copyIndex) || copyIndex < 0) {
    throw new Error(`No boat supply slot for ${id}-${copyIndex + 1}`);
  }
  if (id === 'repairMaterial') {
    const spec = REPAIR_MATERIAL_SLOTS[copyIndex];
    if (!spec) throw new Error(`No boat supply slot for ${id}-${copyIndex + 1}`);
    return transformFromSpec(spec);
  }
  const spec = BOAT_STORAGE_SLOTS[id][copyIndex]
    ?? (id === 'baitTin' && copyIndex === 2 ? BAIT_OVERFLOW_SLOT : undefined);
  if (!spec) throw new Error(`No boat supply slot for ${id}-${copyIndex + 1}`);
  return transformFromSpec(spec);
}

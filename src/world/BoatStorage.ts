import {
  Box3,
  Euler,
  Matrix4,
  Vector3,
} from 'three';
import {
  ITEM_DEFINITIONS,
  ITEM_IDS,
  type ItemId,
  type ItemInstance,
} from '../game/ItemState';
import {
  LIFEBOAT_DISPLAY_SHELF_SURFACE_Y,
  LIFEBOAT_FLOOR_SURFACE_Y,
  LIFEBOAT_GUNWALE_SURFACE_Y,
} from './Lifeboat';
import { ITEM_MODEL_SPECS } from './itemModelManifest';

const CARLITOS_SEATED_SUPPORT_LIFT = 0.22;
const STACK_GAP = 0.01;

export type BoatItemSurface = 'shelf' | 'floor' | 'gunwale';
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
  pitch = 0,
  roll = 0,
): SlotSpec => {
  const supportY = surface === 'shelf'
    ? LIFEBOAT_DISPLAY_SHELF_SURFACE_Y
    : surface === 'gunwale'
      ? LIFEBOAT_GUNWALE_SURFACE_Y
      : LIFEBOAT_FLOOR_SURFACE_Y;
  const rotation = [pitch, yaw, roll] as const;
  const modelBounds = ITEM_MODEL_SPECS[id].normalizedBounds;
  const supportLift = id === 'carlitos'
    ? CARLITOS_SEATED_SUPPORT_LIFT * scale
    : 0;
  const rotatedBounds = new Box3(
    new Vector3(...modelBounds.min),
    new Vector3(...modelBounds.max),
  ).applyMatrix4(
    new Matrix4().makeRotationFromEuler(new Euler(...rotation)),
  );
  return {
    surface,
    position: [
      x,
      supportY - rotatedBounds.min.y * scale + supportLift,
      z,
    ],
    rotation,
    scale,
  };
};

const stackedSlot = (
  surface: BoatItemSurface,
  id: ItemId,
  x: number,
  z: number,
  yaw: number,
  scale = 0.5,
): SlotSpec => {
  const slot = restingSlot(surface, id, x, z, yaw, scale);
  const modelBounds = ITEM_MODEL_SPECS[id].normalizedBounds;
  const height = (modelBounds.max[1] - modelBounds.min[1]) * scale;
  return {
    ...slot,
    position: [x, slot.position[1] + height + STACK_GAP, z],
  };
};

const BOAT_STORAGE_SLOTS = {
  cannedFood: [
    restingSlot('floor', 'cannedFood', -0.10, -1.24, 0.10),
    restingSlot('floor', 'cannedFood', 0.10, -1.24, -0.05),
    stackedSlot('floor', 'cannedFood', 0, -1.24, -0.08),
  ],
  baitTin: [
    restingSlot('shelf', 'baitTin', -0.28, -1.72, -0.05),
    restingSlot('shelf', 'baitTin', -0.04, -1.72, 0.08),
    restingSlot('shelf', 'baitTin', 0.20, -1.72, -0.03),
  ],
  ductTape: [restingSlot('shelf', 'ductTape', 0.50, -1.55, 0.05, 0.5, Math.PI / 2)],
  compass: [restingSlot('shelf', 'compass', 0.78, -1.62, -0.10)],
  map: [restingSlot('shelf', 'map', -0.68, -1.54, 0.04)],
  medicalKit: [restingSlot('floor', 'medicalKit', -1.35, -1.05, 0.10)],
  spyglass: [restingSlot('shelf', 'spyglass', -1.08, -1.70, Math.PI + 0.14)],
  fishingNet: [restingSlot('floor', 'fishingNet', -0.72, -0.34, 0.18)],
  bucket: [restingSlot('floor', 'bucket', -0.93, -1.05, -0.12)],
  flareGun: [restingSlot('floor', 'flareGun', 0.72, -0.86, Math.PI / 2 - 0.22)],
  scubaSet: [restingSlot('floor', 'scubaSet', 1.33, -0.50, -0.04)],
  anchor: [restingSlot('floor', 'anchor', 1.43, -1.15, 0.75, 0.5, 0, -0.20)],
  bottledPaper: [restingSlot('shelf', 'bottledPaper', 1.28, -1.52, Math.PI / 2)],
  umbrella: [restingSlot('floor', 'umbrella', 0, 0.12, -Math.PI / 4, 0.5, 0, -42.7 * Math.PI / 180)],
  swimRing: [restingSlot('floor', 'swimRing', -1.25, -0.35, -0.08, 0.5, 0, -0.95)],
  flashlight: [restingSlot('shelf', 'flashlight', 1.05, -1.62, Math.PI / 2)],
  shotgun: [restingSlot('floor', 'shotgun', 0.42, -0.67, 0.10)],
  energyBar: [restingSlot('shelf', 'energyBar', 0.25, -1.35, -0.08)],
  carlitos: [
    restingSlot('gunwale', 'carlitos', 1.58, -1.75, Math.PI, 0.68),
  ],
} satisfies Readonly<Record<ItemId, readonly SlotSpec[]>>;

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
  const spec = BOAT_STORAGE_SLOTS[id][copyIndex];
  if (!spec) throw new Error(`No boat supply slot for ${id}-${copyIndex + 1}`);
  return transformFromSpec(spec);
}

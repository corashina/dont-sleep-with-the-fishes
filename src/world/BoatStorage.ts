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
  LIFEBOAT_STARBOARD_EDGE_SHELF_SURFACE_Y,
  LIFEBOAT_FLOOR_SURFACE_Y,
  LIFEBOAT_GUNWALE_SURFACE_Y,
} from './Lifeboat';
import {
  COMPASS_CASE_SUPPORT_POINT,
  COMPASS_REST_ROTATION,
} from './CompassRestPose';
import { CARLITOS_SEATED_SUPPORT_LIFT } from './CarlitosRestPose';
import { ITEM_MODEL_SPECS } from './itemModelManifest';

const FISHING_NET_HANDLE_SUPPORT_POINT = new Vector3(0, 0.09468515, 0.81206911);
const STACK_GAP = 0.01;

export type BoatItemSurface = 'shelf' | 'floor' | 'gunwale' | 'edgeShelf';
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
      : surface === 'edgeShelf'
        ? LIFEBOAT_STARBOARD_EDGE_SHELF_SURFACE_Y
        : LIFEBOAT_FLOOR_SURFACE_Y;
  const rotation = [pitch, yaw, roll] as const;
  const rotationMatrix = new Matrix4().makeRotationFromEuler(new Euler(...rotation));
  const modelBounds = ITEM_MODEL_SPECS[id].normalizedBounds;
  const supportLift = id === 'carlitos'
    ? CARLITOS_SEATED_SUPPORT_LIFT * scale
    : 0;
  const rotatedBounds = new Box3(
    new Vector3(...modelBounds.min),
    new Vector3(...modelBounds.max),
  ).applyMatrix4(rotationMatrix);
  const supportPointY = id === 'fishingNet'
    ? FISHING_NET_HANDLE_SUPPORT_POINT.clone().applyMatrix4(rotationMatrix).y
    : id === 'compass'
      ? new Vector3(...COMPASS_CASE_SUPPORT_POINT).applyMatrix4(rotationMatrix).y
      : rotatedBounds.min.y;
  return {
    surface,
    position: [
      x,
      supportY - supportPointY * scale + supportLift,
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
    restingSlot('shelf', 'baitTin', -0.105, -1.65, -0.05),
    restingSlot('shelf', 'baitTin', 0.105, -1.65, 0.08),
    restingSlot('shelf', 'baitTin', 0, -1.855, -0.03),
  ],
  ductTape: [restingSlot('shelf', 'ductTape', -0.55, -1.65, 0.05, 0.5, Math.PI / 2)],
  compass: [restingSlot(
    'shelf',
    'compass',
    0.78,
    -1.62,
    COMPASS_REST_ROTATION[1],
    0.5,
    COMPASS_REST_ROTATION[0],
    COMPASS_REST_ROTATION[2],
  )],
  map: [restingSlot('shelf', 'map', 0, 0.65, 0)],
  medicalKit: [restingSlot('floor', 'medicalKit', -0.50, -1.27, 0.10)],
  spyglass: [restingSlot('shelf', 'spyglass', -1.08, -1.70, Math.PI + 0.14)],
  fishingNet: [restingSlot('floor', 'fishingNet', -0.96, -1.15, 0.45, 0.5, 11 * Math.PI / 180)],
  rope: [restingSlot('floor', 'rope', 0.25, -0.55, 0.16)],
  bucket: [restingSlot('floor', 'bucket', 1.03, -1.00, -0.12)],
  flareGun: [restingSlot(
    'edgeShelf',
    'flareGun',
    -1.38,
    -0.34,
    -Math.PI / 2 + 0.22,
    0.5,
    0,
    Math.PI,
  )],
  scubaSet: [restingSlot('floor', 'scubaSet', 1.33, -1.15, -0.04)],
  anchor: [restingSlot('floor', 'anchor', 1.39, -0.50, 0.30, 0.5, 0, -0.20)],
  radio: [restingSlot('edgeShelf', 'radio', 1.35, -0.34, Math.PI * 1.5)],
  umbrella: [restingSlot('floor', 'umbrella', 0.55, -0.90, -Math.PI / 2, 0.5, 0, -Math.PI / 4)],
  swimRing: [restingSlot('floor', 'swimRing', -1.36, -0.52, -0.08, 0.5, 0, -0.95)],
  flashlight: [restingSlot('shelf', 'flashlight', 1.05, -1.62, -Math.PI / 2)],
  shotgun: [restingSlot('floor', 'shotgun', -1.43, -1.16, 0.20, 0.5, Math.PI / 2)],
  energyBar: [restingSlot('shelf', 'energyBar', 0.45, -1.64, Math.PI)],
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

import { Euler, Vector3 } from 'three';
import { ITEM_DEFINITIONS, type ItemId, type ItemInstance } from '../game/ItemState';
import { ITEM_MODEL_SPECS } from './itemModelManifest';

export interface BoatStorageTransform {
  readonly position: Vector3;
  readonly rotation: Euler;
  readonly scale: number;
}

interface SlotSpec {
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: number;
}

const slot = (
  position: SlotSpec['position'],
  yaw: number,
  scale: number,
): SlotSpec => ({ position, rotation: [0, yaw, 0], scale });

const floorSlot = (
  id: ItemId,
  x: number,
  z: number,
  yaw: number,
  scale: number,
  bottomY: number,
): SlotSpec => slot([
  x,
  bottomY - ITEM_MODEL_SPECS[id].normalizedBounds.min[1] * scale,
  z,
], yaw, scale);

const BOAT_STORAGE_SLOTS = {
  cannedFood: [
    slot([-1.35, -0.24, 1.15], -0.18, 0.50),
    slot([-1.35, -0.24, 0.45], 0.16, 0.50),
    slot([-1.35, -0.24, -0.25], -0.10, 0.50),
  ],
  baitTin: [
    slot([-0.70, -0.24, 1.15], -0.18, 0.50),
    slot([-0.70, -0.24, 0.45], 0.20, 0.50),
  ],
  ductTape: [floorSlot('ductTape', -0.70, -0.25, 0.28, 0.50, -0.3775)],
  compass: [slot([-0.71, -0.24, -0.95], -0.12, 0.50)],
  map: [slot([-0.70, -0.24, -1.76], 0.12, 0.50)],
  medicalKit: [slot([-0.50, -0.23, -2.65], 0.18, 0.50)],
  spyglass: [slot([0.70, -0.10, 1.15], -0.12, 0.50)],
  fishingNet: [floorSlot('fishingNet', 0.70, 0.45, 0.10, 0.50, -0.365)],
  bucket: [slot([0.70, -0.22, -0.25], -0.12, 0.50)],
  flareGun: [slot([0.58, -0.10, -0.95], -0.20, 0.50)],
  scubaSet: [floorSlot('scubaSet', 1.00, -1.45, -0.16, 0.50, -0.315)],
  anchor: [slot([0, -0.18, -2.35], 0.12, 0.50)],
  bottledPaper: [floorSlot('bottledPaper', 1.35, 1.15, -0.08, 0.50, -0.335)],
  umbrella: [floorSlot('umbrella', 1.33, 0.45, 0.10, 0.50, -0.325)],
  swimRing: [slot([1.35, -0.16, -0.25], -0.10, 0.50)],
  flashlight: [floorSlot('flashlight', 1.35, -0.95, 0.10, 0.50, -0.185)],
  harpoonGun: [slot([0.90, -0.10, -2.28], Math.PI / 2, 0.50)],
  energyBar: [slot([0.50, -0.18, -2.75], -0.08, 0.50)],
  fishingRod: [slot([-1.35, 0.12, -1.55], -0.08, 0.50)],
} satisfies Readonly<Record<ItemId, readonly SlotSpec[]>>;

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

export function boatStorageTransform(
  instance: ItemInstance,
): BoatStorageTransform {
  const spec = BOAT_STORAGE_SLOTS[instance.type][instanceOrdinal(instance)];
  if (!spec) throw new Error(`No boat storage slot for ${instance.instanceId}`);
  return {
    position: new Vector3(...spec.position),
    rotation: new Euler(...spec.rotation),
    scale: spec.scale,
  };
}

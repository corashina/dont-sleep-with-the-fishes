import { Euler, Vector3 } from 'three';
import { ITEM_DEFINITIONS, type ItemId, type ItemInstance } from '../game/ItemState';

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
  ductTape: [slot([-0.70, -0.24, -0.25], 0.28, 0.50)],
  compass: [slot([-0.70, -0.24, -0.95], -0.12, 0.50)],
  map: [slot([-0.70, -0.24, -1.76], 0.12, 0.50)],
  medicalKit: [slot([-0.50, -0.23, -2.65], 0.18, 0.50)],
  spyglass: [slot([0.70, -0.10, 1.15], -0.12, 0.50)],
  fishingNet: [slot([0.70, -0.16, 0.45], 0.10, 0.50)],
  bucket: [slot([0.70, -0.22, -0.25], -0.12, 0.50)],
  flareGun: [slot([0.58, -0.10, -0.95], -0.20, 0.50)],
  scubaSet: [slot([1.00, -0.22, -1.45], -0.16, 0.50)],
  anchor: [slot([0, -0.18, -2.35], 0.12, 0.50)],
  bottledPaper: [slot([1.35, -0.18, 1.15], -0.08, 0.50)],
  umbrella: [slot([1.35, -0.10, 0.45], 0.10, 0.50)],
  swimRing: [slot([1.35, -0.16, -0.25], -0.10, 0.50)],
  flashlight: [slot([1.25, -0.10, -0.95], 0.10, 0.50)],
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

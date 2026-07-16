import { Box2, Box3, Euler, Object3D, Vector2, Vector3 } from 'three';
import { ITEM_DEFINITIONS, type ItemId, type ItemInstance } from '../game/ItemState';

export const BOAT_STORAGE_CLEARANCE = 0.05;

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
  medicalKit: [slot([-1.20, -0.23, -2.57], 0.18, 0.50)],
  spyglass: [slot([0.70, -0.10, 1.15], -0.12, 0.50)],
  fishingNet: [slot([0.70, -0.16, 0.45], 0.10, 0.50)],
  bucket: [slot([0.70, -0.22, -0.25], -0.12, 0.50)],
  flareGun: [slot([0.58, -0.10, -0.95], -0.20, 0.50)],
  scubaSet: [slot([1.05, -0.22, -1.65], -0.16, 0.50)],
  anchor: [slot([0.58, -0.18, -2.35], 0.12, 0.50)],
  bottledPaper: [slot([1.35, -0.18, 1.15], -0.08, 0.50)],
  umbrella: [slot([1.35, -0.10, 0.45], 0.10, 0.50)],
  swimRing: [slot([1.35, -0.16, -0.25], -0.10, 0.50)],
  flashlight: [slot([1.25, -0.10, -0.95], 0.10, 0.50)],
  harpoonGun: [slot([1.85, -0.10, -1.65], 0, 0.50)],
  energyBar: [slot([1.80, -0.18, -3.05], -0.08, 0.50)],
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

export function measureBoatStorageEnvelope(
  root: Object3D,
  clearance = BOAT_STORAGE_CLEARANCE,
): Box2 {
  root.updateWorldMatrix(true, true);
  const bounds = new Box3().setFromObject(root);
  if (bounds.isEmpty()) throw new Error(`Cannot measure empty boat prop ${root.name}`);
  return new Box2(
    new Vector2(bounds.min.x - clearance, bounds.min.z - clearance),
    new Vector2(bounds.max.x + clearance, bounds.max.z + clearance),
  );
}

export function boatStorageEnvelopesOverlap(first: Box2, second: Box2): boolean {
  return first.intersectsBox(second);
}

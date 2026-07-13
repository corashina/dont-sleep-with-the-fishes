import { Box2, Box3, Euler, Object3D, Vector2, Vector3 } from 'three';
import { ITEM_DEFINITIONS, type ItemId, type ItemInstance } from '../game/ItemState';

export const SURVIVAL_STORAGE_CLEARANCE = 0.05;

export interface SurvivalBoatStorageTransform {
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

const SURVIVAL_SLOTS = {
  flareGun: [slot([0.62, -0.22, 1.48], -0.20, 0.82)],
  ductTape: [
    slot([0.98, -0.24, 0.34], 0.28, 0.82),
    slot([0.98, -0.24, 0.98], -0.24, 0.82),
  ],
  fishingRod: [slot([1.45, 0.12, -0.28], -0.08, 0.84)],
  baitTin: [
    slot([1.00, -0.24, -1.35], -0.18, 0.82),
    slot([1.00, -0.24, -1.92], 0.20, 0.82),
  ],
  medicalKit: [slot([-1.12, -0.23, 0.62], 0.18, 0.82)],
  waterJug: [
    slot([0.18, -0.22, -2.52], -0.10, 0.84),
    slot([1.05, -0.22, -2.48], 0.16, 0.84),
  ],
  cannedFood: [
    slot([-1.20, -0.24, -1.42], -0.18, 0.84),
    slot([-1.20, -0.24, -0.76], 0.16, 0.84),
    slot([-1.20, -0.24, -0.10], -0.10, 0.84),
  ],
  flashlight: [slot([-0.66, -0.22, 1.48], 0.10, 0.82)],
  scubaSet: [slot([-0.94, -0.22, -2.36], -0.16, 0.84)],
} satisfies Readonly<Record<ItemId, readonly SlotSpec[]>>;

function instanceOrdinal(instance: ItemInstance): number {
  const prefix = `${instance.type}-`;
  const suffix = instance.instanceId.startsWith(prefix)
    ? instance.instanceId.slice(prefix.length)
    : '';
  const oneBased = Number(suffix);
  const ordinal = oneBased - 1;
  if (
    !Number.isInteger(oneBased)
    || oneBased < 1
    || ordinal >= ITEM_DEFINITIONS[instance.type].spawnCount
  ) {
    throw new Error(`No survival boat slot for ${instance.instanceId}`);
  }
  return ordinal;
}

export function survivalBoatStorageTransform(
  instance: ItemInstance,
): SurvivalBoatStorageTransform {
  const spec = SURVIVAL_SLOTS[instance.type][instanceOrdinal(instance)];
  if (!spec) throw new Error(`No survival boat slot for ${instance.instanceId}`);
  return {
    position: new Vector3(...spec.position),
    rotation: new Euler(...spec.rotation),
    scale: spec.scale,
  };
}

export function measureSurvivalStorageEnvelope(
  root: Object3D,
  clearance = SURVIVAL_STORAGE_CLEARANCE,
): Box2 {
  root.updateWorldMatrix(true, true);
  const bounds = new Box3().setFromObject(root);
  if (bounds.isEmpty()) throw new Error(`Cannot measure empty survival prop ${root.name}`);
  return new Box2(
    new Vector2(bounds.min.x - clearance, bounds.min.z - clearance),
    new Vector2(bounds.max.x + clearance, bounds.max.z + clearance),
  );
}

export function storageEnvelopesOverlap(first: Box2, second: Box2): boolean {
  return first.intersectsBox(second);
}

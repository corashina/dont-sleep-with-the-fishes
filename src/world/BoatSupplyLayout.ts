import { Euler, Vector3 } from 'three';
import { ITEM_IDS, type ItemId } from '../game/ItemState';
import type { BoatStorageTransform } from './BoatStorage';

export type BoatSupplyGroupId = ItemId | 'repairMaterial';

export const BOAT_SUPPLY_GROUP_IDS = Object.freeze([
  ...ITEM_IDS,
  'repairMaterial',
] as const satisfies readonly BoatSupplyGroupId[]);

interface GroupSpec {
  readonly position: readonly [number, number, number];
  readonly yaw: number;
  readonly scale: number;
}

const GROUP_SPECS = {
  cannedFood: { position: [-0.68, -0.24, -2.12], yaw: -0.12, scale: 0.5 },
  baitTin: { position: [-0.24, -0.24, -2.12], yaw: 0.14, scale: 0.5 },
  ductTape: { position: [0.18, -0.3775, -2.10], yaw: 0.28, scale: 0.5 },
  compass: { position: [0.52, -0.24, -2.10], yaw: -0.12, scale: 0.5 },
  map: { position: [0.82, -0.24, -1.78], yaw: 0.12, scale: 0.5 },
  medicalKit: { position: [-0.78, -0.23, -1.52], yaw: 0.18, scale: 0.5 },
  spyglass: { position: [-0.38, -0.10, -1.52], yaw: -0.12, scale: 0.5 },
  fishingNet: { position: [1.04, -0.365, -0.30], yaw: 0.10, scale: 0.5 },
  bucket: { position: [-1.06, -0.22, -0.28], yaw: -0.12, scale: 0.5 },
  flareGun: { position: [0.04, -0.10, -1.52], yaw: -0.20, scale: 0.5 },
  scubaSet: { position: [-1.02, -0.315, 0.38], yaw: -0.16, scale: 0.5 },
  anchor: { position: [1.02, -0.18, 0.42], yaw: 0.12, scale: 0.5 },
  bottledPaper: { position: [0.42, -0.335, -1.52], yaw: -0.08, scale: 0.5 },
  umbrella: { position: [1.14, -0.325, -1.05], yaw: 0.10, scale: 0.5 },
  swimRing: { position: [-1.14, -0.16, -0.92], yaw: -0.10, scale: 0.5 },
  flashlight: { position: [0.72, -0.185, -1.16], yaw: 0.10, scale: 0.5 },
  harpoonGun: { position: [1.00, -0.10, -2.08], yaw: Math.PI / 2, scale: 0.5 },
  energyBar: { position: [-0.20, -0.18, -1.52], yaw: -0.08, scale: 0.5 },
  repairMaterial: { position: [0.42, -0.25, -0.72], yaw: -0.10, scale: 1 },
} as const satisfies Readonly<Record<BoatSupplyGroupId, GroupSpec>>;

const COPY_OFFSET_TUPLES = {
  1: [[0, 0, 0]],
  2: [[-0.13, 0, -0.04], [0.13, 0, 0.04]],
  3: [[-0.18, 0, -0.05], [0, 0.025, 0.08], [0.18, 0, -0.05]],
} as const;

export function boatSupplyGroupTransform(
  id: BoatSupplyGroupId,
): BoatStorageTransform {
  const spec = GROUP_SPECS[id];
  return {
    position: new Vector3(...spec.position),
    rotation: new Euler(0, spec.yaw, 0),
    scale: spec.scale,
  };
}

export function boatSupplyCopyOffsets(
  _id: BoatSupplyGroupId,
  visibleCount: 1 | 2 | 3,
): readonly Vector3[] {
  return COPY_OFFSET_TUPLES[visibleCount].map((offset) => new Vector3(...offset));
}

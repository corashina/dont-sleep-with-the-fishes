import {
  createRuntimeModelSpec,
  type RuntimeModelSpec,
} from './itemModelManifest';

export const LIFEBOAT_EQUIPMENT_IDS = ['fishingRod', 'hammer'] as const;
export type LifeboatEquipmentId = typeof LIFEBOAT_EQUIPMENT_IDS[number];

export const LIFEBOAT_EQUIPMENT_MODEL_SPECS: Readonly<
  Record<LifeboatEquipmentId, RuntimeModelSpec>
> = Object.freeze({
  fishingRod: createRuntimeModelSpec(
    'fishingRod',
    {
      targetLongestDimension: 1.80,
      rotation: [Math.PI / 2, 0, 0],
      offset: [0, 0, 0],
    },
  ),
  hammer: createRuntimeModelSpec(
    'hammer',
    {
      targetLongestDimension: 0.62,
      rotation: [0, 0, -Math.PI / 2],
      offset: [0, 0, 0],
    },
  ),
});

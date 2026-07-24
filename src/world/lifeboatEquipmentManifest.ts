import {
  createRuntimeModelSpec,
  type RuntimeModelSpec,
} from './itemModelManifest';

export const LIFEBOAT_EQUIPMENT_IDS = ['fishingRod'] as const;
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
    {
      kind: 'thirdParty',
      sourceUrl: 'https://poly.pizza/m/9gXWYDqB6vt',
      sourceAssetId: 'poly-pizza:b50b26a5-173d-4833-af8f-1f30f97d3e59',
      creator: 'Justin Randall',
      licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
    },
  ),
});

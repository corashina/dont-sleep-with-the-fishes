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
      sourceUrl: 'https://kenney.nl/assets/prototype-kit',
      sourceAssetId: 'prototype-kit@1.0:composite/fishingRod',
      creator: 'Kenney',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
  ),
});

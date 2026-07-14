/// <reference types="vite/client" />

import assetLedger from '../../THIRD_PARTY_ASSETS.md?raw';
import type { ItemId } from '../game/ItemState';

export interface ItemModelSpec {
  readonly url: string;
  readonly targetLongestDimension: number;
  readonly normalizedSize: readonly [number, number, number];
  readonly normalizedBounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly rotation: readonly [number, number, number];
  readonly offset: readonly [number, number, number];
  readonly maxTriangles: number;
  readonly sourceUrl: string;
  readonly sourceAssetId: string;
  readonly creator: string;
  readonly licenseUrl: string;
}

export const ITEM_MODEL_ASSET_LEDGER = assetLedger;
export const ITEM_MODEL_MAX_TOTAL_TRIANGLES = 28_000;

const normalization: Readonly<Record<ItemId, Pick<ItemModelSpec,
  'targetLongestDimension' | 'normalizedSize' | 'rotation' | 'offset'>>> = {
  flareGun: { targetLongestDimension: 0.72, normalizedSize: [0.72, 0.371191998, 0.191220115], rotation: [0, Math.PI / 2, 0], offset: [0, 0.07, 0] },
  ductTape: { targetLongestDimension: 0.55, normalizedSize: [0.55, 0.55, 0.1925], rotation: [Math.PI / 2, 0, 0], offset: [0, 0, 0] },
  fishingRod: { targetLongestDimension: 1.80, normalizedSize: [0.12, 0.083076923, 1.8], rotation: [Math.PI / 2, 0, 0], offset: [0, 0, 0] },
  baitTin: { targetLongestDimension: 0.48, normalizedSize: [0.48, 0.257795606, 0.48], rotation: [0, 0, 0], offset: [0, 0.12, 0] },
  medicalKit: { targetLongestDimension: 0.72, normalizedSize: [0.72, 0.504, 0.2448], rotation: [0, 0, 0], offset: [0, 0.07, 0] },
  waterJug: { targetLongestDimension: 0.78, normalizedSize: [0.267094093, 0.78, 0.308413709], rotation: [0, 0, 0], offset: [0, 0.22, 0] },
  cannedFood: { targetLongestDimension: 0.42, normalizedSize: [0.393750024, 0.42, 0.393750024], rotation: [0, 0, 0], offset: [0, 0.04, 0] },
  flashlight: { targetLongestDimension: 0.72, normalizedSize: [0.1728, 0.72, 0.2016], rotation: [0, 0, 0], offset: [0, 0.19, 0] },
  scubaSet: { targetLongestDimension: 0.88, normalizedSize: [0.451282051, 0.88, 0.278290598], rotation: [0, 0, 0], offset: [0, 0.25, 0] },
};

const BOUNDS_EPSILON = 1e-9;
const conservativeBounds = (
  min: readonly [number, number, number],
  max: readonly [number, number, number],
): ItemModelSpec['normalizedBounds'] => ({
  min: min.map((value) => value - BOUNDS_EPSILON) as [number, number, number],
  max: max.map((value) => value + BOUNDS_EPSILON) as [number, number, number],
});

const normalizedBounds: Readonly<Record<ItemId, ItemModelSpec['normalizedBounds']>> = {
  flareGun: conservativeBounds(
    [-0.36, -0.115595999, -0.095610057],
    [0.36, 0.255595999, 0.095610057],
  ),
  ductTape: conservativeBounds(
    [-0.275, -0.275, -0.09625],
    [0.275, 0.275, 0.09625],
  ),
  fishingRod: conservativeBounds(
    [-0.050769230769, -0.032307692308, -0.9],
    [0.050769230769, 0.032307692308, 0.9],
  ),
  baitTin: conservativeBounds(
    [-0.24, -0.008897803, -0.24],
    [0.24, 0.248897803, 0.24],
  ),
  medicalKit: conservativeBounds(
    [-0.36, -0.182, -0.1224],
    [0.36, 0.322, 0.1224],
  ),
  waterJug: conservativeBounds(
    [-0.133547046, -0.17, -0.154206854],
    [0.133547046, 0.61, 0.154206854],
  ),
  cannedFood: conservativeBounds(
    [-0.196875012, -0.17, -0.196875012],
    [0.196875012, 0.25, 0.196875012],
  ),
  flashlight: conservativeBounds(
    [-0.0864, -0.17, -0.1008],
    [0.0864, 0.55, 0.1008],
  ),
  scubaSet: conservativeBounds(
    [-0.225641026, -0.19, -0.139145299],
    [0.225641026, 0.69, 0.139145299],
  ),
};

export const ITEM_MODEL_SPECS = {
  flareGun: {
    url: new URL('../assets/models/items/flareGun.glb', import.meta.url).href,
    ...normalization.flareGun,
    normalizedBounds: normalizedBounds.flareGun,
    maxTriangles: 3_000,
    sourceUrl: 'https://kenney.nl/assets/blaster-kit',
    sourceAssetId: 'blaster-kit@2.1:Models/GLB format/blaster-n.glb',
    creator: 'Kenney',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  ductTape: {
    url: new URL('../assets/models/items/ductTape.glb', import.meta.url).href,
    ...normalization.ductTape,
    normalizedBounds: normalizedBounds.ductTape,
    maxTriangles: 3_000,
    sourceUrl: 'https://kenney.nl/assets/prototype-kit',
    sourceAssetId: 'prototype-kit@1.0:Models/GLB format/shape-hollow-cylinder-detailed.glb',
    creator: 'Kenney',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  fishingRod: {
    url: new URL('../assets/models/items/fishingRod.glb', import.meta.url).href,
    ...normalization.fishingRod,
    normalizedBounds: normalizedBounds.fishingRod,
    maxTriangles: 3_000,
    sourceUrl: 'https://kenney.nl/assets/prototype-kit',
    sourceAssetId: 'prototype-kit@1.0:composite/fishingRod',
    creator: 'Kenney',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  baitTin: {
    url: new URL('../assets/models/items/baitTin.glb', import.meta.url).href,
    ...normalization.baitTin,
    normalizedBounds: normalizedBounds.baitTin,
    maxTriangles: 3_000,
    sourceUrl: 'https://kenney.nl/assets/food-kit',
    sourceAssetId: 'food-kit@2.0:Models/GLB format/can-small.glb',
    creator: 'Kenney',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  medicalKit: {
    url: new URL('../assets/models/items/medicalKit.glb', import.meta.url).href,
    ...normalization.medicalKit,
    normalizedBounds: normalizedBounds.medicalKit,
    maxTriangles: 3_000,
    sourceUrl: 'https://kenney.nl/assets/prototype-kit',
    sourceAssetId: 'prototype-kit@1.0:composite/medicalKit',
    creator: 'Kenney',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  waterJug: {
    url: new URL('../assets/models/items/waterJug.glb', import.meta.url).href,
    ...normalization.waterJug,
    normalizedBounds: normalizedBounds.waterJug,
    maxTriangles: 3_000,
    sourceUrl: 'https://kenney.nl/assets/survival-kit',
    sourceAssetId: 'survival-kit@2.0:Models/GLB format/bottle.glb',
    creator: 'Kenney',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  cannedFood: {
    url: new URL('../assets/models/items/cannedFood.glb', import.meta.url).href,
    ...normalization.cannedFood,
    normalizedBounds: normalizedBounds.cannedFood,
    maxTriangles: 3_000,
    sourceUrl: 'https://kenney.nl/assets/food-kit',
    sourceAssetId: 'food-kit@2.0:Models/GLB format/can.glb',
    creator: 'Kenney',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  flashlight: {
    url: new URL('../assets/models/items/flashlight.glb', import.meta.url).href,
    ...normalization.flashlight,
    normalizedBounds: normalizedBounds.flashlight,
    maxTriangles: 3_000,
    sourceUrl: 'https://kenney.nl/assets/prototype-kit',
    sourceAssetId: 'prototype-kit@1.0:composite/flashlight',
    creator: 'Kenney',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  scubaSet: {
    url: new URL('../assets/models/items/scubaSet.glb', import.meta.url).href,
    ...normalization.scubaSet,
    normalizedBounds: normalizedBounds.scubaSet,
    maxTriangles: 3_000,
    sourceUrl: 'https://kenney.nl/assets/prototype-kit',
    sourceAssetId: 'prototype-kit@1.0:composite/scubaSet',
    creator: 'Kenney',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
} satisfies Readonly<Record<ItemId, ItemModelSpec>>;

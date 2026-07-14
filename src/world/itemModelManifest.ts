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
  readonly resourceId: string;
  readonly creator: string;
  readonly licenseUrl: string;
}

export const ITEM_MODEL_ASSET_LEDGER = assetLedger;
export const ITEM_MODEL_MAX_TOTAL_TRIANGLES = 28_000;

const normalization: Readonly<Record<ItemId, Pick<ItemModelSpec,
  'targetLongestDimension' | 'normalizedSize' | 'rotation' | 'offset'>>> = {
  flareGun: { targetLongestDimension: 0.72, normalizedSize: [0.721, 0.477, 0.175], rotation: [0, 0, 0], offset: [0, 0.07, 0] },
  ductTape: { targetLongestDimension: 0.62, normalizedSize: [0.554, 0.323, 0.621], rotation: [0, 0, 0], offset: [0, 0, 0] },
  fishingRod: { targetLongestDimension: 1.80, normalizedSize: [0.1, 0.119, 1.801], rotation: [Math.PI / 2, 0, 0], offset: [0, 0, 0] },
  baitTin: { targetLongestDimension: 0.58, normalizedSize: [0.432, 0.581, 0.432], rotation: [0, 0, 0], offset: [0, 0.12, 0] },
  medicalKit: { targetLongestDimension: 0.72, normalizedSize: [0.721, 0.489, 0.26], rotation: [0, 0, 0], offset: [0, 0.07, 0] },
  waterJug: { targetLongestDimension: 0.78, normalizedSize: [0.273, 0.781, 0.273], rotation: [0, 0, 0], offset: [0, 0.22, 0] },
  cannedFood: { targetLongestDimension: 0.42, normalizedSize: [0.313, 0.421, 0.313], rotation: [0, 0, 0], offset: [0, 0.04, 0] },
  flashlight: { targetLongestDimension: 0.72, normalizedSize: [0.195, 0.721, 0.192], rotation: [0, 0, 0], offset: [0, 0.19, 0] },
  scubaSet: { targetLongestDimension: 1.10, normalizedSize: [1.072, 0.841, 1.101], rotation: [0, 0, 0], offset: [0, 0.25, 0] },
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
    [-0.36, -0.167995937843, -0.086690087891],
    [0.36, 0.307995937843, 0.086690087891],
  ),
  ductTape: conservativeBounds(
    [-0.276331325672, -0.16113336008, -0.31],
    [0.276331325672, 0.16113336008, 0.31],
  ),
  fishingRod: conservativeBounds(
    [-0.049159715243, -0.058700466158, -0.9],
    [0.049159715243, 0.058700466158, 0.9],
  ),
  baitTin: conservativeBounds(
    [-0.215327493999, -0.17, -0.21532746642],
    [0.215327493999, 0.41, 0.21532746642],
  ),
  medicalKit: conservativeBounds(
    [-0.36, -0.174063443494, -0.129382113377],
    [0.36, 0.314063443494, 0.129382113377],
  ),
  waterJug: conservativeBounds(
    [-0.135738786864, -0.17, -0.135738788512],
    [0.135738786864, 0.61, 0.135738788512],
  ),
  cannedFood: conservativeBounds(
    [-0.155926805999, -0.17, -0.155926786028],
    [0.155926805999, 0.25, 0.155926786028],
  ),
  flashlight: conservativeBounds(
    [-0.096927613402, -0.17, -0.095455043051],
    [0.096927613402, 0.55, 0.095455043051],
  ),
  scubaSet: conservativeBounds(
    [-0.535653675561, -0.169785281651, -0.55],
    [0.535653675561, 0.669785281651, 0.55],
  ),
};

export const ITEM_MODEL_SPECS = {
  flareGun: {
    url: new URL('../assets/models/items/flareGun.glb', import.meta.url).href,
    ...normalization.flareGun,
    normalizedBounds: normalizedBounds.flareGun,
    maxTriangles: 3_000,
    sourceUrl: 'https://poly.pizza/m/44H9OBUqTC',
    resourceId: '9ec52cda-c918-43f0-b7af-354e7fe96c37',
    creator: 'Quaternius',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  ductTape: {
    url: new URL('../assets/models/items/ductTape.glb', import.meta.url).href,
    ...normalization.ductTape,
    normalizedBounds: normalizedBounds.ductTape,
    maxTriangles: 21_000,
    sourceUrl: 'https://poly.pizza/m/fu49rGO7Ukc',
    resourceId: '06934616-1393-451d-bdf6-2101a5e32703',
    creator: 'Poly by Google',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
  },
  fishingRod: {
    url: new URL('../assets/models/items/fishingRod.glb', import.meta.url).href,
    ...normalization.fishingRod,
    normalizedBounds: normalizedBounds.fishingRod,
    maxTriangles: 3_000,
    sourceUrl: 'https://poly.pizza/m/lDlWQjn9Zg',
    resourceId: 'c15761f7-4aef-4bf4-9565-50a68a981f34',
    creator: 'Quaternius',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  baitTin: {
    url: new URL('../assets/models/items/baitTin.glb', import.meta.url).href,
    ...normalization.baitTin,
    normalizedBounds: normalizedBounds.baitTin,
    maxTriangles: 3_000,
    sourceUrl: 'https://poly.pizza/m/IuoYedcdXQ',
    resourceId: 'f6b52ca9-61b1-42d5-a42f-d8748a41eb45',
    creator: 'Quaternius',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  medicalKit: {
    url: new URL('../assets/models/items/medicalKit.glb', import.meta.url).href,
    ...normalization.medicalKit,
    normalizedBounds: normalizedBounds.medicalKit,
    maxTriangles: 3_000,
    sourceUrl: 'https://poly.pizza/m/Hp80p6148W',
    resourceId: '41249676-0965-40df-8dd7-eee79dd9e6cf',
    creator: 'Quaternius',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  waterJug: {
    url: new URL('../assets/models/items/waterJug.glb', import.meta.url).href,
    ...normalization.waterJug,
    normalizedBounds: normalizedBounds.waterJug,
    maxTriangles: 3_000,
    sourceUrl: 'https://poly.pizza/m/KpxDpidn1Z',
    resourceId: '3ebef9a3-c2df-49ee-abe1-df38b5777bcd',
    creator: 'Quaternius',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  cannedFood: {
    url: new URL('../assets/models/items/cannedFood.glb', import.meta.url).href,
    ...normalization.cannedFood,
    normalizedBounds: normalizedBounds.cannedFood,
    maxTriangles: 3_000,
    sourceUrl: 'https://poly.pizza/m/YnowJvWqxE',
    resourceId: 'e16e13cf-fbc4-48c8-9927-ae34920a498e',
    creator: 'Quaternius',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  flashlight: {
    url: new URL('../assets/models/items/flashlight.glb', import.meta.url).href,
    ...normalization.flashlight,
    normalizedBounds: normalizedBounds.flashlight,
    maxTriangles: 3_000,
    sourceUrl: 'https://poly.pizza/m/WGsvr4KOZd',
    resourceId: '035c4897-22f3-4e9c-b29f-ebafe2b566da',
    creator: 'Quaternius',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  scubaSet: {
    url: new URL('../assets/models/items/scubaSet.glb', import.meta.url).href,
    ...normalization.scubaSet,
    normalizedBounds: normalizedBounds.scubaSet,
    maxTriangles: 3_000,
    sourceUrl: 'https://poly.pizza/m/7igrHLjaQlW',
    resourceId: 'efda7497-db5e-47e9-b317-8e8baeb1c616',
    creator: 'Steren Giannini',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
  },
} satisfies Readonly<Record<ItemId, ItemModelSpec>>;

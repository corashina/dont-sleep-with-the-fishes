/// <reference types="vite/client" />

import assetLedger from '../../THIRD_PARTY_ASSETS.md?raw';
import type { ItemId } from '../game/ItemState';

export interface ItemModelSpec {
  readonly url: string;
  readonly targetLongestDimension: number;
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
  'targetLongestDimension' | 'rotation' | 'offset'>>> = {
  flareGun: { targetLongestDimension: 0.72, rotation: [0, 0, 0], offset: [0, 0, 0] },
  ductTape: { targetLongestDimension: 0.48, rotation: [0, 0, 0], offset: [0, 0, 0] },
  fishingRod: { targetLongestDimension: 1.80, rotation: [0, 0, 0], offset: [0, 0, 0] },
  baitTin: { targetLongestDimension: 0.58, rotation: [0, 0, 0], offset: [0, 0, 0] },
  medicalKit: { targetLongestDimension: 0.72, rotation: [0, 0, 0], offset: [0, 0, 0] },
  waterJug: { targetLongestDimension: 0.78, rotation: [0, 0, 0], offset: [0, 0, 0] },
  cannedFood: { targetLongestDimension: 0.42, rotation: [0, 0, 0], offset: [0, 0, 0] },
  flashlight: { targetLongestDimension: 0.72, rotation: [0, 0, 0], offset: [0, 0, 0] },
  scubaSet: { targetLongestDimension: 1.10, rotation: [0, 0, 0], offset: [0, 0, 0] },
};

export const ITEM_MODEL_SPECS = {
  flareGun: {
    url: new URL('../assets/models/items/flareGun.glb', import.meta.url).href,
    ...normalization.flareGun,
    maxTriangles: 3_000,
    sourceUrl: 'https://poly.pizza/m/44H9OBUqTC',
    resourceId: '9ec52cda-c918-43f0-b7af-354e7fe96c37',
    creator: 'Quaternius',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  ductTape: {
    url: new URL('../assets/models/items/ductTape.glb', import.meta.url).href,
    ...normalization.ductTape,
    maxTriangles: 21_000,
    sourceUrl: 'https://poly.pizza/m/fu49rGO7Ukc',
    resourceId: '06934616-1393-451d-bdf6-2101a5e32703',
    creator: 'Poly by Google',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
  },
  fishingRod: {
    url: new URL('../assets/models/items/fishingRod.glb', import.meta.url).href,
    ...normalization.fishingRod,
    maxTriangles: 3_000,
    sourceUrl: 'https://poly.pizza/m/lDlWQjn9Zg',
    resourceId: 'c15761f7-4aef-4bf4-9565-50a68a981f34',
    creator: 'Quaternius',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  baitTin: {
    url: new URL('../assets/models/items/baitTin.glb', import.meta.url).href,
    ...normalization.baitTin,
    maxTriangles: 3_000,
    sourceUrl: 'https://poly.pizza/m/IuoYedcdXQ',
    resourceId: 'f6b52ca9-61b1-42d5-a42f-d8748a41eb45',
    creator: 'Quaternius',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  medicalKit: {
    url: new URL('../assets/models/items/medicalKit.glb', import.meta.url).href,
    ...normalization.medicalKit,
    maxTriangles: 3_000,
    sourceUrl: 'https://poly.pizza/m/Hp80p6148W',
    resourceId: '41249676-0965-40df-8dd7-eee79dd9e6cf',
    creator: 'Quaternius',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  waterJug: {
    url: new URL('../assets/models/items/waterJug.glb', import.meta.url).href,
    ...normalization.waterJug,
    maxTriangles: 3_000,
    sourceUrl: 'https://poly.pizza/m/KpxDpidn1Z',
    resourceId: '3ebef9a3-c2df-49ee-abe1-df38b5777bcd',
    creator: 'Quaternius',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  cannedFood: {
    url: new URL('../assets/models/items/cannedFood.glb', import.meta.url).href,
    ...normalization.cannedFood,
    maxTriangles: 3_000,
    sourceUrl: 'https://poly.pizza/m/YnowJvWqxE',
    resourceId: 'e16e13cf-fbc4-48c8-9927-ae34920a498e',
    creator: 'Quaternius',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  flashlight: {
    url: new URL('../assets/models/items/flashlight.glb', import.meta.url).href,
    ...normalization.flashlight,
    maxTriangles: 3_000,
    sourceUrl: 'https://poly.pizza/m/WGsvr4KOZd',
    resourceId: '035c4897-22f3-4e9c-b29f-ebafe2b566da',
    creator: 'Quaternius',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  scubaSet: {
    url: new URL('../assets/models/items/scubaSet.glb', import.meta.url).href,
    ...normalization.scubaSet,
    maxTriangles: 3_000,
    sourceUrl: 'https://poly.pizza/m/7igrHLjaQlW',
    resourceId: 'efda7497-db5e-47e9-b317-8e8baeb1c616',
    creator: 'Steren Giannini',
    licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
  },
} satisfies Readonly<Record<ItemId, ItemModelSpec>>;

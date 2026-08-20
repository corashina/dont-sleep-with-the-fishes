/// <reference types="vite/client" />

import generatedMetadataJson from '../assets/models/items/item-model-metadata.json';
import { ITEM_IDS, type ItemId } from '../game/ItemState';
import { normalizeGeneratedBounds } from './modelNormalization';

export interface GeneratedRuntimeModelMetadata {
  readonly triangles: number;
  readonly animations?: readonly {
    readonly name: string;
    readonly duration: number;
    readonly channels: number;
  }[];
  readonly rawBounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
}

export interface RuntimeModelSpec {
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
  readonly generatedMetadata: GeneratedRuntimeModelMetadata;
}

export type GeneratedItemModelMetadata = GeneratedRuntimeModelMetadata;
export type ItemModelSpec = RuntimeModelSpec;

export const ITEM_MODEL_MAX_TOTAL_TRIANGLES = 40_000;

export type RuntimeModelPresentation = Pick<
  RuntimeModelSpec,
  'targetLongestDimension' | 'rotation' | 'offset'
>;
type Presentation = RuntimeModelPresentation;
const presentation = {
  cannedFood: { targetLongestDimension: 0.42, rotation: [0, 0, 0], offset: [0, 0.04, 0] },
  baitTin: { targetLongestDimension: 0.36, rotation: [0, 0, 0], offset: [0, 0.04, 0] },
  ductTape: { targetLongestDimension: 0.55, rotation: [0, 0, 0], offset: [0, 0, 0] },
  compass: {
    targetLongestDimension: 0.48,
    rotation: [0, -Math.PI / 2, 0],
    offset: [0, 0, 0],
  },
  map: { targetLongestDimension: 0.62, rotation: [0, 0, 0], offset: [0, 0, 0] },
  medicalKit: { targetLongestDimension: 0.72, rotation: [0, 0, 0], offset: [0, 0.07, 0] },
  spyglass: { targetLongestDimension: 0.72, rotation: [0, 0, 0], offset: [0, 0, 0] },
  fishingNet: { targetLongestDimension: 0.82, rotation: [0, 0, 0], offset: [0, 0, 0] },
  bucket: { targetLongestDimension: 0.68, rotation: [0, 0, 0], offset: [0, 0, 0] },
  flareGun: { targetLongestDimension: 0.68, rotation: [Math.PI / 2, 0, 0], offset: [0, 0.07, 0] },
  scubaSet: { targetLongestDimension: 0.88, rotation: [0, 0, 0], offset: [0, 0.44, 0] },
  anchor: { targetLongestDimension: 0.88, rotation: [0, 0, 0], offset: [0, 0, 0] },
  bottledPaper: { targetLongestDimension: 0.62, rotation: [0, 0, Math.PI / 2], offset: [0, 0, 0] },
  umbrella: { targetLongestDimension: 0.90, rotation: [0, 0, Math.PI / 2], offset: [0, 0, 0] },
  swimRing: { targetLongestDimension: 0.70, rotation: [0, 0, 0], offset: [0, 0, 0] },
  flashlight: { targetLongestDimension: 0.72, rotation: [0, 0, 0], offset: [0, 0, 0] },
  shotgun: { targetLongestDimension: 1.00, rotation: [0, Math.PI / 2, 0], offset: [0, 0, 0] },
  energyBar: { targetLongestDimension: 0.48, rotation: [0, 0, 0], offset: [0, 0, 0] },
  carlitos: {
    targetLongestDimension: 0.87,
    rotation: [0, 0, 0],
    offset: [0, 0.23, 0],
  },
} as const satisfies Readonly<Record<ItemId, Presentation>>;

const generatedMetadata = generatedMetadataJson as unknown as Readonly<
  Record<string, GeneratedRuntimeModelMetadata>
>;
const modelTriangleLimits: Readonly<Partial<Record<ItemId, number>>> = Object.freeze({
  fishingNet: 9_000,
  carlitos: 8_000,
});
function generatedNormalization(id: string, authored: RuntimeModelPresentation) {
  const metadata = generatedMetadata[id];
  if (metadata === undefined) throw new Error(`Missing generated model metadata: ${id}`);
  return normalizeGeneratedBounds(
    metadata.rawBounds,
    authored.rotation,
    authored.targetLongestDimension,
    authored.offset,
  );
}

export function createRuntimeModelSpec(
  id: string,
  authored: RuntimeModelPresentation,
): RuntimeModelSpec {
  return Object.freeze({
    url: new URL(`../assets/models/items/${id}.glb`, import.meta.url).href,
    ...authored,
    ...generatedNormalization(id, authored),
    maxTriangles: modelTriangleLimits[id as ItemId] ?? 3_000,
    generatedMetadata: generatedMetadata[id]!,
  });
}

export const ITEM_MODEL_SPECS = Object.freeze(Object.fromEntries(ITEM_IDS.map((id) => {
  return [id, createRuntimeModelSpec(id, presentation[id])];
})) as unknown as Readonly<Record<ItemId, ItemModelSpec>>);

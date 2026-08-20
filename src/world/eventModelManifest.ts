/// <reference types="vite/client" />

import type {
  GeneratedRuntimeModelMetadata,
  RuntimeModelSpec,
} from './itemModelManifest';
import { FOCUSED_EVENT_MODEL_METADATA } from './focusedEventModelMetadata';
import { normalizeGeneratedBounds } from './modelNormalization';

export const EVENT_MODEL_IDS = [
  'chestClosed',
  'midnightIsland',
  'deadTree',
  'traderRowboat',
  'traderOctopus',
  'riggedHand',
  'containerShip',
  'midnightPalmTrees',
  'midnightShovel',
  'midnightMonster',
] as const;

export type EventModelId = typeof EVENT_MODEL_IDS[number];

export interface EventModelSpec extends RuntimeModelSpec {
  readonly sourceUrl: string;
  readonly sourceModelId: string;
  readonly license: 'CC0 1.0' | 'CC-BY 3.0';
  readonly translation: readonly [number, number, number];
}

type EventModelPresentation = Pick<
  EventModelSpec,
  'targetLongestDimension' | 'maxTriangles' | 'translation' | 'rotation'
> & Pick<EventModelSpec, 'sourceUrl' | 'sourceModelId' | 'license'>;

const presentations = {
  chestClosed: {
    sourceUrl: 'https://poly.pizza/m/O72u4Drp8k',
    sourceModelId: 'poly-pizza:803af4ae-433f-4b05-b1f1-c6a2da02d768',
    license: 'CC0 1.0',
    targetLongestDimension: 1.1,
    maxTriangles: 2_000,
    translation: [0, 0.55, 0],
    rotation: [0, 0, 0],
  },
  midnightIsland: {
    sourceUrl: 'https://poly.pizza/m/C03O8OQq6O',
    sourceModelId: 'poly-pizza:1fda6a0b-6228-4c16-9a3f-8ca36d9af6b6',
    license: 'CC-BY 3.0',
    targetLongestDimension: 18,
    maxTriangles: 200,
    translation: [0, -0.35, 0],
    rotation: [0, 0, 0],
  },
  deadTree: {
    sourceUrl: 'https://poly.pizza/m/CD4edbPSGm',
    sourceModelId: 'poly-pizza:4db29f97-8e10-413d-be54-39ecda1a7c8d',
    license: 'CC0 1.0',
    targetLongestDimension: 5.5,
    maxTriangles: 6_000,
    translation: [0, 2.75, 0],
    rotation: [0, 0, 0],
  },
  traderRowboat: {
    sourceUrl: 'https://poly.pizza/m/5UEl54KsuC',
    sourceModelId: 'poly-pizza:c5fe6584-9f6e-46cf-bcf6-95979c7494e4',
    license: 'CC0 1.0',
    targetLongestDimension: 4.2,
    maxTriangles: 2_500,
    translation: [0, 0, 0],
    rotation: [0, 0, 0],
  },
  traderOctopus: {
    sourceUrl: 'https://poly.pizza/m/9F8QJKUT77V',
    sourceModelId: 'poly-pizza:81286501-750b-4d4b-9c41-2e3bbadcc9ae',
    license: 'CC-BY 3.0',
    targetLongestDimension: 1.5,
    maxTriangles: 3_500,
    translation: [0, 0.72, 0],
    rotation: [0, 0, 0],
  },
  riggedHand: {
    sourceUrl: 'https://poly.pizza/m/BEy8jbxm6A',
    sourceModelId: 'poly-pizza:a36ea2d8-8437-4215-98d3-2fa53be67d85',
    license: 'CC-BY 3.0',
    targetLongestDimension: 1.2,
    maxTriangles: 2_000,
    translation: [0, 0, 0],
    rotation: [0, 0, 0],
  },
  containerShip: {
    sourceUrl: 'https://poly.pizza/m/3AmDGcCu6Ll',
    sourceModelId: 'poly-pizza:df197d9f-5d8c-4744-bc03-75ee514e8df3',
    license: 'CC-BY 3.0',
    targetLongestDimension: 36,
    maxTriangles: 2_500,
    translation: [0, 0, 0],
    rotation: [0, 0, 0],
  },
  midnightPalmTrees: {
    sourceUrl: 'https://poly.pizza/m/VYslw9DEi6',
    sourceModelId: 'poly-pizza:88fb0209-5e1e-4cb0-9d11-112e6140ab13',
    license: 'CC0 1.0',
    targetLongestDimension: 6.8,
    maxTriangles: 6_000,
    translation: [0, 3.4, 0],
    rotation: [0, 0, 0],
  },
  midnightShovel: {
    sourceUrl: 'https://poly.pizza/m/oNBQSf87ZJ',
    sourceModelId: 'poly-pizza:4ca5006b-da27-4d96-9042-9672c9776750',
    license: 'CC0 1.0',
    targetLongestDimension: 1.25,
    maxTriangles: 1_000,
    translation: [0, 0, 0],
    rotation: [0, 0, 0],
  },
  midnightMonster: {
    sourceUrl: 'https://poly.pizza/m/22K0aSZkHV',
    sourceModelId: 'poly-pizza:cf4368cf-b39e-4c9a-8a83-a9c637740eb8',
    license: 'CC-BY 3.0',
    targetLongestDimension: 1.9,
    maxTriangles: 6_000,
    translation: [0, 0.95, 0],
    rotation: [0, 0, 0],
  },
} as const satisfies Readonly<Record<EventModelId, EventModelPresentation>>;

const generatedMetadata = FOCUSED_EVENT_MODEL_METADATA as unknown as Readonly<
  Partial<Record<EventModelId, GeneratedRuntimeModelMetadata>>
>;
const INVALID_METADATA: GeneratedRuntimeModelMetadata = Object.freeze({
  triangles: 0,
  rawBounds: Object.freeze({
    min: Object.freeze([0, 0, 0] as const),
    max: Object.freeze([0, 0, 0] as const),
  }),
});
function generatedNormalization(
  metadata: GeneratedRuntimeModelMetadata,
  authored: EventModelPresentation,
) {
  const min = metadata.rawBounds?.min;
  const max = metadata.rawBounds?.max;
  if (
    !Array.isArray(min)
    || !Array.isArray(max)
    || min.length !== 3
    || max.length !== 3
    || ![...min, ...max].every(Number.isFinite)
    || !max.some((value, axis) => value > min[axis]!)
  ) {
    return {
      normalizedSize: [0, 0, 0] as const,
      normalizedBounds: {
        min: authored.translation,
        max: authored.translation,
      },
    };
  }

  return normalizeGeneratedBounds(
    { min, max },
    authored.rotation,
    authored.targetLongestDimension,
    authored.translation,
  );
}

function createEventModelSpec(id: EventModelId): EventModelSpec {
  const authored = presentations[id];
  const metadata = generatedMetadata[id] ?? INVALID_METADATA;
  const assetFile = id === 'chestClosed' ? 'mysteryChest' : id;
  return Object.freeze({
    url: new URL(`../assets/models/events/${assetFile}.glb`, import.meta.url).href,
    ...authored,
    offset: authored.translation,
    ...generatedNormalization(metadata, authored),
    generatedMetadata: metadata,
  });
}

export const EVENT_MODEL_SPECS = Object.freeze(Object.fromEntries(
  EVENT_MODEL_IDS.map((id) => [id, createEventModelSpec(id)]),
)) as Readonly<Record<EventModelId, EventModelSpec>>;

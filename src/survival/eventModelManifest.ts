/// <reference types="vite/client" />

import generatedMetadataJson from '../assets/models/events/event-model-metadata.json';

export const SURVIVAL_EVENT_MODEL_IDS = [
  'driftingLootBarrel',
  'driftingLootCrate',
  'driftingBottle',
  'checkBackFish',
  'mysteryChest',
  'flowers',
] as const;

export type SurvivalEventModelId = typeof SURVIVAL_EVENT_MODEL_IDS[number];

export interface SurvivalEventModelSpec {
  readonly url: string;
  readonly targetLongestDimension: number;
  readonly rotation: readonly [number, number, number];
  readonly maxTriangles: number;
}

const NO_ROTATION = [0, 0, 0] as const;
const QUARTER_TURN_Y = [0, Math.PI / 2, 0] as const;

export const SURVIVAL_EVENT_MODEL_SPECS: Readonly<Record<
  SurvivalEventModelId,
  SurvivalEventModelSpec
>> = Object.freeze({
  driftingLootBarrel: Object.freeze({
    url: new URL('../assets/models/events/driftingLootBarrel.glb', import.meta.url).href,
    targetLongestDimension: 1.15,
    rotation: [0, 0, Math.PI / 2] as const,
    maxTriangles: generatedMetadataJson.driftingLootBarrel.triangles,
  }),
  driftingLootCrate: Object.freeze({
    url: new URL('../assets/models/events/driftingLootCrate.glb', import.meta.url).href,
    targetLongestDimension: 1.2,
    rotation: NO_ROTATION,
    maxTriangles: generatedMetadataJson.driftingLootCrate.triangles,
  }),
  driftingBottle: Object.freeze({
    url: new URL('../assets/models/events/driftingBottle.glb', import.meta.url).href,
    targetLongestDimension: 0.68,
    rotation: [Math.PI / 2, 0, 0] as const,
    maxTriangles: generatedMetadataJson.driftingBottle.triangles,
  }),
  checkBackFish: Object.freeze({
    url: new URL('../assets/models/fishing/bass.glb', import.meta.url).href,
    targetLongestDimension: 1.05,
    rotation: QUARTER_TURN_Y,
    maxTriangles: 506,
  }),
  mysteryChest: Object.freeze({
    url: new URL('../assets/models/events/mysteryChest.glb', import.meta.url).href,
    targetLongestDimension: 1.35,
    rotation: NO_ROTATION,
    maxTriangles: generatedMetadataJson.mysteryChest.triangles,
  }),
  flowers: Object.freeze({
    url: new URL('../assets/models/events/flowers.glb', import.meta.url).href,
    targetLongestDimension: 0.9,
    rotation: NO_ROTATION,
    maxTriangles: generatedMetadataJson.flowers.triangles,
  }),
});

export const EVENT_MODEL_IDS = Object.freeze([
  'fogMan', 'ghost', 'siren', 'sirenRock',
] as const);

export type EventModelId = typeof EVENT_MODEL_IDS[number];

export interface EventModelMetadata {
  readonly triangles: number;
  readonly rawBounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly animations: readonly {
    readonly name: string;
    readonly duration: number;
    readonly channels: number;
  }[];
}

export interface EventModelSpec {
  readonly url: string;
  readonly targetLongestDimension: number;
  readonly rotation: readonly [number, number, number];
  readonly offset: readonly [number, number, number];
  readonly maxTriangles: number;
  readonly generatedMetadata: EventModelMetadata;
}

const PRESENTATION = {
  fogMan: {
    targetLongestDimension: 2.4,
    rotation: [0, Math.PI, 0],
    offset: [0, 1.2, 0],
    maxTriangles: 2_200,
  },
  ghost: {
    targetLongestDimension: 1.65,
    rotation: [0, -Math.PI / 2, 0],
    offset: [0, 0.75, 0],
    maxTriangles: 1_100,
  },
  siren: {
    targetLongestDimension: 2.1,
    rotation: [0, Math.PI, Math.PI / 2],
    offset: [0, 0.55, 0],
    maxTriangles: 6_200,
  },
  sirenRock: {
    targetLongestDimension: 4.8,
    rotation: [0, 0.15, 0],
    offset: [0, 0, 0],
    maxTriangles: 250,
  },
} as const satisfies Readonly<Record<
  EventModelId,
  Pick<
    EventModelSpec,
    'targetLongestDimension' | 'rotation' | 'offset' | 'maxTriangles'
  >
>>;

const urls = import.meta.glob<string>(
  '../assets/models/events/*.glb',
  { eager: true, query: '?url', import: 'default' },
);
const generatedMetadata = generatedMetadataJson as unknown as Readonly<Record<
  EventModelId,
  EventModelMetadata
>>;

function modelUrl(id: EventModelId): string {
  const url = urls[`../assets/models/events/${id}.glb`];
  if (!url) throw new Error(`Missing event model asset: ${id}`);
  return url;
}

export const EVENT_MODEL_SPECS = Object.freeze(Object.fromEntries(
  EVENT_MODEL_IDS.map((id) => [
    id,
    Object.freeze({
      ...PRESENTATION[id],
      url: modelUrl(id),
      generatedMetadata: generatedMetadata[id],
    }),
  ]),
) as unknown as Readonly<Record<EventModelId, EventModelSpec>>);

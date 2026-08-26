/// <reference types="vite/client" />

import generatedMetadataJson from '../assets/models/events/event-model-metadata.json';
import { FOCUSED_EVENT_MODEL_METADATA } from '../world/focusedEventModelMetadata';

export const SURVIVAL_EVENT_MODEL_IDS = [
  'driftingBarrel',
  'emptyLifeboat',
  'checkBackFish',
  'checkBackAnglerfish',
  'anglerFish',
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
  driftingBarrel: Object.freeze({
    url: new URL('../assets/models/events/driftingBarrel.glb', import.meta.url).href,
    targetLongestDimension: 1.15,
    rotation: [0, 0, Math.PI / 2] as const,
    maxTriangles: generatedMetadataJson.driftingBarrel.triangles,
  }),
  emptyLifeboat: Object.freeze({
    url: new URL('../assets/models/events/emptyLifeboat.glb', import.meta.url).href,
    targetLongestDimension: 4.6,
    rotation: NO_ROTATION,
    maxTriangles: generatedMetadataJson.emptyLifeboat.triangles,
  }),
  checkBackFish: Object.freeze({
    url: new URL('../assets/models/fishing/bass.glb', import.meta.url).href,
    targetLongestDimension: 1.05,
    rotation: QUARTER_TURN_Y,
    maxTriangles: 506,
  }),
  checkBackAnglerfish: Object.freeze({
    url: new URL('../assets/models/events/anglerFish.glb', import.meta.url).href,
    targetLongestDimension: 1.4,
    rotation: [0, -Math.PI / 2, 0] as const,
    maxTriangles: generatedMetadataJson.anglerFish.triangles,
  }),
  anglerFish: Object.freeze({
    url: new URL('../assets/models/events/anglerFish.glb', import.meta.url).href,
    targetLongestDimension: 1.4,
    rotation: [0, -Math.PI / 2, 0] as const,
    maxTriangles: generatedMetadataJson.anglerFish.triangles,
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
  'leakPlanks', 'schoolFish', 'snatcher', 'anglerFish', 'deathStareBlob',
  'tornadoCore',
  'containerShip',
  'wreckageBox', 'wreckageCrate', 'wreckagePallet',
] as const);

export type EventModelId = typeof EVENT_MODEL_IDS[number];

export interface EventModelMetadata {
  readonly triangles: number;
  readonly rawBounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly animations?: readonly {
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

export const EVENT_MODEL_MAX_TOTAL_TRIANGLES = 22_000;

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
    rotation: [0, 0, 0],
    offset: [0, 0.55, 0],
    maxTriangles: 800,
  },
  sirenRock: {
    targetLongestDimension: 4.8,
    rotation: [0, 0.15, 0],
    offset: [0, 0, 0],
    maxTriangles: 250,
  },
  leakPlanks: {
    targetLongestDimension: 1.7,
    rotation: [0, 0, 0],
    offset: [0, 0, 0],
    maxTriangles: 2_000,
  },
  schoolFish: {
    targetLongestDimension: 0.62,
    rotation: [0, -Math.PI / 2, 0],
    offset: [0, 0, 0],
    maxTriangles: 2_000,
  },
  snatcher: {
    targetLongestDimension: 2.5,
    rotation: [0, 0, 0],
    offset: [0, 1.25, 0],
    maxTriangles: 4_000,
  },
  anglerFish: {
    targetLongestDimension: 1.0,
    rotation: [0, -Math.PI / 2, 0],
    offset: [0, 0, 0],
    maxTriangles: 4_000,
  },
  deathStareBlob: {
    targetLongestDimension: 1.0,
    rotation: [0, 0, 0],
    offset: [0, 0, 0],
    maxTriangles: 5_000,
  },
  tornadoCore: {
    targetLongestDimension: 10.5,
    rotation: [0, 0, 0],
    offset: [0, 0, 0],
    maxTriangles: 3_000,
  },
  containerShip: {
    targetLongestDimension: 18,
    rotation: [0, 0, 0],
    offset: [0, 0, 0],
    maxTriangles: 2_500,
  },
  wreckageBox: {
    targetLongestDimension: 0.9,
    rotation: [0, 0, 0],
    offset: [0, 0, 0],
    maxTriangles: 2_000,
  },
  wreckageCrate: {
    targetLongestDimension: 1.05,
    rotation: [0, 0, 0],
    offset: [0, 0, 0],
    maxTriangles: 2_000,
  },
  wreckagePallet: {
    targetLongestDimension: 1.8,
    rotation: [0, 0, 0],
    offset: [0, 0, 0],
    maxTriangles: 3_000,
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

interface GeneratedEventModelMetadataSource {
  readonly triangles: number;
  readonly rawBounds: {
    readonly min: readonly number[];
    readonly max: readonly number[];
  };
  readonly animations?: readonly {
    readonly name: string;
    readonly duration: number;
    readonly channels: number;
  }[];
}

function checkedMetadata(
  id: EventModelId,
  source: GeneratedEventModelMetadataSource,
): EventModelMetadata {
  const { min, max } = source.rawBounds;
  if (min.length !== 3 || max.length !== 3) {
    throw new Error(`Event model ${id}: generated bounds metadata is invalid`);
  }
  return {
    triangles: source.triangles,
    rawBounds: {
      min: [min[0]!, min[1]!, min[2]!],
      max: [max[0]!, max[1]!, max[2]!],
    },
    ...(source.animations === undefined ? {} : { animations: source.animations }),
  };
}

const generatedMetadata = {
  fogMan: checkedMetadata('fogMan', generatedMetadataJson.fogMan),
  ghost: checkedMetadata('ghost', generatedMetadataJson.ghost),
  siren: checkedMetadata('siren', generatedMetadataJson.siren),
  sirenRock: checkedMetadata('sirenRock', generatedMetadataJson.sirenRock),
  leakPlanks: checkedMetadata('leakPlanks', generatedMetadataJson.leakPlanks),
  schoolFish: checkedMetadata('schoolFish', generatedMetadataJson.schoolFish),
  snatcher: checkedMetadata('snatcher', generatedMetadataJson.snatcher),
  anglerFish: checkedMetadata('anglerFish', generatedMetadataJson.anglerFish),
  deathStareBlob: checkedMetadata('deathStareBlob', generatedMetadataJson.deathStareBlob),
  tornadoCore: checkedMetadata('tornadoCore', generatedMetadataJson.tornadoCore),
  containerShip: FOCUSED_EVENT_MODEL_METADATA.containerShip,
  wreckageBox: checkedMetadata('wreckageBox', generatedMetadataJson.wreckageBox),
  wreckageCrate: checkedMetadata('wreckageCrate', generatedMetadataJson.wreckageCrate),
  wreckagePallet: checkedMetadata('wreckagePallet', generatedMetadataJson.wreckagePallet),
} satisfies Readonly<Record<EventModelId, EventModelMetadata>>;

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

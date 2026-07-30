import generatedMetadata from '../assets/models/events/event-model-metadata.json';

export const EVENT_MODEL_IDS = [
  'leakPlanks',
  'schoolFish',
  'snatcher',
  'anglerFish',
  'whirlpoolCore',
] as const;

export type EventModelId = typeof EVENT_MODEL_IDS[number];

export interface EventModelSpec {
  readonly url: string;
  readonly targetLongestDimension: number;
  readonly rotation: readonly [number, number, number];
  readonly offset: readonly [number, number, number];
  readonly maxTriangles: number;
  readonly generatedMetadata: {
    readonly triangles: number;
    readonly rawBounds: {
      readonly min: readonly [number, number, number];
      readonly max: readonly [number, number, number];
    };
  };
}

export const EVENT_MODEL_MAX_TOTAL_TRIANGLES = 12_000;

const presentation = {
  leakPlanks: { targetLongestDimension: 1.7, rotation: [0, 0, 0], offset: [0, 0, 0] },
  schoolFish: { targetLongestDimension: 0.62, rotation: [0, Math.PI / 2, 0], offset: [0, 0, 0] },
  snatcher: { targetLongestDimension: 1.25, rotation: [0, 0, 0], offset: [0, 0.5, 0] },
  anglerFish: { targetLongestDimension: 1.0, rotation: [0, Math.PI / 2, 0], offset: [0, 0, 0] },
  whirlpoolCore: { targetLongestDimension: 7.0, rotation: [Math.PI / 2, 0, 0], offset: [0, -0.45, 0] },
} as const;

const triangleLimits: Readonly<Record<EventModelId, number>> = {
  leakPlanks: 2_000,
  schoolFish: 2_000,
  snatcher: 4_000,
  anglerFish: 4_000,
  whirlpoolCore: 3_000,
};

const modelUrls: Readonly<Record<EventModelId, string>> = {
  leakPlanks: new URL('../assets/models/events/leakPlanks.glb', import.meta.url).href,
  schoolFish: new URL('../assets/models/events/schoolFish.glb', import.meta.url).href,
  snatcher: new URL('../assets/models/events/snatcher.glb', import.meta.url).href,
  anglerFish: new URL('../assets/models/events/anglerFish.glb', import.meta.url).href,
  whirlpoolCore: new URL('../assets/models/events/whirlpoolCore.glb', import.meta.url).href,
};

export const EVENT_MODEL_SPECS: Readonly<Record<EventModelId, EventModelSpec>> =
  Object.freeze(Object.fromEntries(EVENT_MODEL_IDS.map((id) => [
    id,
    Object.freeze({
      ...presentation[id],
      url: modelUrls[id],
      maxTriangles: triangleLimits[id],
      generatedMetadata: generatedMetadata[id],
    }),
  ])) as unknown as Record<EventModelId, EventModelSpec>);

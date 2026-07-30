import generatedMetadata from '../assets/models/events/event-model-metadata.json';

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
    maxTriangles: generatedMetadata.driftingLootBarrel.triangles,
  }),
  driftingLootCrate: Object.freeze({
    url: new URL('../assets/models/events/driftingLootCrate.glb', import.meta.url).href,
    targetLongestDimension: 1.2,
    rotation: NO_ROTATION,
    maxTriangles: generatedMetadata.driftingLootCrate.triangles,
  }),
  driftingBottle: Object.freeze({
    url: new URL('../assets/models/events/driftingBottle.glb', import.meta.url).href,
    targetLongestDimension: 0.68,
    rotation: [Math.PI / 2, 0, 0] as const,
    maxTriangles: generatedMetadata.driftingBottle.triangles,
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
    maxTriangles: generatedMetadata.mysteryChest.triangles,
  }),
  flowers: Object.freeze({
    url: new URL('../assets/models/events/flowers.glb', import.meta.url).href,
    targetLongestDimension: 0.9,
    rotation: NO_ROTATION,
    maxTriangles: generatedMetadata.flowers.triangles,
  }),
});

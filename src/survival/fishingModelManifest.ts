import generatedMetadata from '../assets/models/fishing/fishing-model-metadata.json';
import type { FishingCatchId } from './fishingCatalog';

export const FISHING_MODEL_CATCH_IDS = [
  'cod',
  'salmon',
  'tuna',
  'crab',
  'squid',
  'sardine',
  'bass',
  'redSnapper',
  'clownfish',
  'seaweed',
  'boot',
  'plasticBottle',
  'fishBones',
  'blowfish',
  'fish',
  'goldfish',
  'trout',
  'kingfish',
  'piranha',
  'crayfish',
  'halibut',
  'brokenCan',
  'crushedCan',
  'backpack',
] as const satisfies readonly FishingCatchId[];

export type FishingModelCatchId = typeof FISHING_MODEL_CATCH_IDS[number];

export interface FishingCatchModelSpec {
  readonly url: string;
  readonly targetLength: number;
  readonly rotation: readonly [number, number, number];
  readonly maxTriangles: number;
}

const QUARTER_TURN_Y = [0, Math.PI / 2, 0] as const;
const NO_ROTATION = [0, 0, 0] as const;
const modelUrls: Readonly<Record<FishingModelCatchId, string>> = {
  cod: new URL('../assets/models/fishing/cod.glb', import.meta.url).href,
  salmon: new URL('../assets/models/fishing/salmon.glb', import.meta.url).href,
  tuna: new URL('../assets/models/fishing/tuna.glb', import.meta.url).href,
  crab: new URL('../assets/models/fishing/crab.glb', import.meta.url).href,
  squid: new URL('../assets/models/fishing/squid.glb', import.meta.url).href,
  sardine: new URL('../assets/models/fishing/sardine.glb', import.meta.url).href,
  bass: new URL('../assets/models/fishing/bass.glb', import.meta.url).href,
  redSnapper: new URL('../assets/models/fishing/redSnapper.glb', import.meta.url).href,
  clownfish: new URL('../assets/models/fishing/clownfish.glb', import.meta.url).href,
  seaweed: new URL('../assets/models/fishing/seaweed.glb', import.meta.url).href,
  boot: new URL('../assets/models/fishing/boot.glb', import.meta.url).href,
  plasticBottle: new URL('../assets/models/fishing/plasticBottle.glb', import.meta.url).href,
  fishBones: new URL('../assets/models/fishing/fishBones.glb', import.meta.url).href,
  blowfish: new URL('../assets/models/fishing/blowfish.glb', import.meta.url).href,
  fish: new URL('../assets/models/fishing/fish.glb', import.meta.url).href,
  goldfish: new URL('../assets/models/fishing/goldfish.glb', import.meta.url).href,
  trout: new URL('../assets/models/fishing/trout.glb', import.meta.url).href,
  kingfish: new URL('../assets/models/fishing/kingfish.glb', import.meta.url).href,
  piranha: new URL('../assets/models/fishing/piranha.glb', import.meta.url).href,
  crayfish: new URL('../assets/models/fishing/crayfish.glb', import.meta.url).href,
  halibut: new URL('../assets/models/fishing/halibut.glb', import.meta.url).href,
  brokenCan: new URL('../assets/models/fishing/brokenCan.glb', import.meta.url).href,
  crushedCan: new URL('../assets/models/fishing/crushedCan.glb', import.meta.url).href,
  backpack: new URL('../assets/models/fishing/backpack.glb', import.meta.url).href,
};

const presentation: Readonly<Record<
  FishingModelCatchId,
  Pick<FishingCatchModelSpec, 'targetLength' | 'rotation'>
>> = {
  cod: { targetLength: 1.05, rotation: NO_ROTATION },
  salmon: { targetLength: 1.1, rotation: QUARTER_TURN_Y },
  tuna: { targetLength: 1.65, rotation: QUARTER_TURN_Y },
  crab: { targetLength: 0.78, rotation: NO_ROTATION },
  squid: { targetLength: 1.45, rotation: QUARTER_TURN_Y },
  sardine: { targetLength: 0.68, rotation: QUARTER_TURN_Y },
  bass: { targetLength: 0.525, rotation: QUARTER_TURN_Y },
  redSnapper: { targetLength: 0.95, rotation: QUARTER_TURN_Y },
  clownfish: { targetLength: 0.58, rotation: NO_ROTATION },
  seaweed: { targetLength: 0.31, rotation: NO_ROTATION },
  boot: { targetLength: 0.36, rotation: NO_ROTATION },
  plasticBottle: { targetLength: 0.15, rotation: NO_ROTATION },
  fishBones: { targetLength: 0.44, rotation: QUARTER_TURN_Y },
  blowfish: { targetLength: 0.39, rotation: NO_ROTATION },
  fish: { targetLength: 0.525, rotation: QUARTER_TURN_Y },
  goldfish: { targetLength: 0.29, rotation: QUARTER_TURN_Y },
  trout: { targetLength: 0.55, rotation: QUARTER_TURN_Y },
  kingfish: { targetLength: 0.825, rotation: QUARTER_TURN_Y },
  piranha: { targetLength: 0.475, rotation: QUARTER_TURN_Y },
  crayfish: { targetLength: 0.39, rotation: QUARTER_TURN_Y },
  halibut: { targetLength: 0.825, rotation: QUARTER_TURN_Y },
  brokenCan: { targetLength: 0.15, rotation: NO_ROTATION },
  crushedCan: { targetLength: 0.15, rotation: NO_ROTATION },
  backpack: { targetLength: 0.38, rotation: NO_ROTATION },
};

export const FISHING_CATCH_MODEL_SPECS: Readonly<Record<
  FishingModelCatchId,
  FishingCatchModelSpec
>> = Object.freeze(Object.fromEntries(FISHING_MODEL_CATCH_IDS.map((catchId) => [
  catchId,
  Object.freeze({
    ...presentation[catchId],
    url: modelUrls[catchId],
    maxTriangles: generatedMetadata[catchId].triangles,
  }),
])) as unknown as Record<FishingModelCatchId, FishingCatchModelSpec>);

export function fishingCatchModelSpec(
  catchId: FishingCatchId,
): FishingCatchModelSpec | undefined {
  return (FISHING_CATCH_MODEL_SPECS as Partial<Record<FishingCatchId, FishingCatchModelSpec>>)[
    catchId
  ];
}

import generatedMetadata from '../assets/models/fishing/fishing-model-metadata.json';
import type { FishingCatchId } from './fishingCatalog';
import { FISHING_MODEL_SIZES } from '../game/fishingModelSizes';

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
  readonly targetLongestDimension: number;
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
  Pick<FishingCatchModelSpec, 'targetLongestDimension' | 'rotation'>
>> = {
  cod: { targetLongestDimension: FISHING_MODEL_SIZES.cod, rotation: NO_ROTATION },
  salmon: { targetLongestDimension: FISHING_MODEL_SIZES.salmon, rotation: QUARTER_TURN_Y },
  tuna: { targetLongestDimension: FISHING_MODEL_SIZES.tuna, rotation: QUARTER_TURN_Y },
  crab: { targetLongestDimension: FISHING_MODEL_SIZES.crab, rotation: NO_ROTATION },
  squid: { targetLongestDimension: FISHING_MODEL_SIZES.squid, rotation: QUARTER_TURN_Y },
  sardine: { targetLongestDimension: FISHING_MODEL_SIZES.sardine, rotation: QUARTER_TURN_Y },
  bass: { targetLongestDimension: FISHING_MODEL_SIZES.bass, rotation: QUARTER_TURN_Y },
  redSnapper: { targetLongestDimension: FISHING_MODEL_SIZES.redSnapper, rotation: QUARTER_TURN_Y },
  clownfish: { targetLongestDimension: FISHING_MODEL_SIZES.clownfish, rotation: NO_ROTATION },
  seaweed: { targetLongestDimension: FISHING_MODEL_SIZES.seaweed, rotation: NO_ROTATION },
  boot: { targetLongestDimension: FISHING_MODEL_SIZES.boot, rotation: NO_ROTATION },
  plasticBottle: { targetLongestDimension: FISHING_MODEL_SIZES.plasticBottle, rotation: NO_ROTATION },
  fishBones: { targetLongestDimension: FISHING_MODEL_SIZES.fishBones, rotation: QUARTER_TURN_Y },
  blowfish: { targetLongestDimension: FISHING_MODEL_SIZES.blowfish, rotation: NO_ROTATION },
  fish: { targetLongestDimension: FISHING_MODEL_SIZES.fish, rotation: QUARTER_TURN_Y },
  goldfish: { targetLongestDimension: FISHING_MODEL_SIZES.goldfish, rotation: QUARTER_TURN_Y },
  trout: { targetLongestDimension: FISHING_MODEL_SIZES.trout, rotation: QUARTER_TURN_Y },
  kingfish: { targetLongestDimension: FISHING_MODEL_SIZES.kingfish, rotation: QUARTER_TURN_Y },
  piranha: { targetLongestDimension: FISHING_MODEL_SIZES.piranha, rotation: QUARTER_TURN_Y },
  crayfish: { targetLongestDimension: FISHING_MODEL_SIZES.crayfish, rotation: QUARTER_TURN_Y },
  halibut: { targetLongestDimension: FISHING_MODEL_SIZES.halibut, rotation: QUARTER_TURN_Y },
  brokenCan: { targetLongestDimension: FISHING_MODEL_SIZES.brokenCan, rotation: NO_ROTATION },
  crushedCan: { targetLongestDimension: FISHING_MODEL_SIZES.crushedCan, rotation: NO_ROTATION },
  backpack: { targetLongestDimension: FISHING_MODEL_SIZES.backpack, rotation: NO_ROTATION },
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

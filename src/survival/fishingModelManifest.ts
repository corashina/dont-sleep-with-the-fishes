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
  bass: { targetLength: 1.05, rotation: QUARTER_TURN_Y },
  redSnapper: { targetLength: 0.95, rotation: QUARTER_TURN_Y },
  clownfish: { targetLength: 0.58, rotation: NO_ROTATION },
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

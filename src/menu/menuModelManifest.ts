import fishingMetadataJson from '../assets/models/fishing/fishing-model-metadata.json';
import menuMetadataJson from '../assets/models/menu/menu-model-metadata.json';

export const MENU_MODEL_IDS = [
  'boat', 'rockA', 'rockB', 'rockC', 'coral', 'starfish',
  'fishBone', 'skull', 'largeBone', 'shark',
  'redSnapper', 'seaweed',
] as const;

export type MenuModelId = typeof MENU_MODEL_IDS[number];

export interface MenuModelSpec {
  readonly url: string;
  readonly targetLongestDimension: number;
  readonly rotation: readonly [number, number, number];
  readonly maxTriangles: number;
  readonly generatedMetadata: {
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
  };
}

const PRESENTATION = {
  boat: { targetLongestDimension: 5.4, rotation: [0, 0, 0], maxTriangles: 500 },
  rockA: { targetLongestDimension: 3.4, rotation: [0, 0, 0], maxTriangles: 500 },
  rockB: { targetLongestDimension: 2.6, rotation: [0, 0, 0], maxTriangles: 300 },
  rockC: { targetLongestDimension: 4.2, rotation: [0, 0, 0], maxTriangles: 500 },
  coral: { targetLongestDimension: 1.6, rotation: [0, 0, 0], maxTriangles: 900 },
  starfish: { targetLongestDimension: 1.0, rotation: [0, 0, 0], maxTriangles: 800 },
  fishBone: { targetLongestDimension: 0.75, rotation: [0, 0, 0], maxTriangles: 700 },
  skull: { targetLongestDimension: 0.52, rotation: [0, 0, 0], maxTriangles: 3500 },
  largeBone: { targetLongestDimension: 0.9, rotation: [0, 0, 0], maxTriangles: 1800 },
  shark: { targetLongestDimension: 4.8, rotation: [0, 0, 0], maxTriangles: 700 },
  redSnapper: { targetLongestDimension: 0.76, rotation: [0, 0, 0], maxTriangles: 2000 },
  seaweed: { targetLongestDimension: 0.62, rotation: [0, 0, 0], maxTriangles: 2000 },
} as const;

type GeneratedMetadata = MenuModelSpec['generatedMetadata'];
type SourceMetadata = Omit<GeneratedMetadata, 'animations'> & {
  readonly animations?: GeneratedMetadata['animations'];
};

const menuMetadata = menuMetadataJson as unknown as Readonly<Record<string, SourceMetadata>>;
const fishingMetadata = fishingMetadataJson as unknown as Readonly<Record<string, SourceMetadata>>;

function metadata(source: SourceMetadata): GeneratedMetadata {
  return {
    ...source,
    animations: source.animations ?? [],
  };
}

function modelUrl(id: MenuModelId): string {
  const directory = id === 'redSnapper' || id === 'seaweed'
    ? 'fishing' : 'menu';
  return new URL(`../assets/models/${directory}/${id}.glb`, import.meta.url).href;
}

const GENERATED_METADATA: Readonly<Record<MenuModelId, GeneratedMetadata>> = {
  boat: metadata(menuMetadata.boat!),
  rockA: metadata(menuMetadata.rockA!),
  rockB: metadata(menuMetadata.rockB!),
  rockC: metadata(menuMetadata.rockC!),
  coral: metadata(menuMetadata.coral!),
  starfish: metadata(menuMetadata.starfish!),
  fishBone: metadata(menuMetadata.fishBone!),
  skull: metadata(menuMetadata.skull!),
  largeBone: metadata(menuMetadata.largeBone!),
  shark: metadata(menuMetadata.shark!),
  redSnapper: metadata(fishingMetadata.redSnapper!),
  seaweed: metadata(fishingMetadata.seaweed!),
};

export const MENU_MODEL_SPECS = Object.freeze(Object.fromEntries(MENU_MODEL_IDS.map((id) => [id, {
  url: modelUrl(id),
  ...PRESENTATION[id],
  generatedMetadata: GENERATED_METADATA[id],
}])) as Record<MenuModelId, MenuModelSpec>);

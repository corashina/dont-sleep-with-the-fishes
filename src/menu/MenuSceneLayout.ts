import { MENU_MODEL_SPECS } from './menuModelManifest';

type MenuGroundModelId =
  | 'rockA'
  | 'rockB'
  | 'rockC'
  | 'coral'
  | 'seaweed'
  | 'starfish'
  | 'skull';

export interface MenuGroundPlacement {
  readonly id: string;
  readonly modelId: MenuGroundModelId;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly halfSize: readonly [number, number];
}

export interface MenuGroundFootprint {
  readonly id: string;
  readonly position: readonly [number, number, number];
  readonly halfSize: readonly [number, number];
}

function modelHalfSize(modelId: MenuGroundModelId): readonly [number, number] {
  const spec = MENU_MODEL_SPECS[modelId];
  const { min, max } = spec.generatedMetadata.rawBounds;
  const rawSizeX = max[0] - min[0];
  const rawSizeY = max[1] - min[1];
  const rawSizeZ = max[2] - min[2];
  const scale = spec.targetLongestDimension / Math.max(rawSizeX, rawSizeY, rawSizeZ);
  const radius = 0.5 * Math.hypot(rawSizeX, rawSizeY, rawSizeZ) * scale;
  return [radius, radius];
}

const MODEL_HALF_SIZE: Readonly<Record<
  MenuGroundModelId,
  readonly [number, number]
>> = {
  rockA: modelHalfSize('rockA'),
  rockB: modelHalfSize('rockB'),
  rockC: modelHalfSize('rockC'),
  coral: modelHalfSize('coral'),
  seaweed: modelHalfSize('seaweed'),
  starfish: modelHalfSize('starfish'),
  skull: modelHalfSize('skull'),
} as const;

export const MENU_PROTECTED_FOOTPRINTS: readonly MenuGroundFootprint[] = [
  { id: 'guide-sign', position: [-2.55, -0.94, 2.55], halfSize: [1.45, 0.55] },
  { id: 'start-sign', position: [2.55, -0.86, 2.45], halfSize: [1.3, 0.55] },
  { id: 'boat', position: [0, 0.42, -4.8], halfSize: [1.3, 2.9] },
  { id: 'dorothy', position: [1.6, 0.08, -19.5], halfSize: [9.2, 2.9] },
];

export const MENU_MODEL_PLACEMENTS: readonly MenuGroundPlacement[] = [
  { id: 'rock-a-1', modelId: 'rockA', position: [-6, -0.1, -1], rotation: [0, 0.4, 0], halfSize: MODEL_HALF_SIZE.rockA },
  { id: 'rock-a-2', modelId: 'rockA', position: [7, -0.25, -5], rotation: [0, -0.8, 0.08], halfSize: MODEL_HALF_SIZE.rockA },
  { id: 'rock-a-3', modelId: 'rockA', position: [-13, -0.32, -12], rotation: [0, 1.1, -0.05], halfSize: MODEL_HALF_SIZE.rockA },
  { id: 'rock-a-4', modelId: 'rockA', position: [14, -0.4, -15], rotation: [0, 0.25, 0.04], halfSize: MODEL_HALF_SIZE.rockA },
  { id: 'rock-a-5', modelId: 'rockA', position: [-24, -0.45, -27], rotation: [0, -0.55, -0.03], halfSize: MODEL_HALF_SIZE.rockA },
  { id: 'rock-a-6', modelId: 'rockA', position: [28, -0.46, -38], rotation: [0, 0.72, 0.02], halfSize: MODEL_HALF_SIZE.rockA },
  { id: 'rock-b-1', modelId: 'rockB', position: [-9, -0.15, -6.5], rotation: [0, -0.7, 0], halfSize: MODEL_HALF_SIZE.rockB },
  { id: 'rock-b-2', modelId: 'rockB', position: [10, -0.3, -10], rotation: [0, 0.65, 0.04], halfSize: MODEL_HALF_SIZE.rockB },
  { id: 'rock-b-3', modelId: 'rockB', position: [-18, -0.34, -12], rotation: [0, -1.05, -0.06], halfSize: MODEL_HALF_SIZE.rockB },
  { id: 'rock-b-4', modelId: 'rockB', position: [18, -0.42, -22], rotation: [0, 0.35, 0.03], halfSize: MODEL_HALF_SIZE.rockB },
  { id: 'rock-b-5', modelId: 'rockB', position: [-28, -0.44, -34], rotation: [0, 0.9, -0.02], halfSize: MODEL_HALF_SIZE.rockB },
  { id: 'rock-b-6', modelId: 'rockB', position: [22, -0.46, -44], rotation: [0, -0.3, 0.05], halfSize: MODEL_HALF_SIZE.rockB },
  { id: 'rock-c-1', modelId: 'rockC', position: [-15, -0.2, -5], rotation: [0, 0.2, 0], halfSize: MODEL_HALF_SIZE.rockC },
  { id: 'rock-c-2', modelId: 'rockC', position: [16, -0.32, -9], rotation: [0, -0.45, -0.05], halfSize: MODEL_HALF_SIZE.rockC },
  { id: 'rock-c-3', modelId: 'rockC', position: [-22, -0.4, -18], rotation: [0, 0.85, 0.06], halfSize: MODEL_HALF_SIZE.rockC },
  { id: 'rock-c-4', modelId: 'rockC', position: [24, -0.42, -25], rotation: [0, -1.2, -0.03], halfSize: MODEL_HALF_SIZE.rockC },
  { id: 'rock-c-5', modelId: 'rockC', position: [-32, -0.46, -42], rotation: [0, 0.5, 0.04], halfSize: MODEL_HALF_SIZE.rockC },
  { id: 'rock-c-6', modelId: 'rockC', position: [34, -0.48, -30], rotation: [0, -0.75, -0.04], halfSize: MODEL_HALF_SIZE.rockC },
  { id: 'coral-1', modelId: 'coral', position: [-4, -0.3, -8], rotation: [0, -0.35, 0], halfSize: MODEL_HALF_SIZE.coral },
  { id: 'coral-2', modelId: 'coral', position: [3, -0.3, -11], rotation: [0, 0.65, 0], halfSize: MODEL_HALF_SIZE.coral },
  { id: 'coral-3', modelId: 'coral', position: [-10, -0.34, -1], rotation: [0, -0.9, 0], halfSize: MODEL_HALF_SIZE.coral },
  { id: 'coral-4', modelId: 'coral', position: [11, -0.35, -3], rotation: [0, 1.1, 0], halfSize: MODEL_HALF_SIZE.coral },
  { id: 'coral-5', modelId: 'coral', position: [-20, -0.42, -8], rotation: [0, 0.25, 0], halfSize: MODEL_HALF_SIZE.coral },
  { id: 'coral-6', modelId: 'coral', position: [20, -0.42, -14], rotation: [0, -0.6, 0], halfSize: MODEL_HALF_SIZE.coral },
  { id: 'coral-7', modelId: 'coral', position: [-27, -0.44, -22], rotation: [0, 0.8, 0], halfSize: MODEL_HALF_SIZE.coral },
  { id: 'coral-8', modelId: 'coral', position: [29, -0.45, -20], rotation: [0, -1, 0], halfSize: MODEL_HALF_SIZE.coral },
  { id: 'coral-9', modelId: 'coral', position: [-34, -0.46, -32], rotation: [0, 0.45, 0], halfSize: MODEL_HALF_SIZE.coral },
  { id: 'coral-10', modelId: 'coral', position: [32, -0.46, -36], rotation: [0, -0.4, 0], halfSize: MODEL_HALF_SIZE.coral },
  { id: 'seaweed-1', modelId: 'seaweed', position: [-3.2, -0.28, -3], rotation: [0, -0.4, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-2', modelId: 'seaweed', position: [3.3, -0.3, -3], rotation: [0, 1.5, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-3', modelId: 'seaweed', position: [-6, -0.32, -7], rotation: [0, 3.4, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-4', modelId: 'seaweed', position: [5.5, -0.32, -9.5], rotation: [0, 5.3, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-5', modelId: 'seaweed', position: [-10, -0.36, -11], rotation: [0, 7.2, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-6', modelId: 'seaweed', position: [9, -0.36, -13], rotation: [0, 9.1, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-7', modelId: 'seaweed', position: [-18, -0.4, -15], rotation: [0, 11, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-8', modelId: 'seaweed', position: [17, -0.4, -18], rotation: [0, 12.9, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-9', modelId: 'seaweed', position: [-26, -0.43, -16], rotation: [0, 14.8, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-10', modelId: 'seaweed', position: [25, -0.43, -17], rotation: [0, 16.7, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-11', modelId: 'seaweed', position: [-30, -0.45, -27], rotation: [0, 18.6, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-12', modelId: 'seaweed', position: [30, -0.45, -27], rotation: [0, 20.5, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-13', modelId: 'seaweed', position: [-27, -0.46, -39], rotation: [0, 22.4, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-14', modelId: 'seaweed', position: [27, -0.46, -46], rotation: [0, 24.3, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'starfish', modelId: 'starfish', position: [-1.8, -0.36, -9], rotation: [0.03, -0.25, -0.08], halfSize: MODEL_HALF_SIZE.starfish },
  { id: 'skull', modelId: 'skull', position: [0.7, -0.26, -0.8], rotation: [0.08, -0.4, -0.32], halfSize: MODEL_HALF_SIZE.skull },
];

export function findMenuPlacementOverlaps(
  placements: readonly MenuGroundFootprint[],
): readonly (readonly [string, string])[] {
  const overlaps: Array<readonly [string, string]> = [];
  for (let first = 0; first < placements.length; first += 1) {
    for (let second = first + 1; second < placements.length; second += 1) {
      const a = placements[first]!;
      const b = placements[second]!;
      const separatedX = Math.abs(a.position[0] - b.position[0])
        >= a.halfSize[0] + b.halfSize[0];
      const separatedZ = Math.abs(a.position[2] - b.position[2])
        >= a.halfSize[1] + b.halfSize[1];
      if (!separatedX && !separatedZ) overlaps.push([a.id, b.id]);
    }
  }
  return overlaps;
}

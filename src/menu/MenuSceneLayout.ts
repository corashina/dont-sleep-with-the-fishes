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
  const [rotationX, rotationY, rotationZ] = spec.rotation;
  const cosineX = Math.cos(rotationX);
  const sineX = Math.sin(rotationX);
  const cosineY = Math.cos(rotationY);
  const sineY = Math.sin(rotationY);
  const cosineZ = Math.cos(rotationZ);
  const sineZ = Math.sin(rotationZ);
  let rotatedMinX = Infinity;
  let rotatedMinY = Infinity;
  let rotatedMinZ = Infinity;
  let rotatedMaxX = -Infinity;
  let rotatedMaxY = -Infinity;
  let rotatedMaxZ = -Infinity;
  let sourceRadius = 0;
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        const rotatedX = cosineY * cosineZ * x - cosineY * sineZ * y + sineY * z;
        const rotatedY = (sineX * sineY * cosineZ + cosineX * sineZ) * x
          + (cosineX * cosineZ - sineX * sineY * sineZ) * y
          - sineX * cosineY * z;
        const rotatedZ = (sineX * sineZ - cosineX * sineY * cosineZ) * x
          + (cosineX * sineY * sineZ + sineX * cosineZ) * y
          + cosineX * cosineY * z;
        rotatedMinX = Math.min(rotatedMinX, rotatedX);
        rotatedMinY = Math.min(rotatedMinY, rotatedY);
        rotatedMinZ = Math.min(rotatedMinZ, rotatedZ);
        rotatedMaxX = Math.max(rotatedMaxX, rotatedX);
        rotatedMaxY = Math.max(rotatedMaxY, rotatedY);
        rotatedMaxZ = Math.max(rotatedMaxZ, rotatedZ);
        sourceRadius = Math.max(
          sourceRadius,
          Math.hypot(rotatedX, rotatedY, rotatedZ),
        );
      }
    }
  }
  const sourceLongest = Math.max(
    rotatedMaxX - rotatedMinX,
    rotatedMaxY - rotatedMinY,
    rotatedMaxZ - rotatedMinZ,
  );
  const scale = spec.targetLongestDimension / sourceLongest;
  const radius = sourceRadius * scale;
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
  { id: 'rock-a-1', modelId: 'rockA', position: [-10, -0.1, -2], rotation: [0, 0.4, 0], halfSize: MODEL_HALF_SIZE.rockA },
  { id: 'rock-a-2', modelId: 'rockA', position: [10, -0.25, -4], rotation: [0, -0.8, 0.08], halfSize: MODEL_HALF_SIZE.rockA },
  { id: 'rock-a-3', modelId: 'rockA', position: [-12, -0.32, -14], rotation: [0, 1.1, -0.05], halfSize: MODEL_HALF_SIZE.rockA },
  { id: 'rock-a-4', modelId: 'rockA', position: [15, -0.4, -15], rotation: [0, 0.25, 0.04], halfSize: MODEL_HALF_SIZE.rockA },
  { id: 'rock-a-5', modelId: 'rockA', position: [-20, -0.45, -28], rotation: [0, -0.55, -0.03], halfSize: MODEL_HALF_SIZE.rockA },
  { id: 'rock-a-6', modelId: 'rockA', position: [20, -0.46, -32], rotation: [0, 0.72, 0.02], halfSize: MODEL_HALF_SIZE.rockA },
  { id: 'rock-b-1', modelId: 'rockB', position: [-28, -0.15, -8], rotation: [0, -0.7, 0], halfSize: MODEL_HALF_SIZE.rockB },
  { id: 'rock-b-2', modelId: 'rockB', position: [28, -0.3, -10], rotation: [0, 0.65, 0.04], halfSize: MODEL_HALF_SIZE.rockB },
  { id: 'rock-b-3', modelId: 'rockB', position: [-30, -0.34, -27], rotation: [0, -1.05, -0.06], halfSize: MODEL_HALF_SIZE.rockB },
  { id: 'rock-b-4', modelId: 'rockB', position: [30, -0.42, -29], rotation: [0, 0.35, 0.03], halfSize: MODEL_HALF_SIZE.rockB },
  { id: 'rock-b-5', modelId: 'rockB', position: [-24, -0.44, -46], rotation: [0, 0.9, -0.02], halfSize: MODEL_HALF_SIZE.rockB },
  { id: 'rock-b-6', modelId: 'rockB', position: [24, -0.46, -50], rotation: [0, -0.3, 0.05], halfSize: MODEL_HALF_SIZE.rockB },
  { id: 'rock-c-1', modelId: 'rockC', position: [-20, -0.2, -4], rotation: [0, 0.2, 0], halfSize: MODEL_HALF_SIZE.rockC },
  { id: 'rock-c-2', modelId: 'rockC', position: [20, -0.32, -6], rotation: [0, -0.45, -0.05], halfSize: MODEL_HALF_SIZE.rockC },
  { id: 'rock-c-3', modelId: 'rockC', position: [-24, -0.4, -18], rotation: [0, 0.85, 0.06], halfSize: MODEL_HALF_SIZE.rockC },
  { id: 'rock-c-4', modelId: 'rockC', position: [24, -0.42, -20], rotation: [0, -1.2, -0.03], halfSize: MODEL_HALF_SIZE.rockC },
  { id: 'rock-c-5', modelId: 'rockC', position: [-32, -0.46, -36], rotation: [0, 0.5, 0.04], halfSize: MODEL_HALF_SIZE.rockC },
  { id: 'rock-c-6', modelId: 'rockC', position: [34, -0.48, -44], rotation: [0, -0.75, -0.04], halfSize: MODEL_HALF_SIZE.rockC },
  { id: 'coral-1', modelId: 'coral', position: [-4, -0.3, -9], rotation: [0, -0.35, 0], halfSize: MODEL_HALF_SIZE.coral },
  { id: 'coral-2', modelId: 'coral', position: [4, -0.3, -10], rotation: [0, 0.65, 0], halfSize: MODEL_HALF_SIZE.coral },
  { id: 'coral-3', modelId: 'coral', position: [-11, -0.34, -22], rotation: [0, -0.9, 0], halfSize: MODEL_HALF_SIZE.coral },
  { id: 'coral-4', modelId: 'coral', position: [13, -0.35, -23], rotation: [0, 1.1, 0], halfSize: MODEL_HALF_SIZE.coral },
  { id: 'coral-5', modelId: 'coral', position: [-8, -0.42, -30], rotation: [0, 0.25, 0], halfSize: MODEL_HALF_SIZE.coral },
  { id: 'coral-6', modelId: 'coral', position: [8, -0.42, -34], rotation: [0, -0.6, 0], halfSize: MODEL_HALF_SIZE.coral },
  { id: 'coral-7', modelId: 'coral', position: [-14, -0.44, -40], rotation: [0, 0.8, 0], halfSize: MODEL_HALF_SIZE.coral },
  { id: 'coral-8', modelId: 'coral', position: [14, -0.45, -42], rotation: [0, -1, 0], halfSize: MODEL_HALF_SIZE.coral },
  { id: 'coral-9', modelId: 'coral', position: [-38, -0.46, -24], rotation: [0, 0.45, 0], halfSize: MODEL_HALF_SIZE.coral },
  { id: 'coral-10', modelId: 'coral', position: [40, -0.46, -26], rotation: [0, -0.4, 0], halfSize: MODEL_HALF_SIZE.coral },
  { id: 'seaweed-1', modelId: 'seaweed', position: [-4, -0.28, -1], rotation: [0, -0.4, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-2', modelId: 'seaweed', position: [4, -0.3, -1], rotation: [0, 1.5, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-3', modelId: 'seaweed', position: [-7, -0.32, -7], rotation: [0, 3.4, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-4', modelId: 'seaweed', position: [7, -0.32, -10], rotation: [0, 5.3, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-5', modelId: 'seaweed', position: [-6, -0.36, -13], rotation: [0, 7.2, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-6', modelId: 'seaweed', position: [12, -0.36, -10], rotation: [0, 9.1, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-7', modelId: 'seaweed', position: [-16, -0.4, -20], rotation: [0, 11, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-8', modelId: 'seaweed', position: [16, -0.4, -20], rotation: [0, 12.9, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-9', modelId: 'seaweed', position: [-13, -0.43, -27], rotation: [0, 14.8, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-10', modelId: 'seaweed', position: [13, -0.43, -29], rotation: [0, 16.7, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-11', modelId: 'seaweed', position: [-10, -0.45, -36], rotation: [0, 18.6, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-12', modelId: 'seaweed', position: [10, -0.45, -38], rotation: [0, 20.5, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-13', modelId: 'seaweed', position: [-20, -0.46, -40], rotation: [0, 22.4, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'seaweed-14', modelId: 'seaweed', position: [20, -0.46, -45], rotation: [0, 24.3, 0], halfSize: MODEL_HALF_SIZE.seaweed },
  { id: 'starfish', modelId: 'starfish', position: [-2, -0.36, -13], rotation: [0.03, -0.25, -0.08], halfSize: MODEL_HALF_SIZE.starfish },
  { id: 'skull', modelId: 'skull', position: [0.7, -0.26, -0.8], rotation: [0.08, -0.4, -0.32], halfSize: MODEL_HALF_SIZE.skull },
];

export const MENU_STATIC_FOOTPRINTS: readonly MenuGroundFootprint[] = [
  ...MENU_PROTECTED_FOOTPRINTS,
  ...MENU_MODEL_PLACEMENTS,
];

export function findClearMenuX(
  initialX: number,
  z: number,
  halfX: number,
  halfZ: number,
  clearance: number,
  extraFootprints: readonly MenuGroundFootprint[] = [],
): number {
  let x = initialX;
  const direction = initialX < 0 ? -1 : 1;
  const maximumPasses = MENU_STATIC_FOOTPRINTS.length + extraFootprints.length;
  for (let pass = 0; pass < maximumPasses; pass += 1) {
    let moved = false;
    for (const footprints of [MENU_STATIC_FOOTPRINTS, extraFootprints]) {
      for (const footprint of footprints) {
        const overlapsX = x - halfX < footprint.position[0] + footprint.halfSize[0]
          && x + halfX > footprint.position[0] - footprint.halfSize[0];
        const overlapsZ = z - halfZ < footprint.position[2] + footprint.halfSize[1]
          && z + halfZ > footprint.position[2] - footprint.halfSize[1];
        if (!overlapsX || !overlapsZ) continue;
        x = direction < 0
          ? footprint.position[0] - footprint.halfSize[0] - halfX - clearance
          : footprint.position[0] + footprint.halfSize[0] + halfX + clearance;
        moved = true;
        break;
      }
      if (moved) break;
    }
    if (!moved) break;
  }
  return x;
}

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

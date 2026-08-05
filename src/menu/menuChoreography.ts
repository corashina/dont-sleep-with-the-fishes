export const MENU_FADE_SECONDS = 0.7;

export interface MenuPathPose {
  readonly position: [number, number, number];
  readonly tangent: [number, number, number];
}

export interface MenuMotionSample {
  readonly sharks: readonly [MenuPathPose, MenuPathPose];
  readonly fishSchools: readonly [MenuPathPose, MenuPathPose];
  plantTime: number;
  bubbleTime: number;
  matterTime: number;
  causticStrength: number;
}

interface EllipsePath {
  readonly center: readonly [number, number, number];
  readonly radiusX: number;
  readonly radiusZ: number;
  readonly period: number;
  readonly phase: number;
}

const SHARK_PATHS = [
  { center: [0, 3.4, -10] as const, radiusX: 9.5, radiusZ: 4.2, period: 24, phase: 0 },
  { center: [1.5, 4.6, -14] as const, radiusX: 12, radiusZ: 5.5, period: 31, phase: Math.PI },
] as const satisfies readonly [EllipsePath, EllipsePath];

const FISH_PATHS = [
  { center: [-2.5, 2.3, -5.5] as const, radiusX: 3.4, radiusZ: 1.8, period: 18, phase: 0.8 },
  { center: [3.2, 1.7, -7.5] as const, radiusX: 4.6, radiusZ: 2.2, period: 22, phase: 3.4 },
] as const satisfies readonly [EllipsePath, EllipsePath];

export function createMenuMotionSample(): MenuMotionSample {
  return {
    sharks: [createPathPose(), createPathPose()],
    fishSchools: [createPathPose(), createPathPose()],
    plantTime: 0,
    bubbleTime: 0,
    matterTime: 0,
    causticStrength: 0.86,
  };
}

export function sampleMenuMotionInto(
  sample: MenuMotionSample,
  elapsedSeconds: number,
): MenuMotionSample {
  samplePathInto(sample.sharks[0], SHARK_PATHS[0], elapsedSeconds);
  samplePathInto(sample.sharks[1], SHARK_PATHS[1], elapsedSeconds);
  samplePathInto(sample.fishSchools[0], FISH_PATHS[0], elapsedSeconds);
  samplePathInto(sample.fishSchools[1], FISH_PATHS[1], elapsedSeconds);

  sample.plantTime = elapsedSeconds;
  sample.bubbleTime = elapsedSeconds;
  sample.matterTime = elapsedSeconds;
  sample.causticStrength = 0.86 + 0.14 * Math.sin(elapsedSeconds * 0.2);

  return sample;
}

export function sampleMenuFade(elapsedSeconds: number): number {
  const progress = Math.min(Math.max(elapsedSeconds / MENU_FADE_SECONDS, 0), 1);
  return progress * progress * (3 - 2 * progress);
}

function createPathPose(): MenuPathPose {
  return {
    position: [0, 0, 0],
    tangent: [0, 0, 0],
  };
}

function samplePathInto(
  pose: MenuPathPose,
  path: EllipsePath,
  elapsedSeconds: number,
): void {
  const angle = (elapsedSeconds % path.period) / path.period * (Math.PI * 2)
    + path.phase;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);

  pose.position[0] = path.center[0] + path.radiusX * cosine;
  pose.position[1] = path.center[1];
  pose.position[2] = path.center[2] + path.radiusZ * sine;
  pose.tangent[0] = -path.radiusX * sine;
  pose.tangent[1] = 0;
  pose.tangent[2] = path.radiusZ * cosine;
}

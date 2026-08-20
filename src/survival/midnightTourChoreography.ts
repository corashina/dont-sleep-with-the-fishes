import { clamp01 } from './animationMath';

export const CHEST_SEARCH_END_SECONDS = 3;
export const CHEST_DIG_END_SECONDS = 9;
export const CHEST_RESULT_DURATION_SECONDS = 12;
export const CHEST_STROKE_SECONDS = 2;

const CHEST_DIG_DURATION_SECONDS = CHEST_DIG_END_SECONDS
  - CHEST_SEARCH_END_SECONDS;
const CHEST_HOLD_DURATION_SECONDS = CHEST_RESULT_DURATION_SECONDS
  - CHEST_DIG_END_SECONDS;

export type MidnightChestStageSample =
  | Readonly<{ stage: 'search'; progress: number }>
  | Readonly<{
    stage: 'dig';
    progress: number;
    stroke: number;
    strokeProgress: number;
  }>
  | Readonly<{ stage: 'hold'; progress: number }>;

export function chestDigProgress(elapsedSeconds: number): number {
  return clamp01(
    (elapsedSeconds - CHEST_SEARCH_END_SECONDS) / CHEST_DIG_DURATION_SECONDS,
  );
}

export function chestStrokeProgress(elapsedSeconds: number): number {
  const digElapsed = Math.max(0, elapsedSeconds - CHEST_SEARCH_END_SECONDS);
  return clamp01((digElapsed % CHEST_STROKE_SECONDS) / CHEST_STROKE_SECONDS);
}

export function chestCompletedStrokes(elapsedSeconds: number): number {
  return Math.min(3, Math.floor(
    Math.max(0, elapsedSeconds - CHEST_SEARCH_END_SECONDS)
      / CHEST_STROKE_SECONDS,
  ));
}

export function sampleChestStage(
  elapsedSeconds: number,
): MidnightChestStageSample {
  if (elapsedSeconds < CHEST_SEARCH_END_SECONDS) {
    return {
      stage: 'search',
      progress: clamp01(elapsedSeconds / CHEST_SEARCH_END_SECONDS),
    };
  }
  if (elapsedSeconds < CHEST_DIG_END_SECONDS) {
    return {
      stage: 'dig',
      progress: chestDigProgress(elapsedSeconds),
      stroke: Math.min(3, chestCompletedStrokes(elapsedSeconds) + 1),
      strokeProgress: chestStrokeProgress(elapsedSeconds),
    };
  }
  return {
    stage: 'hold',
    progress: clamp01(
      (elapsedSeconds - CHEST_DIG_END_SECONDS) / CHEST_HOLD_DURATION_SECONDS,
    ),
  };
}

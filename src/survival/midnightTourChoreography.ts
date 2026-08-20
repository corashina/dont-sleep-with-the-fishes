import { clamp01 } from './animationMath';

export const CHEST_SEARCH_END_SECONDS = 3;
export const CHEST_DIG_END_SECONDS = 9;
export const CHEST_RESULT_DURATION_SECONDS = 12;
export const CHEST_STROKE_SECONDS = 2;
export const MONSTER_HEAR_END_SECONDS = 2;
export const MONSTER_TURN_END_SECONDS = 4.5;
export const MONSTER_RUN_END_SECONDS = 8.5;
export const MONSTER_ATTACK_END_SECONDS = 9.5;
export const MONSTER_RESULT_DURATION_SECONDS = 11;

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

export type MidnightMonsterStageSample = Readonly<{
  stage: 'hear' | 'turn' | 'run' | 'attack' | 'collapse';
  progress: number;
}>;

function clampMonsterElapsed(elapsedSeconds: number): number {
  return Math.min(
    MONSTER_RESULT_DURATION_SECONDS,
    Math.max(0, elapsedSeconds),
  );
}

function progressBetween(
  elapsedSeconds: number,
  startSeconds: number,
  endSeconds: number,
): number {
  return clamp01(
    (clampMonsterElapsed(elapsedSeconds) - startSeconds)
      / (endSeconds - startSeconds),
  );
}

export function monsterHearProgress(elapsedSeconds: number): number {
  return progressBetween(elapsedSeconds, 0, MONSTER_HEAR_END_SECONDS);
}

export function monsterTurnProgress(elapsedSeconds: number): number {
  return progressBetween(
    elapsedSeconds,
    MONSTER_HEAR_END_SECONDS,
    MONSTER_TURN_END_SECONDS,
  );
}

export function monsterRunProgress(elapsedSeconds: number): number {
  return progressBetween(
    elapsedSeconds,
    MONSTER_TURN_END_SECONDS,
    MONSTER_RUN_END_SECONDS,
  );
}

export function monsterAttackProgress(elapsedSeconds: number): number {
  return progressBetween(
    elapsedSeconds,
    MONSTER_RUN_END_SECONDS,
    MONSTER_ATTACK_END_SECONDS,
  );
}

export function monsterCollapseProgress(elapsedSeconds: number): number {
  return progressBetween(
    elapsedSeconds,
    MONSTER_ATTACK_END_SECONDS,
    MONSTER_RESULT_DURATION_SECONDS,
  );
}

export function sampleMonsterStage(
  elapsedSeconds: number,
): MidnightMonsterStageSample {
  const elapsed = clampMonsterElapsed(elapsedSeconds);
  if (elapsed < MONSTER_HEAR_END_SECONDS) {
    return { stage: 'hear', progress: monsterHearProgress(elapsed) };
  }
  if (elapsed < MONSTER_TURN_END_SECONDS) {
    return { stage: 'turn', progress: monsterTurnProgress(elapsed) };
  }
  if (elapsed < MONSTER_RUN_END_SECONDS) {
    return { stage: 'run', progress: monsterRunProgress(elapsed) };
  }
  if (elapsed < MONSTER_ATTACK_END_SECONDS) {
    return { stage: 'attack', progress: monsterAttackProgress(elapsed) };
  }
  return { stage: 'collapse', progress: monsterCollapseProgress(elapsed) };
}

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

import { clamp01 } from './animationMath';

export const CHEST_SEARCH_END_SECONDS = 3;
export const CHEST_DIG_END_SECONDS = 9;
export const CHEST_RESULT_DURATION_SECONDS = 12;
export const CHEST_STROKE_SECONDS = 2;
export const MONSTER_SCAN_LEFT_END_SECONDS = 1.6;
export const MONSTER_SCAN_RIGHT_END_SECONDS = 3.2;
export const MONSTER_TURN_BACK_END_SECONDS = 4.4;
export const MONSTER_IMPACT_SECONDS = 5.4;
export const MONSTER_ATTACK_END_SECONDS = 5.8;
export const MONSTER_RESULT_DURATION_SECONDS = MONSTER_IMPACT_SECONDS;

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

export function monsterScanLeftProgress(elapsedSeconds: number): number {
  return progressBetween(elapsedSeconds, 0, MONSTER_SCAN_LEFT_END_SECONDS);
}

export function monsterScanRightProgress(elapsedSeconds: number): number {
  return progressBetween(
    elapsedSeconds,
    MONSTER_SCAN_LEFT_END_SECONDS,
    MONSTER_SCAN_RIGHT_END_SECONDS,
  );
}

export function monsterTurnBackProgress(elapsedSeconds: number): number {
  return progressBetween(
    elapsedSeconds,
    MONSTER_SCAN_RIGHT_END_SECONDS,
    MONSTER_TURN_BACK_END_SECONDS,
  );
}

export function monsterAttackProgress(elapsedSeconds: number): number {
  return progressBetween(
    elapsedSeconds,
    MONSTER_TURN_BACK_END_SECONDS,
    MONSTER_ATTACK_END_SECONDS,
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

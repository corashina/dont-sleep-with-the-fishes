import { clamp01, smoothstepUnchecked as smoothstep } from './animationMath';

export const CHEST_SEARCH_END_SECONDS = 3;
export const CHEST_DIG_END_SECONDS = 9;
export const CHEST_RESULT_DURATION_SECONDS = 12;
export const CHEST_STROKE_SECONDS = 2;
export const SHOVEL_CONTACT_PHASE = 0.38;
export const SHOVEL_THROW_PHASE = 0.82;
export const MONSTER_SCAN_LEFT_END_SECONDS = 1.6;
export const MONSTER_SCAN_RIGHT_END_SECONDS = 3.2;
export const MONSTER_TURN_BACK_END_SECONDS = 4.4;
export const MONSTER_BITE_START_SECONDS = MONSTER_TURN_BACK_END_SECONDS;
export const MONSTER_IMPACT_SECONDS = MONSTER_BITE_START_SECONDS + 0.18;
export const MONSTER_RESULT_DURATION_SECONDS = MONSTER_IMPACT_SECONDS + 0.14;
// The authored bite reaches full extension at 45% of Idle_Attack.
export const MONSTER_HIT_CLIP_PHASE = 0.45;

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

export interface ShovelStrokePose {
  x: number;
  y: number;
  z: number;
  pitch: number;
  roll: number;
  yaw: number;
  impact: number;
  excavation: number;
  deposit: number;
  contacts: number;
  phase: number;
}

// Blade-tip position, then handle pitch and roll. Each stroke returns to the carry pose.
const SHOVEL_POSES = [
  [0, 0.55, 0.45, 0.65, 0.25, -0.45],
  [0.2, 0.4, 0.65, 0.48, 0.3, -0.58],
  [SHOVEL_CONTACT_PHASE, 0.28, -0.06, 0.22, 0.5, -0.52],
  [0.45, 0.28, -0.06, 0.22, 0.5, -0.52],
  [0.58, 0.27, -0.015, 0.19, 0.9, -0.8],
  [0.72, 0.2, 0.36, 0.15, 0.45, -0.9],
  [SHOVEL_THROW_PHASE, -0.18, 0.58, 0, 0.2, -0.95],
  [1, 0.55, 0.45, 0.65, 0.25, -0.45],
] as const;

export function sampleShovelStroke(elapsedSeconds: number, pose: ShovelStrokePose): void {
  const digTime = Math.max(0, Math.min(6, elapsedSeconds - CHEST_SEARCH_END_SECONDS));
  const strokeIndex = Math.min(2, Math.floor(digTime / CHEST_STROKE_SECONDS));
  const phase = (digTime - strokeIndex * CHEST_STROKE_SECONDS) / CHEST_STROKE_SECONDS;
  let segment = 0;
  while (segment < SHOVEL_POSES.length - 2 && phase > SHOVEL_POSES[segment + 1]![0]) segment += 1;
  const from = SHOVEL_POSES[segment]!;
  const to = SHOVEL_POSES[segment + 1]!;
  const blend = smoothstep(clamp01((phase - from[0]) / (to[0] - from[0])));
  const variation = (strokeIndex - 1) * Math.sin(phase * Math.PI);
  pose.x = from[1] + (to[1] - from[1]) * blend + variation * 0.045;
  pose.y = from[2] + (to[2] - from[2]) * blend;
  pose.z = from[3] + (to[3] - from[3]) * blend + variation * 0.025;
  pose.pitch = from[4] + (to[4] - from[4]) * blend;
  pose.roll = from[5] + (to[5] - from[5]) * blend;
  pose.yaw = variation * 0.08;
  pose.phase = phase;
  pose.impact = Math.sin(clamp01((phase - SHOVEL_CONTACT_PHASE) / 0.12) * Math.PI);
  pose.excavation = (strokeIndex + smoothstep(clamp01((phase - 0.45) / 0.27))) / 3;
  pose.deposit = (strokeIndex + smoothstep(clamp01((phase - SHOVEL_THROW_PHASE) / (1 - SHOVEL_THROW_PHASE)))) / 3;
  pose.contacts = strokeIndex + (phase >= SHOVEL_CONTACT_PHASE ? 1 : 0);
}

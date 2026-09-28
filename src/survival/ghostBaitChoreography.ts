import { clamp01, pulse, smoothstep } from './animationMath';

export const GHOST_BAIT_REACTION_DURATION = 7;
export const GHOST_BAIT_TURN_CUE = 0.18;
export const GHOST_BAIT_RUSH_CUE = 0.44;
const HALT_START = 0.04;
const HALT_SPAN = 0.16;
const TURN_SPAN = 0.16;
const TURN_STAGGER = 0.015;
const RUSH_SPAN = 0.3;
const RUSH_STAGGER = 0.04;
// Rush progress where a ghost reaches the player.
export const GHOST_BAIT_PASS = 0.75;
// Small offsets keep the ghosts in a stream through the player, not in one point.
export const GHOST_BAIT_PASS_OFFSETS: readonly (readonly [number, number])[] = Object.freeze([
  Object.freeze([-0.32, 0.12] as const),
  Object.freeze([0.36, -0.08] as const),
  Object.freeze([-0.12, -0.2] as const),
  Object.freeze([0.18, 0.22] as const),
  Object.freeze([0, 0] as const),
]);

export interface GhostBaitRush {
  // Travel from the ghost to contact with the player (0 to 1).
  travel: number;
  opacity: number;
}

export function ghostBaitDriftRate(progress: number): number {
  return 1 - smoothstep((progress - HALT_START) / HALT_SPAN);
}

export function ghostBaitTurn(progress: number, index: number): number {
  return smoothstep((progress - GHOST_BAIT_TURN_CUE - index * TURN_STAGGER) / TURN_SPAN);
}

export function ghostBaitRushProgress(progress: number, index: number): number {
  return clamp01((progress - GHOST_BAIT_RUSH_CUE - index * RUSH_STAGGER) / RUSH_SPAN);
}

export function ghostBaitPassProgress(index: number): number {
  return GHOST_BAIT_RUSH_CUE + index * RUSH_STAGGER + GHOST_BAIT_PASS * RUSH_SPAN;
}

// The ghost accelerates to the player and disappears at contact.
export function sampleGhostBaitRush(output: GhostBaitRush, progress: number, index: number): GhostBaitRush {
  const rush = ghostBaitRushProgress(progress, index);
  const approach = Math.min(1, rush / GHOST_BAIT_PASS);
  output.travel = approach * approach;
  output.opacity = progress < ghostBaitPassProgress(index) ? 1 : 0;
  return output;
}

export interface GhostBaitCamera {
  yaw: number;
  pitch: number;
}

export function sampleGhostBaitCamera(output: GhostBaitCamera, progress: number, ghostCount: number): GhostBaitCamera {
  const stare = smoothstep((progress - GHOST_BAIT_TURN_CUE) / 0.24)
    * (1 - smoothstep((progress - ghostBaitPassProgress(0)) / 0.04));
  output.yaw = 0;
  output.pitch = 0.03 * stare;
  for (let index = 0; index < ghostCount; index += 1) {
    const pass = ghostBaitPassProgress(index);
    const jolt = pulse(progress, pass - 0.012, pass + 0.004, pass + 0.05);
    output.yaw += (index % 2 === 0 ? 0.07 : -0.07) * jolt;
    output.pitch -= 0.05 * jolt;
  }
  const settle = 1 - smoothstep((progress - 0.9) / 0.1);
  output.yaw *= settle;
  output.pitch *= settle;
  return output;
}

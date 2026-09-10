import { pulse, smoothstep } from '../animationMath';

export const UNDER_US_REVEAL_SECONDS = 6;
export const UNDER_US_REACTION_SECONDS = 3.5;

export interface UnderUsPose {
  x: number;
  z: number;
  opacity: number;
  light: number;
  lift: number;
  roll: number;
}

export function createUnderUsPose(): UnderUsPose {
  return { x: -16, z: -7, opacity: 0, light: 0, lift: 0, roll: 0 };
}

export function sampleUnderUsReveal(progress: number, pose: UnderUsPose): void {
  const approach = smoothstep(progress / 0.72);
  // It turns toward the lantern before the player can choose the flashlight.
  const twitch = pulse(progress, 0.7, 0.8, 0.94);
  pose.x = -16 + 16 * approach + 0.65 * twitch;
  pose.z = -7 + 7 * approach;
  pose.opacity = 0.78 * smoothstep(progress / 0.34);
  pose.light = 0.16 * twitch;
  pose.lift = 0.19 * smoothstep((progress - 0.5) / 0.35);
  pose.roll = -0.018 * twitch;
}

export function sampleUnderUsReaction(choice: string, progress: number, pose: UnderUsPose): void {
  const leave = smoothstep((progress - 0.15) / 0.85);
  const impact = choice === 'flashlight' ? pulse(progress, 0.03, 0.18, 0.5) : 0;
  pose.x = choice === 'baitTin' || choice === 'cannedFood' ? 13 * leave : -5 * leave;
  pose.z = -6 * leave;
  pose.opacity = 0.78 * (1 - leave);
  pose.light = choice === 'flashlight' ? 1 - smoothstep(progress / 0.52) : 0;
  pose.lift = 0.19 * (1 - leave) + 0.13 * impact;
  pose.roll = 0.075 * impact;
}

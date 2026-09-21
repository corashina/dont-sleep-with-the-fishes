import { pulse, smoothstep } from '../animationMath';

export const UNDER_US_REVEAL_SECONDS = 6;
export const UNDER_US_REACTION_SECONDS = 3.5;
export const UNDER_US_ORBIT_RADIUS = 12;
export const UNDER_US_ORBIT_SPEED = 0.16;
const UNDER_US_OPACITY = 0.88;

export interface UnderUsPose {
  radius: number;
  opacity: number;
  lift: number;
  roll: number;
}

export function createUnderUsPose(): UnderUsPose {
  return { radius: UNDER_US_ORBIT_RADIUS, opacity: UNDER_US_OPACITY, lift: 0, roll: 0 };
}

export function sampleUnderUsReveal(progress: number, pose: UnderUsPose): void {
  // Its wake nudges the boat as it settles into a circling path.
  const twitch = pulse(progress, 0.7, 0.8, 0.94);
  pose.radius = UNDER_US_ORBIT_RADIUS;
  pose.opacity = UNDER_US_OPACITY;
  pose.lift = 0.19 * smoothstep((progress - 0.5) / 0.35);
  pose.roll = -0.018 * twitch;
}

export function sampleUnderUsReaction(choice: string, progress: number, pose: UnderUsPose): void {
  const leave = smoothstep((progress - 0.15) / 0.85);
  pose.radius = UNDER_US_ORBIT_RADIUS + (choice === 'sleep' ? 8 : 14) * leave;
  pose.opacity = UNDER_US_OPACITY * (1 - smoothstep((progress - 0.75) / 0.25));
  pose.lift = 0.19 * (1 - leave);
  pose.roll = 0;
}

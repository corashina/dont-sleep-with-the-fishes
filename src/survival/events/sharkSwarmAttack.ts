import { clamp01, pulse, smoothstep } from '../animationMath';
import type { SwarmSharkPose } from './sharkSwarmChoreography';

export const SWARM_BREACH_DURATION = 1.8;
export const SWARM_BITE_CLIP_PROGRESS = 0.16;

interface AttackPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Sample the mouth's path. Hold the final bite until the screen cuts to black. */
export function sampleSwarmBreach(
  progress: number,
  start: AttackPoint,
  launch: AttackPoint,
  player: AttackPoint,
  pose: SwarmSharkPose,
): void {
  const progress01 = clamp01(progress);
  const dx = player.x - launch.x;
  const dz = player.z - launch.z;
  const distance = Math.hypot(dx, dz);
  pose.breach = 1;
  pose.yaw = Math.atan2(dx, dz);
  pose.roll = 0;
  pose.biteWeight = 1;
  pose.biteProgress = SWARM_BITE_CLIP_PROGRESS;
  if (progress01 < 0.2) {
    const approach = smoothstep(progress01 / 0.2);
    pose.x = start.x + (launch.x - start.x) * approach;
    pose.z = start.z + (launch.z - start.z) * approach;
    pose.y = start.y + (launch.y - start.y) * approach - Math.sin(Math.PI * approach) * 0.6;
    pose.pitch = 0;
    return;
  }

  const t = clamp01((progress01 - 0.2) / 0.8);
  const travel = t * t * (2 - t);
  const rise = player.y - launch.y;
  const arcHeight = 1.4;
  pose.x = launch.x + dx * travel;
  pose.z = launch.z + dz * travel;
  pose.y = launch.y + rise * travel + 4 * arcHeight * travel * (1 - travel);
  const slope = rise + 4 * arcHeight * (1 - 2 * travel);
  pose.pitch = -Math.atan2(slope, distance) * smoothstep(t / 0.12);
  pose.impact = pulse(t, 0.91, 0.975, 1);
  pose.splash = pulse(t, 0, 0.08, 0.22);
}

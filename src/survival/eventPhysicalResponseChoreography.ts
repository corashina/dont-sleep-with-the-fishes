import { clamp01, pulse, smoothstep } from './animationMath';
import type { ItemCondition } from './survivalTypes';
import { resetTransformPose, type MutableTransformPose } from './transformPose';

export interface EventPhysicalResponseDescriptor {
  readonly choiceId: string;
  readonly condition: ItemCondition;
}

export interface EventPhysicalResponsePose extends MutableTransformPose {}

function resetPose(output: EventPhysicalResponsePose): void {
  resetTransformPose(output);
}

export function sampleEventPhysicalResponsePose(
  eventId: string,
  response: EventPhysicalResponseDescriptor | undefined,
  progress: number,
  output: EventPhysicalResponsePose,
): boolean {
  resetPose(output);
  if (response?.condition !== 'broken') return false;

  const t = clamp01(progress);
  if (eventId === 'eerie-melody' && response.choiceId === 'bucket') {
    const fall = smoothstep((t - 0.08) / 0.56);
    const impact = pulse(t, 0.3, 0.54, 0.78);
    output.y = -0.44 * fall + 0.06 * impact;
    output.z = 0.18 * fall;
    output.yaw = -0.25 * fall;
    output.pitch = 0.36 * fall;
    output.roll = 1.08 * fall + 0.14 * impact;
    output.scaleY = 1 - 0.18 * fall;
    return true;
  }

  if (eventId === 'face-on-the-moon' && response.choiceId === 'spyglass') {
    const snap = pulse(t, 0.02, 0.2, 0.62);
    const recoil = pulse(t, 0.18, 0.42, 0.82);
    output.y = -0.22 * snap - 0.06 * recoil;
    output.z = 0.62 * snap + 0.16 * recoil;
    output.pitch = 0.68 * snap + 0.18 * recoil;
    output.roll = -0.22 * snap + 0.12 * recoil;
    return true;
  }

  return false;
}

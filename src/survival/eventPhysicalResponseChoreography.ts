import { clamp01, pulse } from './animationMath';
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

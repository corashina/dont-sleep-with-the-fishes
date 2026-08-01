export type ScavengeHandLocomotion = 'idle' | 'walk' | 'sprint' | 'steady';
export type ScavengeHandGesture = 'pickup' | 'ground-drop' | 'boat-deposit';

export interface MutableHandPose {
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
  roll: number;
  curl: number;
}

export interface MutableScavengeHandPose {
  readonly left: MutableHandPose;
  readonly right: MutableHandPose;
}

export interface ScavengeHandAnimationFrame {
  readonly locomotion: ScavengeHandLocomotion;
  readonly idleSeconds: number;
  readonly locomotionPhase: number;
  readonly gesture: ScavengeHandGesture | null;
  readonly gestureSeconds: number;
}

export const HAND_GESTURE_DURATIONS = Object.freeze({
  pickup: 0.55,
  'ground-drop': 0.5,
  'boat-deposit': 0.62,
});

const LEFT_BASE = [-0.24, -0.56, -0.68, 0.34, -0.18, -0.14, 0.12] as const;
const RIGHT_BASE = [0.23, -0.57, -0.68, 0.34, 0.18, 0.14, 0.1] as const;

const IDLE_ACTIVE_SECONDS = 2.4;
const IDLE_CYCLE_SECONDS = 6;

function smoothstep(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function resetHand(hand: MutableHandPose, base: readonly number[]): void {
  hand.x = base[0]!;
  hand.y = base[1]!;
  hand.z = base[2]!;
  hand.pitch = base[3]!;
  hand.yaw = base[4]!;
  hand.roll = base[5]!;
  hand.curl = base[6]!;
}

function applySwing(
  output: MutableScavengeHandPose,
  swing: number,
  reach: number,
  rise: number,
  pitch: number,
  curl: number,
): void {
  const lift = Math.abs(swing);
  output.left.z -= reach * swing;
  output.right.z += reach * swing;
  output.left.y += rise * lift;
  output.right.y += rise * lift;
  output.left.pitch -= pitch * swing;
  output.right.pitch += pitch * swing;
  output.left.curl += curl * lift;
  output.right.curl += curl * lift;
}

function sampleGestureTravel(progress: number): number {
  if (progress <= 0.12) {
    return -0.04 * smoothstep(progress / 0.12);
  }
  if (progress <= 0.52) {
    return -0.04 + 1.04 * smoothstep((progress - 0.12) / 0.4);
  }
  if (progress <= 0.68) {
    return 1;
  }
  return 1 - smoothstep((progress - 0.68) / 0.32);
}

function samplePickupCurl(base: number, progress: number): number {
  if (progress <= 0.52) {
    return base + (0.82 - base) * smoothstep(progress / 0.52);
  }
  if (progress <= 0.68) {
    return 0.82;
  }
  return base + (0.82 - base) * (1 - smoothstep((progress - 0.68) / 0.32));
}

function sampleDropCurl(base: number, progress: number): number {
  if (progress <= 0.12) {
    return base + (0.55 - base) * smoothstep(progress / 0.12);
  }
  if (progress <= 0.52) {
    return 0.55 * (1 - smoothstep((progress - 0.12) / 0.4));
  }
  if (progress <= 0.68) {
    return 0;
  }
  return base * smoothstep((progress - 0.68) / 0.32);
}

export function createScavengeHandPose(): MutableScavengeHandPose {
  return {
    left: {
      x: LEFT_BASE[0], y: LEFT_BASE[1], z: LEFT_BASE[2],
      pitch: LEFT_BASE[3], yaw: LEFT_BASE[4], roll: LEFT_BASE[5], curl: LEFT_BASE[6],
    },
    right: {
      x: RIGHT_BASE[0], y: RIGHT_BASE[1], z: RIGHT_BASE[2],
      pitch: RIGHT_BASE[3], yaw: RIGHT_BASE[4], roll: RIGHT_BASE[5], curl: RIGHT_BASE[6],
    },
  };
}

export function sampleScavengeHandPoseInto(
  output: MutableScavengeHandPose,
  frame: ScavengeHandAnimationFrame,
): MutableScavengeHandPose {
  resetHand(output.left, LEFT_BASE);
  resetHand(output.right, RIGHT_BASE);

  if (frame.locomotion === 'walk' || frame.locomotion === 'sprint') {
    const swing = Math.sin(frame.locomotionPhase * Math.PI * 2);
    if (frame.locomotion === 'walk') {
      applySwing(output, swing, 0.07, 0.025, 0.12, 0.16);
    } else {
      applySwing(output, swing, 0.12, 0.05, 0.22, 0.3);
    }
  } else if (frame.locomotion === 'steady') {
    output.left.y -= 0.03;
    output.right.y -= 0.03;
    output.left.curl += 0.18;
    output.right.curl += 0.18;
  } else {
    const cycleSeconds = frame.idleSeconds % IDLE_CYCLE_SECONDS;
    if (cycleSeconds >= 0 && cycleSeconds < IDLE_ACTIVE_SECONDS) {
      const idle = Math.sin(cycleSeconds / IDLE_ACTIVE_SECONDS * Math.PI);
      output.left.y += 0.006 * idle;
      output.right.y += 0.006 * idle;
      output.left.z -= 0.012 * idle;
      output.right.z -= 0.012 * idle;
    }
  }

  if (frame.gesture === null) {
    return output;
  }

  const duration = HAND_GESTURE_DURATIONS[frame.gesture];
  const progress = Math.min(1, Math.max(0, frame.gestureSeconds / duration));
  const travel = sampleGestureTravel(progress);
  const reach = frame.gesture === 'boat-deposit' ? 0.32 : 0.28;
  const rise = frame.gesture === 'pickup'
    ? 0.12
    : frame.gesture === 'ground-drop'
      ? 0.09
      : 0.03;

  output.left.x += 0.07 * travel;
  output.right.x -= 0.07 * travel;
  output.left.y += rise * travel;
  output.right.y += rise * travel;
  output.left.z -= reach * travel;
  output.right.z -= reach * travel;

  if (frame.gesture === 'pickup') {
    output.left.curl = samplePickupCurl(output.left.curl, progress);
    output.right.curl = samplePickupCurl(output.right.curl, progress);
  } else {
    output.left.curl = sampleDropCurl(output.left.curl, progress);
    output.right.curl = sampleDropCurl(output.right.curl, progress);
  }

  return output;
}

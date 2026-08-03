import type { CaptainWhiskersSnapshot } from './CaptainWhiskersState';

export type CaptainWhiskersPoseState =
  | 'sick'
  | 'starving'
  | 'hungry'
  | 'unhappy'
  | 'healthy';

export type CaptainWhiskersAction = 'pet' | 'feed';

export interface MutableCaptainWhiskersPose {
  bodyPitch: number;
  bodyYaw: number;
  bodyLift: number;
  headPitch: number;
  headYaw: number;
  actionLean: number;
  handReach: number;
  foodReach: number;
}

export interface CaptainWhiskersPoseSample {
  status: CaptainWhiskersPoseState;
  action: CaptainWhiskersAction | null;
  elapsed: number;
  duration: number;
}

export function createCaptainWhiskersPose(): MutableCaptainWhiskersPose {
  return {
    bodyPitch: 0,
    bodyYaw: 0,
    bodyLift: 0,
    headPitch: 0,
    headYaw: 0,
    actionLean: 0,
    handReach: 0,
    foodReach: 0,
  };
}

export function captainWhiskersPoseState(
  snapshot: CaptainWhiskersSnapshot,
): CaptainWhiskersPoseState {
  if (snapshot.sickness > 0) return 'sick';
  if (snapshot.hunger <= 1) return 'starving';
  if (snapshot.unhappiness >= 3) return 'unhappy';
  if (snapshot.hunger <= 3) return 'hungry';
  return 'healthy';
}

export function sampleCaptainWhiskersPoseInto(
  output: MutableCaptainWhiskersPose,
  sample: CaptainWhiskersPoseSample,
): MutableCaptainWhiskersPose {
  setBasePose(output, sample.status);
  if (sample.action === null || sample.duration <= 0) return output;

  const progress = clamp01(sample.elapsed / sample.duration);
  if (progress >= 1) return output;
  const weight = actionWeight(progress);
  if (sample.action === 'pet') {
    output.headPitch -= 0.18 * weight;
    output.headYaw *= 1 - 0.72 * weight;
    output.actionLean = 0.16 * weight;
    output.bodyLift += 0.018 * weight;
    output.handReach = weight;
  } else {
    output.headPitch -= 0.28 * weight;
    output.headYaw *= 1 - 0.9 * weight;
    output.actionLean = 0.24 * weight;
    output.bodyLift -= 0.025 * weight;
    output.foodReach = weight;
  }
  return output;
}

function setBasePose(
  output: MutableCaptainWhiskersPose,
  status: CaptainWhiskersPoseState,
): void {
  output.actionLean = 0;
  output.handReach = 0;
  output.foodReach = 0;
  if (status === 'sick') {
    output.bodyPitch = 0.16;
    output.bodyYaw = -0.04;
    output.bodyLift = -0.07;
    output.headPitch = -0.3;
    output.headYaw = 0.08;
    return;
  }
  if (status === 'starving') {
    output.bodyPitch = 0.08;
    output.bodyYaw = 0;
    output.bodyLift = -0.025;
    output.headPitch = -0.22;
    output.headYaw = 0;
    return;
  }
  if (status === 'hungry') {
    output.bodyPitch = 0.045;
    output.bodyYaw = 0;
    output.bodyLift = -0.012;
    output.headPitch = -0.13;
    output.headYaw = 0;
    return;
  }
  if (status === 'unhappy') {
    output.bodyPitch = 0.035;
    output.bodyYaw = 0.16;
    output.bodyLift = -0.012;
    output.headPitch = -0.06;
    output.headYaw = 0.38;
    return;
  }
  output.bodyPitch = 0;
  output.bodyYaw = 0;
  output.bodyLift = 0;
  output.headPitch = -0.025;
  output.headYaw = 0;
}

function actionWeight(progress: number): number {
  if (progress < 0.16) {
    return -0.18 * smoothStep(progress / 0.16);
  }
  if (progress < 0.48) {
    const travel = smoothStep((progress - 0.16) / 0.32);
    return -0.18 + 1.18 * travel;
  }
  if (progress < 0.68) return 1;
  const settle = smoothStep((progress - 0.68) / 0.32);
  return (1 - settle) * (1 + Math.sin(settle * Math.PI) * 0.08);
}

function smoothStep(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

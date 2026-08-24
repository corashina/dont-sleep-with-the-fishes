import type { CarlitosSnapshot } from './CarlitosState';
import { clamp01Unchecked, smoothstepUnchecked } from './animationMath';

export type CarlitosPoseState =
  | 'sick'
  | 'starving'
  | 'hungry'
  | 'unhappy'
  | 'healthy';

export type CarlitosAction = 'pet' | 'feed';

export interface MutableCarlitosPose {
  bodyPitch: number;
  bodyYaw: number;
  bodyLift: number;
  headPitch: number;
  headYaw: number;
  actionLean: number;
  handReach: number;
  handStroke: number;
  handLift: number;
  handContact: number;
  handCurl: number;
  tailSway: number;
  foodReach: number;
}

export interface CarlitosPoseSample {
  status: CarlitosPoseState;
  action: CarlitosAction | null;
  elapsed: number;
  duration: number;
}

export function createCarlitosPose(): MutableCarlitosPose {
  return {
    bodyPitch: 0,
    bodyYaw: 0,
    bodyLift: 0,
    headPitch: 0,
    headYaw: 0,
    actionLean: 0,
    handReach: 0,
    handStroke: 0,
    handLift: 0,
    handContact: 0,
    handCurl: 0,
    tailSway: 0,
    foodReach: 0,
  };
}

export function carlitosPoseState(
  snapshot: CarlitosSnapshot,
): CarlitosPoseState {
  if (snapshot.sickness > 0) return 'sick';
  if (snapshot.hunger <= 1) return 'starving';
  if (snapshot.unhappiness >= 3) return 'unhappy';
  if (snapshot.hunger <= 3) return 'hungry';
  return 'healthy';
}

export function sampleCarlitosPoseInto(
  output: MutableCarlitosPose,
  sample: CarlitosPoseSample,
): MutableCarlitosPose {
  setBasePose(output, sample.status);
  if (sample.action === null || sample.duration <= 0) return output;

  const progress = clamp01Unchecked(sample.elapsed / sample.duration);
  if (progress >= 1) return output;
  if (sample.action === 'pet') {
    let reach = 1;
    let contact = 0;
    let stroke = 0;
    let lift = 0;
    let tailPhase = 0;
    if (progress < 0.18) {
      const approachProgress = progress / 0.18;
      reach = smoothstepUnchecked(approachProgress);
      contact = smoothstepUnchecked(clamp01Unchecked(
        (approachProgress - 0.72) / 0.28,
      ));
      lift = (1 - reach) * 0.45;
    } else if (progress < 0.82) {
      const petPhase = ((progress - 0.18) / 0.64) * 2;
      const cycle = petPhase - Math.floor(petPhase);
      tailPhase = petPhase * Math.PI;
      if (cycle < 0.56) {
        contact = 1;
        stroke = smoothstepUnchecked(cycle / 0.56);
      } else if (cycle < 0.68) {
        lift = smoothstepUnchecked((cycle - 0.56) / 0.12);
        contact = 1 - lift;
        stroke = 1;
      } else if (cycle < 0.9) {
        lift = 1;
        stroke = 1 - smoothstepUnchecked((cycle - 0.68) / 0.22);
      } else {
        contact = smoothstepUnchecked((cycle - 0.9) / 0.1);
        lift = 1 - contact;
      }
    } else {
      const withdrawal = smoothstepUnchecked((progress - 0.82) / 0.18);
      reach = 1 - withdrawal;
      contact = 1 - withdrawal;
      lift = withdrawal * 0.45;
      tailPhase = Math.PI * 2;
    }
    const response = Math.max(contact, reach * 0.18);
    output.headPitch -= (0.09 + stroke * 0.085) * response;
    output.headYaw *= 1 - 0.86 * response;
    output.actionLean = (0.07 + stroke * 0.05) * response;
    output.bodyLift += (0.01 + stroke * 0.012) * response;
    output.handReach = reach;
    output.handStroke = stroke;
    output.handLift = lift;
    output.handContact = contact;
    output.handCurl = 0.12 + contact * 0.18;
    output.tailSway = Math.sin(tailPhase) * contact * 0.13;
  } else {
    const weight = actionWeight(progress);
    output.headPitch -= 0.28 * weight;
    output.headYaw *= 1 - 0.9 * weight;
    output.actionLean = 0.24 * weight;
    output.bodyLift -= 0.025 * weight;
    output.foodReach = weight;
  }
  return output;
}

function setBasePose(
  output: MutableCarlitosPose,
  status: CarlitosPoseState,
): void {
  output.actionLean = 0;
  output.handReach = 0;
  output.handStroke = 0;
  output.handLift = 0;
  output.handContact = 0;
  output.handCurl = 0;
  output.tailSway = 0;
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
    return -0.18 * smoothstepUnchecked(progress / 0.16);
  }
  if (progress < 0.48) {
    const travel = smoothstepUnchecked((progress - 0.16) / 0.32);
    return -0.18 + 1.18 * travel;
  }
  if (progress < 0.68) return 1;
  const settle = smoothstepUnchecked((progress - 0.68) / 0.32);
  return (1 - settle) * (1 + Math.sin(settle * Math.PI) * 0.08);
}

import { clamp01, pulse, smoothstep } from '../animationMath';
import { scaleEventItemDuration } from '../eventItemTiming';

export const SNATCHER_REVEAL_DURATION = 2.5;
export const SNATCHER_ITEM_DURATION = scaleEventItemDuration(1.15);
export const SNATCHER_REACTION_DURATION = 1.2;
const SNATCHER_REVEAL_DEPTH = 2.4;

export function snatcherItemDuration(_choiceId: string): number {
  return SNATCHER_ITEM_DURATION;
}

export interface SnatcherSample {
  creatureX: number;
  creatureY: number;
  creatureZ: number;
  creatureYaw: number;
  creaturePitch: number;
  creatureRoll: number;
  fingerVisibility: number;
  headVisibility: number;
  pointStrength: number;
  crouchStrength: number;
  recoilStrength: number;
}

function resetSnatcherSample(output: SnatcherSample): void {
  output.creatureX = 0;
  output.creatureY = 0;
  output.creatureZ = 0;
  output.creatureYaw = 0;
  output.creaturePitch = 0;
  output.creatureRoll = 0;
  output.fingerVisibility = 0;
  output.headVisibility = 0;
  output.pointStrength = 0;
  output.crouchStrength = 0;
  output.recoilStrength = 0;
}

function holdCrouchedThreat(output: SnatcherSample): void {
  output.fingerVisibility = 1;
  output.headVisibility = 1;
  output.pointStrength = 1;
  output.crouchStrength = 1;
  output.creatureY = -0.16;
  output.creaturePitch = 0.14;
  output.creatureRoll = -0.035;
}

export function identitySnatcherSample(): SnatcherSample {
  return {
    creatureX: 0,
    creatureY: 0,
    creatureZ: 0,
    creatureYaw: 0,
    creaturePitch: 0,
    creatureRoll: 0,
    fingerVisibility: 0,
    headVisibility: 0,
    pointStrength: 0,
    crouchStrength: 0,
    recoilStrength: 0,
  };
}

export function sampleSnatcherReveal(
  progress: number,
  output: SnatcherSample,
): boolean {
  resetSnatcherSample(output);
  const t = clamp01(progress);
  if (t === 0) return true;

  output.fingerVisibility = smoothstep((t - 0.04) / 0.24);
  output.headVisibility = smoothstep((t - 0.3) / 0.28);
  output.crouchStrength = smoothstep((t - 0.28) / 0.34);
  output.pointStrength = smoothstep((t - 0.37) / 0.24);
  const rise = smoothstep((t - 0.04) / 0.52);
  output.creatureY = -0.16 * output.crouchStrength
    - SNATCHER_REVEAL_DEPTH * (1 - rise);
  output.creatureZ = 0.12 * (1 - output.headVisibility);
  output.creaturePitch = 0.14 * output.crouchStrength;
  output.creatureRoll = -0.035 * output.crouchStrength;
  return true;
}

export function sampleSnatcherItemUse(
  choiceId: string,
  progress: number,
  output: SnatcherSample,
): boolean {
  resetSnatcherSample(output);
  if (choiceId !== 'shotgun' && choiceId !== 'knife') return false;

  holdCrouchedThreat(output);
  const t = clamp01(progress);
  if (t === 0 || t === 1) return true;
  const action = choiceId === 'knife'
    ? pulse(t, 0.52, 0.7, 0.84)
    : pulse(t, 0.16, 0.56, 0.9);
  output.recoilStrength = action;
  output.creatureX = action * (choiceId === 'knife' ? 0.12 : 0.16);
  output.creatureRoll -= action * (choiceId === 'knife' ? 0.15 : 0.12);
  return true;
}

export function sampleSnatcherReaction(
  progress: number,
  output: SnatcherSample,
): boolean {
  resetSnatcherSample(output);
  holdCrouchedThreat(output);
  const t = clamp01(progress);
  if (t === 0) return true;

  const retreat = smoothstep((t - 0.18) / 0.72);
  output.pointStrength = 1 - retreat * 0.54;
  output.creatureX = retreat * 0.34;
  output.creatureY = -0.16 - retreat * 0.08;
  return true;
}

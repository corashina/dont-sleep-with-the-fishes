import { clamp01, pulse, smootherstep, smoothstep } from '../animationMath';
import { scaleEventItemDuration } from '../eventItemTiming';
import { eventItemUseDurationForItem } from '../eventItemUseChoreography';
import { sampleNetAttackContact } from '../netAttackChoreography';

export const SNATCHER_REVEAL_DURATION = 3;
export const SNATCHER_ITEM_DURATION = scaleEventItemDuration(1.15);
export const SNATCHER_REACTION_DURATION = 1.8;
const SNATCHER_REVEAL_DEPTH = 2.4;
const SNATCHER_SINK_DEPTH = 2.7;

export function snatcherItemDuration(choiceId: string): number {
  if (choiceId === 'cannedFood') return eventItemUseDurationForItem('throw-target', 'cannedFood');
  if (choiceId === 'fishingNet') return eventItemUseDurationForItem('net-slap', 'fishingNet');
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

  // One eased rise, a small crest above the hold pose, then a settle.
  const rise = smootherstep((t - 0.02) / 0.64);
  const unfurl = 1 - rise;
  const crest = Math.sin(Math.PI * clamp01((t - 0.5) / 0.46)) * 0.1;
  output.fingerVisibility = smoothstep(t / 0.12);
  output.headVisibility = smoothstep((t - 0.18) / 0.32);
  output.crouchStrength = smootherstep((t - 0.08) / 0.58);
  output.pointStrength = smootherstep((t - 0.34) / 0.5);
  output.creatureY = -0.16 * output.crouchStrength
    - SNATCHER_REVEAL_DEPTH * unfurl
    + crest;
  output.creatureZ = 0.12 * (1 - output.headVisibility);
  // The tentacle leans back and sways while it leaves the water.
  output.creaturePitch = 0.14 * output.crouchStrength - 0.2 * unfurl;
  output.creatureRoll = -0.035 * output.crouchStrength
    + Math.sin(t * Math.PI * 2.4) * 0.12 * unfurl;
  output.creatureYaw = Math.sin(t * Math.PI * 1.7) * 0.08 * unfurl;
  return true;
}

function applySnatcherSink(progress: number, output: SnatcherSample): void {
  const flinch = pulse(progress, 0, 0.12, 0.32);
  const sink = smootherstep((progress - 0.1) / 0.9);
  const fade = 1 - smoothstep((progress - 0.72) / 0.28);
  output.creatureY += flinch * 0.1 - sink * SNATCHER_SINK_DEPTH;
  output.creaturePitch += sink * 0.2 - flinch * 0.12;
  output.creatureRoll -= sink * 0.18;
  output.creatureYaw += sink * 0.22;
  output.pointStrength *= 1 - smoothstep((progress - 0.04) / 0.5);
  output.crouchStrength *= 1 - sink;
  output.fingerVisibility *= fade;
  output.headVisibility *= fade;
}

export function sampleSnatcherItemUse(
  choiceId: string,
  progress: number,
  output: SnatcherSample,
): boolean {
  resetSnatcherSample(output);
  if (choiceId !== 'shotgun' && choiceId !== 'knife' && choiceId !== 'fishingNet' && choiceId !== 'cannedFood') return false;

  holdCrouchedThreat(output);
  const t = clamp01(progress);
  if (choiceId === 'cannedFood') {
    const follow = smoothstep((t - 0.7) / 0.3);
    output.creatureX = follow * 0.8;
    output.creatureYaw = follow * 0.45;
    output.pointStrength = 1 - follow;
    return true;
  }
  if (t === 0 || t === 1) return true;
  const action = choiceId === 'fishingNet' ? sampleNetAttackContact(t) : choiceId === 'knife'
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
  choiceId: string | null,
): boolean {
  const t = clamp01(progress);
  if (choiceId === 'cannedFood') {
    sampleSnatcherItemUse('cannedFood', 1, output);
    output.creatureX += smoothstep(t / 0.8);
  } else {
    resetSnatcherSample(output);
    holdCrouchedThreat(output);
    if (choiceId !== 'shotgun' && choiceId !== 'fishingNet' && choiceId !== 'knife') {
      // The tentacle drags its catch away from the hull before it dives.
      const pull = smootherstep(t / 0.5);
      output.creatureX = pull * 0.34;
      output.pointStrength = 1 - pull * 0.54;
    }
  }
  applySnatcherSink(t, output);
  return true;
}

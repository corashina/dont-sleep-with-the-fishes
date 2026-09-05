import { clamp01, pulse, smoothstep } from '../animationMath';
import { scaleEventItemDuration, scaleThrownItemDuration } from '../eventItemTiming';
import { NET_ATTACK_BASE_DURATION, sampleNetAttackContact } from '../netAttackChoreography';

export const DEATH_STARE_REVEAL_DURATION = 3.2;
export const DEATH_STARE_ITEM_DURATION = scaleEventItemDuration(1.25);
export const DEATH_STARE_REACTION_DURATION = 1.25;

export function deathStareItemDuration(choiceId: string): number {
  if (choiceId === 'fishingNet') return scaleEventItemDuration(NET_ATTACK_BASE_DURATION);
  return choiceId === 'food' || choiceId === 'cannedFood'
    ? scaleThrownItemDuration(1.25)
    : DEATH_STARE_ITEM_DURATION;
}

export type DeathStareItemEffectKind =
  | 'none'
  | 'flashlight-beam'
  | 'umbrella-shield'
  | 'food-toss'
  | 'shotgun-fire'
  | 'net-slap';

export interface DeathStareReactionState {
  readonly attacked: boolean;
  readonly lostItem: boolean;
  readonly brokenItem: boolean;
}

export interface DeathStareSample {
  fishX: number;
  fishY: number;
  fishZ: number;
  fishYaw: number;
  fishPitch: number;
  fishRoll: number;
  fishVisibility: number;
  eyeTarget: number;
  blink: number;
  jawOpen: number;
  lureStrength: number;
  waterDrain: number;
  sink: number;
  lunge: number;
  cameraPitch: number;
  cameraRoll: number;
  hullRoll: number;
  supplyTravel: number;
  itemX: number;
  itemY: number;
  itemZ: number;
  itemYaw: number;
  itemPitch: number;
  itemRoll: number;
  itemScaleX: number;
  itemScaleY: number;
  itemScaleZ: number;
  effectStrength: number;
  effectKind: DeathStareItemEffectKind;
}

function resetSample(output: DeathStareSample): void {
  output.fishX = 0;
  output.fishY = 0;
  output.fishZ = 0;
  output.fishYaw = 0;
  output.fishPitch = 0;
  output.fishRoll = 0;
  output.fishVisibility = 1;
  output.eyeTarget = 1;
  output.blink = 0;
  output.jawOpen = 0.18;
  output.lureStrength = 0.72;
  output.waterDrain = 0;
  output.sink = 0;
  output.lunge = 0;
  output.cameraPitch = 0;
  output.cameraRoll = 0;
  output.hullRoll = 0;
  output.supplyTravel = 0;
  output.itemX = 0;
  output.itemY = 0;
  output.itemZ = 0;
  output.itemYaw = 0;
  output.itemPitch = 0;
  output.itemRoll = 0;
  output.itemScaleX = 1;
  output.itemScaleY = 1;
  output.itemScaleZ = 1;
  output.effectStrength = 0;
  output.effectKind = 'none';
}

function holdGaze(output: DeathStareSample): void {
  output.fishVisibility = 1;
  output.eyeTarget = 1;
  output.jawOpen = 0.18;
  output.lureStrength = 0.72;
}

export function identityDeathStareSample(): DeathStareSample {
  return {
    fishX: 0,
    fishY: 0,
    fishZ: 0,
    fishYaw: 0,
    fishPitch: 0,
    fishRoll: 0,
    fishVisibility: 1,
    eyeTarget: 1,
    blink: 0,
    jawOpen: 0.18,
    lureStrength: 0.72,
    waterDrain: 0,
    sink: 0,
    lunge: 0,
    cameraPitch: 0,
    cameraRoll: 0,
    hullRoll: 0,
    supplyTravel: 0,
    itemX: 0,
    itemY: 0,
    itemZ: 0,
    itemYaw: 0,
    itemPitch: 0,
    itemRoll: 0,
    itemScaleX: 1,
    itemScaleY: 1,
    itemScaleZ: 1,
    effectStrength: 0,
    effectKind: 'none',
  };
}

export function sampleDeathStareReveal(
  progress: number,
  output: DeathStareSample,
): boolean {
  resetSample(output);
  const t = clamp01(progress);
  const rise = smoothstep(t / 0.56);
  output.fishVisibility = smoothstep(t / 0.16);
  output.fishX = -0.12 * (1 - rise);
  output.fishY = -2.35 * (1 - rise);
  output.fishZ = -0.54 * (1 - rise);
  output.fishPitch = -0.08 * (1 - rise);
  output.fishRoll = 0.035 * (1 - rise);
  output.eyeTarget = smoothstep((t - 0.35) / 0.22);
  output.blink = pulse(t, 0.48, 0.565, 0.65);
  output.jawOpen = 0.08 + rise * 0.1;
  output.lureStrength = 0.18 + rise * 0.54;
  output.waterDrain = (1 - smoothstep((t - 0.38) / 0.56))
    * smoothstep(t / 0.18);
  if (t >= 0.68) holdGaze(output);
  return true;
}

const DEATH_STARE_ITEM_CHOICES = new Set([
  'flashlight',
  'umbrella',
  'cannedFood',
  'shotgun',
  'fishingNet',
]);

export function sampleDeathStareItemUse(
  choiceId: string,
  progress: number,
  output: DeathStareSample,
): boolean {
  resetSample(output);
  if (!DEATH_STARE_ITEM_CHOICES.has(choiceId)) return false;

  holdGaze(output);
  const t = clamp01(progress);
  if (t === 0 || t === 1) return true;
  const lift = Math.min(
    smoothstep(t / 0.22),
    1 - smoothstep((t - 0.82) / 0.18),
  );
  const action = pulse(t, 0.16, 0.56, 0.9);

  switch (choiceId) {
    case 'flashlight':
      output.itemX = 0.42 * lift;
      output.itemY = 0.72 * lift;
      output.itemZ = -0.28 * lift;
      output.itemYaw = -0.18 * lift;
      output.itemPitch = -0.42 * lift;
      output.effectStrength = action;
      output.effectKind = 'flashlight-beam';
      output.blink = action;
      output.eyeTarget = 1 - action * 0.28;
      break;
    case 'umbrella':
      output.itemX = 0.64 * lift;
      output.itemY = 0.48 * lift;
      output.itemZ = -0.18 * lift;
      output.itemYaw = 0.35 * lift;
      output.itemPitch = -0.18 * lift;
      output.itemRoll = -1.18 * action;
      output.itemScaleX = 1 + action * 0.18;
      output.itemScaleZ = 1 + action * 0.18;
      output.effectStrength = action;
      output.effectKind = 'umbrella-shield';
      break;
    case 'cannedFood': {
      const toss = pulse(t, 0.1, 0.62, 0.94);
      output.itemX = 2.45 * toss;
      output.itemY = (0.36 + Math.sin(Math.PI * t) * 0.82) * toss;
      output.itemZ = -1.12 * toss;
      output.itemYaw = toss * 1.6;
      output.itemRoll = toss * -2.2;
      output.itemScaleX = 1 - toss * 0.22;
      output.itemScaleY = 1 - toss * 0.22;
      output.itemScaleZ = 1 - toss * 0.22;
      output.effectStrength = toss;
      output.effectKind = 'food-toss';
      output.jawOpen += toss * 0.32;
      break;
    }
    case 'shotgun':
      output.itemX = 0.68 * lift - action * 0.3;
      output.itemY = 0.5 * lift + action * 0.08;
      output.itemZ = -0.24 * lift;
      output.itemYaw = -0.16 * lift;
      output.itemPitch = -0.24 * lift + action * 0.28;
      output.itemRoll = action * 0.12;
      output.effectStrength = action;
      output.effectKind = 'shotgun-fire';
      output.fishZ = -action * 0.08;
      break;
    case 'fishingNet': {
      const contact = sampleNetAttackContact(t);
      output.effectStrength = contact;
      output.effectKind = 'net-slap';
      output.blink = contact;
      output.eyeTarget = 1 - contact * 0.52;
      output.fishZ = -contact * 0.18;
      output.fishPitch = contact * 0.1;
      break;
    }
  }
  return true;
}

export function sampleDeathStareReaction(
  reaction: Readonly<DeathStareReactionState>,
  progress: number,
  output: DeathStareSample,
): boolean {
  resetSample(output);
  holdGaze(output);
  const t = clamp01(progress);

  if (reaction.attacked) {
    const impact = pulse(t, 0.1, 0.46, 0.84);
    const lunge = pulse(t, 0.04, 0.54, 0.96);
    output.lunge = lunge;
    output.fishZ = lunge * 0.12;
    output.fishY = lunge * 0.16;
    output.fishPitch = lunge * -0.07;
    output.jawOpen += lunge * 0.54;
    output.cameraPitch = impact === 0 ? 0 : impact * -0.11;
    output.cameraRoll = impact === 0 ? 0 : impact * 0.035;
    output.hullRoll = impact === 0 ? 0 : impact * -0.085;
    output.lureStrength = 0.72 + lunge * 0.28;
  } else if (!reaction.lostItem) {
    const sink = smoothstep((t - 0.32) / 0.68);
    output.sink = sink;
    output.fishY = sink * -2.1;
    output.fishZ = sink * -0.42;
    output.fishPitch = sink * 0.08;
    output.fishVisibility = 1 - smoothstep((t - 0.82) / 0.18);
    output.eyeTarget = 1 - sink * 0.62;
    output.waterDrain = sink * 0.24;
  }

  if (reaction.lostItem) {
    const mouthTravel = smoothstep((t - 0.08) / 0.64);
    output.supplyTravel = mouthTravel;
    output.itemYaw = mouthTravel * 1.35;
    output.itemPitch = mouthTravel * -0.28;
    output.itemRoll = mouthTravel * -1.18;
    const itemScale = 1 - mouthTravel * 0.82;
    output.itemScaleX = itemScale;
    output.itemScaleY = itemScale;
    output.itemScaleZ = itemScale;
    output.jawOpen += mouthTravel * 0.46;
  } else if (reaction.brokenItem) {
    const collapse = smoothstep((t - 0.14) / 0.56);
    output.itemX = 0.22 * collapse;
    output.itemY = -0.46 * collapse;
    output.itemZ = 0.12 * collapse;
    output.itemYaw = -0.34 * collapse;
    output.itemPitch = 0.42 * collapse;
    output.itemRoll = 1.18 * collapse;
    output.itemScaleX = 1 + collapse * 0.12;
    output.itemScaleY = 1 - collapse * 0.76;
    output.itemScaleZ = 1 - collapse * 0.18;
  }
  return true;
}

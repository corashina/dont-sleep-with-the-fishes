import { clamp01, pulse, smoothstep } from '../animationMath';
import { scaleEventItemDuration, scaleThrownItemDuration } from '../eventItemTiming';

export const SCHOOL_REVEAL_DURATION = 2.6;
export const SCHOOL_ITEM_DURATION = scaleEventItemDuration(1.25);
export const SCHOOL_REACTION_DURATION = 1.1;

export function schoolItemDuration(choiceId: string): number {
  return choiceId === 'fishingNet'
    ? scaleThrownItemDuration(1.25)
    : SCHOOL_ITEM_DURATION;
}
export const SCHOOL_CENTER_X = 0;
export const SCHOOL_CENTER_Z = -4.2;

export type SchoolItemEffectKind =
  | 'none'
  | 'net-sweep'
  | 'bucket-dip'
  | 'telescope-track';

export interface SchoolVariant {
  readonly scale: number;
  readonly orbitAngle: number;
  readonly orbitRadiusX: number;
  readonly orbitRadiusZ: number;
  readonly depth: number;
  readonly scatterX: number;
  readonly scatterZ: number;
  readonly speed: number;
  readonly bank: number;
  readonly flashOffset: number;
}

export interface SchoolReactionState {
  readonly foodDelta: number;
  readonly brokenItem: boolean;
}

export interface SchoolSample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  gather: number;
  schoolAlpha: number;
  surfaceFlash: number;
  splash: number;
  catchStrength: number;
  scatter: number;
  foodDelta: number;
  effect: number;
  effectKind: SchoolItemEffectKind;
}

export interface SchoolFishPose {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  scale: number;
}

function seededUnit(seed: number): number {
  let value = seed | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 0x1_0000_0000;
}

function variantUnit(seed: number, index: number, channel: number): number {
  const mixed = (seed | 0)
    ^ Math.imul(index + 1, 0x45d9f3b)
    ^ Math.imul(channel + 11, 0x27d4eb2d);
  return seededUnit(mixed);
}

export function createSchoolVariants(count: number, seed: number): readonly SchoolVariant[] {
  const safeCount = Number.isFinite(count)
    ? Math.max(0, Math.min(24, Math.floor(count)))
    : 0;
  const safeSeed = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  const variants: SchoolVariant[] = [];
  for (let index = 0; index < safeCount; index += 1) {
    const lane = index % 4;
    variants.push({
      scale: 0.78 + variantUnit(safeSeed, index, 0) * 0.46,
      orbitAngle: (index / Math.max(1, safeCount)) * Math.PI * 2
        + (variantUnit(safeSeed, index, 1) - 0.5) * 0.22,
      orbitRadiusX: 3.4 + lane * 0.28 + variantUnit(safeSeed, index, 2) * 0.22,
      orbitRadiusZ: 1.2 + lane * 0.28 + variantUnit(safeSeed, index, 3) * 0.34,
      depth: 0.04 + variantUnit(safeSeed, index, 4) * 0.16,
      scatterX: (variantUnit(safeSeed, index, 5) < 0.5 ? -1 : 1)
        * (5.8 + variantUnit(safeSeed, index, 6) * 2.4),
      scatterZ: (variantUnit(safeSeed, index, 7) - 0.5) * 11,
      speed: 0.72 + variantUnit(safeSeed, index, 8) * 0.48,
      bank: (variantUnit(safeSeed, index, 9) - 0.5) * 0.26,
      flashOffset: variantUnit(safeSeed, index, 10),
    });
  }
  return variants;
}

function resetSchoolSample(output: SchoolSample): void {
  output.x = 0;
  output.y = 0;
  output.z = 0;
  output.yaw = 0;
  output.pitch = 0;
  output.roll = 0;
  output.scaleX = 1;
  output.scaleY = 1;
  output.scaleZ = 1;
  output.gather = 0;
  output.schoolAlpha = 0;
  output.surfaceFlash = 0;
  output.splash = 0;
  output.catchStrength = 0;
  output.scatter = 0;
  output.foodDelta = 0;
  output.effect = 0;
  output.effectKind = 'none';
}

export function identitySchoolSample(): SchoolSample {
  return {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    gather: 0,
    schoolAlpha: 0,
    surfaceFlash: 0,
    splash: 0,
    catchStrength: 0,
    scatter: 0,
    foodDelta: 0,
    effect: 0,
    effectKind: 'none',
  };
}

export function identitySchoolFishPose(): SchoolFishPose {
  return {
    x: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    scale: 1,
  };
}

export function sampleSchoolReveal(progress: number, output: SchoolSample): boolean {
  resetSchoolSample(output);
  const t = clamp01(progress);
  output.gather = smoothstep((t - 0.04) / 0.72);
  output.schoolAlpha = smoothstep(t / 0.2);
  output.surfaceFlash = pulse(t, 0.28, 0.62, 0.94);
  output.splash = pulse(t, 0.18, 0.48, 0.78) * 0.48;
  return true;
}

export function sampleSchoolItemUse(
  choiceId: string,
  progress: number,
  output: SchoolSample,
): boolean {
  resetSchoolSample(output);
  const telescope = choiceId === 'spyglass' || choiceId === 'telescope';
  if (choiceId !== 'fishingNet' && choiceId !== 'bucket' && !telescope) return false;

  const t = clamp01(progress);
  const lift = Math.min(
    smoothstep(t / 0.24),
    1 - smoothstep((t - 0.8) / 0.2),
  );
  const action = pulse(t, 0.18, 0.58, 0.92);
  output.gather = 1;
  output.schoolAlpha = 1;
  output.effect = action;

  if (choiceId === 'fishingNet') {
    output.x = 1.6 * lift + 0.9 * action;
    output.y = 0.54 * lift - 0.16 * action;
    output.z = -0.42 * lift + 0.68 * action;
    output.yaw = -0.38 * lift - 0.76 * action;
    output.pitch = -0.22 * lift;
    output.roll = -0.3 * action;
    output.surfaceFlash = action * 0.74;
    output.splash = action;
    output.effectKind = 'net-sweep';
  } else if (choiceId === 'bucket') {
    output.x = 1.42 * lift;
    output.y = 0.46 * lift - 0.82 * action;
    output.z = -0.22 * lift;
    output.yaw = 0.18 * lift;
    output.pitch = -0.86 * action;
    output.roll = 0.38 * lift - 0.24 * action;
    output.splash = action;
    output.effectKind = 'bucket-dip';
  } else {
    output.x = 0.18 * lift;
    output.y = 0.68 * lift;
    output.z = -0.12 * lift;
    output.yaw = (-0.46 + t * 0.92) * lift;
    output.pitch = -0.16 * lift + 0.08 * action;
    output.roll = -0.08 * lift;
    output.surfaceFlash = action * 0.32;
    output.effectKind = 'telescope-track';
  }
  return true;
}

export function sampleSchoolReaction(
  reaction: number | Readonly<SchoolReactionState>,
  progress: number,
  output: SchoolSample,
): boolean {
  resetSchoolSample(output);
  const foodDelta = typeof reaction === 'number'
    ? reaction
    : reaction.foodDelta;
  const brokenItem = typeof reaction === 'number'
    ? false
    : reaction.brokenItem;
  const exactFoodDelta = Number.isFinite(foodDelta) ? Math.trunc(foodDelta) : 0;
  const t = clamp01(progress);
  const settle = smoothstep(t / 0.7);

  output.gather = 1 - settle;
  output.schoolAlpha = 1;
  output.scatter = smoothstep((t - 0.08) / 0.8);
  output.splash = pulse(t, 0.04, 0.3, 0.72);
  output.surfaceFlash = pulse(t, 0.08, 0.42, 0.84);
  output.foodDelta = exactFoodDelta;
  output.catchStrength = exactFoodDelta > 0 ? smoothstep((t - 0.08) / 0.62) : 0;

  if (brokenItem) {
    output.y = -0.2 * settle;
    output.pitch = -0.18 * settle;
    output.roll = 0.42 * settle;
    output.scaleX = 1 + 0.08 * settle;
    output.scaleY = 1 - 0.38 * settle;
    output.scaleZ = 1 + 0.06 * settle;
  }
  return true;
}

export function sampleSchoolFishPose(
  variant: Readonly<SchoolVariant>,
  time: number,
  school: Readonly<SchoolSample>,
  output: SchoolFishPose,
): void {
  const safeTime = Number.isFinite(time) ? time : 0;
  const angle = variant.orbitAngle + safeTime * variant.speed;
  const orbitX = SCHOOL_CENTER_X + Math.cos(angle) * variant.orbitRadiusX;
  const orbitZ = SCHOOL_CENTER_Z + Math.sin(angle) * variant.orbitRadiusZ;
  output.x = SCHOOL_CENTER_X + variant.scatterX
    + (orbitX - SCHOOL_CENTER_X - variant.scatterX) * school.gather;
  output.z = SCHOOL_CENTER_Z + variant.scatterZ
    + (orbitZ - SCHOOL_CENTER_Z - variant.scatterZ) * school.gather;
  if (school.scatter > 0) {
    output.x = orbitX + variant.scatterX * school.scatter * 0.92;
    output.z = orbitZ + variant.scatterZ * school.scatter * 0.92;
  }
  output.yaw = Math.atan2(
    -Math.sin(angle) * variant.orbitRadiusX,
    Math.cos(angle) * variant.orbitRadiusZ,
  );
  output.pitch = variant.bank;
  output.roll = 0;
  output.scale = variant.scale * Math.max(0.01, school.schoolAlpha);
}

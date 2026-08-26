import { clamp01, pulse, smoothstep } from '../animationMath';
import { scaleEventItemDuration, scaleThrownItemDuration } from '../eventItemTiming';
import { resetTransformPose, type MutableTransformPose } from '../transformPose';

export const SWARM_REVEAL_DURATION = 2.9;
export const SWARM_ITEM_DURATION = scaleEventItemDuration(1.2);
export const SWARM_REACTION_DURATION = 1.15;

export function swarmItemDuration(choiceId: string): number {
  return choiceId === 'bait' || choiceId === 'baitTin' || choiceId === 'fishingNet'
    ? scaleThrownItemDuration(1.2)
    : SWARM_ITEM_DURATION;
}
export const SWARM_SHARK_COUNT = 5;
const ORBIT_SPEED_SCALE = 0.34;
const ORBIT_RADIUS_X = 6.2;
const ORBIT_RADIUS_Z = 8;
const OUTER_ORBIT_SCALE = 1.32;
const ORBIT_SPEED = 0.86;

export type SwarmItemEffectKind =
  | 'none'
  | 'net-pull'
  | 'shotgun-opening'
  | 'flashlight-sweep'
  | 'bait-diversion';

export interface SwarmVariant {
  readonly scale: number;
  readonly orbitAngle: number;
  readonly radiusX: number;
  readonly radiusZ: number;
  readonly approachDistance: number;
  readonly depth: number;
  readonly speed: number;
  readonly roll: number;
  readonly revealAt: number;
  readonly motionPhase: number;
  readonly group: 0 | 1 | 2 | 3;
}

export interface SwarmReactionState {
  readonly attacked: boolean;
  readonly foodDelta: number;
  readonly baitDelta: number;
  readonly brokenItem: boolean;
}

export interface SwarmSample extends MutableTransformPose {
  revealProgress: number;
  closure: number;
  cameraYaw: number;
  hullRoll: number;
  netPull: number;
  opening: number;
  flashlightSweep: number;
  baitDiversion: number;
  attack: number;
  splash: number;
  catchStrength: number;
  foodDelta: number;
  baitDelta: number;
  effect: number;
  effectKind: SwarmItemEffectKind;
}

export interface SwarmSharkPose {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  scale: number;
}

const GROUP_SIZES = [2, 1, 1, 1] as const;
const GROUP_REVEAL = [0.06, 0.24, 0.38, 0.52] as const;

function seededUnit(seed: number): number {
  let value = seed | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 0x1_0000_0000;
}

function variantUnit(seed: number, index: number, channel: number): number {
  return seededUnit(
    (seed | 0)
    ^ Math.imul(index + 3, 0x45d9f3b)
    ^ Math.imul(channel + 17, 0x27d4eb2d),
  );
}

function groupForIndex(index: number): 0 | 1 | 2 | 3 {
  if (index < GROUP_SIZES[0]) return 0;
  if (index < GROUP_SIZES[0] + GROUP_SIZES[1]) return 1;
  if (index < GROUP_SIZES[0] + GROUP_SIZES[1] + GROUP_SIZES[2]) return 2;
  return 3;
}

export function createSwarmVariants(
  countOrSeed: number,
  optionalSeed?: number,
): readonly SwarmVariant[] {
  const count = optionalSeed === undefined
    ? SWARM_SHARK_COUNT
    : Math.max(0, Math.min(
      SWARM_SHARK_COUNT,
      Number.isFinite(countOrSeed) ? Math.floor(countOrSeed) : 0,
    ));
  const seedValue = optionalSeed === undefined ? countOrSeed : optionalSeed;
  const seed = Number.isFinite(seedValue) ? Math.trunc(seedValue) : 0;
  const swarmPhase = variantUnit(seed, 0, 9) * Math.PI * 2;
  const variants: SwarmVariant[] = [];
  for (let index = 0; index < count; index += 1) {
    const group = groupForIndex(index);
    const orbitScale = index % 2 === 1 ? OUTER_ORBIT_SCALE : 1;
    variants.push({
      scale: 0.8 + variantUnit(seed, index, 1) * 0.24,
      orbitAngle: swarmPhase
        + index * Math.PI * 2 / SWARM_SHARK_COUNT,
      radiusX: ORBIT_RADIUS_X * orbitScale,
      radiusZ: ORBIT_RADIUS_Z * orbitScale,
      approachDistance: 2 + variantUnit(seed, index, 5) * 0.8,
      depth: 0.22 + variantUnit(seed, index, 6) * 0.48,
      speed: ORBIT_SPEED,
      roll: (variantUnit(seed, index, 8) - 0.5) * 0.2,
      revealAt: GROUP_REVEAL[group]
        + (variantUnit(seed, index, 9) - 0.5) * 0.018,
      motionPhase: variantUnit(seed, index, 10) * Math.PI * 2,
      group,
    });
  }
  return variants;
}

function resetSample(output: SwarmSample): void {
  resetTransformPose(output);
  output.revealProgress = 1;
  output.closure = 1;
  output.cameraYaw = 0;
  output.hullRoll = 0;
  output.netPull = 0;
  output.opening = 0;
  output.flashlightSweep = 0;
  output.baitDiversion = 0;
  output.attack = 0;
  output.splash = 0;
  output.catchStrength = 0;
  output.foodDelta = 0;
  output.baitDelta = 0;
  output.effect = 0;
  output.effectKind = 'none';
}

export function createSwarmSample(): SwarmSample {
  const sample = {} as SwarmSample;
  resetSample(sample);
  return sample;
}

export const identitySwarmSample = createSwarmSample;

export function createSwarmSharkPose(): SwarmSharkPose {
  return {
    x: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    scale: 1,
  };
}

export const identitySwarmSharkPose = createSwarmSharkPose;

export function sampleSwarmReveal(
  progress: number,
  _variants: readonly Readonly<SwarmVariant>[],
  output: SwarmSample,
): boolean {
  resetSample(output);
  const t = clamp01(progress);
  output.revealProgress = t;
  output.closure = smoothstep((t - 0.1) / 0.78);
  return true;
}

export function sampleSwarmItemUse(
  choiceId: string,
  progress: number,
  output: SwarmSample,
): boolean {
  resetSample(output);
  if (
    choiceId !== 'fishingNet'
    && choiceId !== 'shotgun'
    && choiceId !== 'flashlight'
    && choiceId !== 'baitTin'
  ) {
    return false;
  }

  const t = clamp01(progress);
  const lift = Math.min(
    smoothstep(t / 0.22),
    1 - smoothstep((t - 0.82) / 0.18),
  );
  const action = pulse(t, 0.14, 0.56, 0.94);
  output.effect = action;

  if (choiceId === 'fishingNet') {
    output.netPull = action;
    output.x = 0.58 * lift + 1.18 * action;
    output.y = 0.48 * lift - 0.18 * action;
    output.z = -0.24 * lift + 0.52 * action;
    output.yaw = -0.26 * lift;
    output.pitch = -0.38 * lift;
    output.roll = -0.48 * action;
    output.scaleX = 1 + action * 0.32;
    output.scaleZ = 1 + action * 0.22;
    output.splash = action;
    output.effectKind = 'net-pull';
  } else if (choiceId === 'shotgun') {
    output.opening = action;
    output.x = 0.66 * lift - 0.18 * action;
    output.y = 0.46 * lift + 0.1 * action;
    output.z = -0.2 * lift;
    output.yaw = -0.14 * lift;
    output.pitch = -0.28 * lift + 0.22 * action;
    output.roll = action * 0.1;
    output.splash = action * 0.48;
    output.effectKind = 'shotgun-opening';
  } else if (choiceId === 'flashlight') {
    output.flashlightSweep = action;
    output.x = 0.34 * lift;
    output.y = 0.68 * lift;
    output.z = -0.18 * lift;
    output.yaw = (-0.72 + t * 1.44) * lift;
    output.pitch = -0.34 * lift;
    output.effectKind = 'flashlight-sweep';
  } else {
    output.baitDiversion = action;
    output.x = 2.5 * action;
    output.y = (0.34 + Math.sin(Math.PI * t) * 0.72) * action;
    output.z = -1.35 * action;
    output.yaw = action * 1.4;
    output.roll = action * -2.1;
    const itemScale = 1 - action * 0.62;
    output.scaleX = itemScale;
    output.scaleY = itemScale;
    output.scaleZ = itemScale;
    output.effectKind = 'bait-diversion';
  }
  return true;
}

export function sampleSwarmReaction(
  reaction: Readonly<SwarmReactionState>,
  progress: number,
  output: SwarmSample,
): boolean {
  resetSample(output);
  const t = clamp01(progress);
  output.foodDelta = Number.isFinite(reaction.foodDelta)
    ? Math.max(0, Math.min(2, Math.trunc(reaction.foodDelta)))
    : 0;
  output.baitDelta = Number.isFinite(reaction.baitDelta)
    ? Math.trunc(reaction.baitDelta)
    : 0;

  if (reaction.attacked) {
    output.attack = pulse(t, 0.04, 0.48, 0.96);
    output.splash = pulse(t, 0.02, 0.34, 0.82);
    output.hullRoll = output.attack === 0
      ? 0
      : Math.sin(Math.PI * t * 3) * output.attack * 0.055;
  } else {
    output.opening = smoothstep((t - 0.06) / 0.72)
      * (output.foodDelta > 0 ? 0.92 : 0);
    output.catchStrength = output.foodDelta > 0
      ? smoothstep((t - 0.08) / 0.66)
      : 0;
    output.baitDiversion = output.baitDelta < 0
      ? smoothstep((t - 0.04) / 0.72)
      : 0;
    output.splash = pulse(t, 0.04, 0.3, 0.76)
      * (output.foodDelta > 0 ? 0.74 : 0.36);
  }

  if (reaction.brokenItem) {
    const breakSettle = smoothstep((t - 0.18) / 0.72);
    output.y = -0.18 * breakSettle;
    output.pitch = -0.2 * breakSettle;
    output.roll = 0.52 * breakSettle;
    output.scaleX = 1.08;
    output.scaleY = 1 - breakSettle * 0.46;
    output.scaleZ = 1.06;
  }
  return true;
}

export function sampleSwarmSharkPose(
  variant: Readonly<SwarmVariant>,
  time: number,
  swarm: Readonly<SwarmSample>,
  output: SwarmSharkPose,
): void {
  const safeTime = Number.isFinite(time) ? time : 0;
  const orbitAngle = variant.orbitAngle
    + safeTime * ORBIT_SPEED_SCALE * variant.speed;
  const localClose = smoothstep(
    (swarm.revealProgress - variant.revealAt - 0.04)
    / Math.max(0.18, 0.88 - variant.revealAt),
  );
  const close = swarm.revealProgress < 1 ? localClose : swarm.closure;
  const outer = variant.approachDistance * (1 - close);
  const cosine = Math.cos(orbitAngle);
  const sine = Math.sin(orbitAngle);
  const baseX = cosine * variant.radiusX;
  const baseZ = sine * variant.radiusZ;
  const distance = Math.hypot(baseX, baseZ) || 1;
  const radialX = baseX / distance;
  const radialZ = baseZ / distance;
  const openingWeight = Math.max(0, -radialZ);
  const opening = swarm.opening * openingWeight * 1.2;

  const diversionSide = baseX >= 0 ? 1 : -1;
  const diversionX = swarm.baitDiversion * (2.8 + diversionSide * 0.48);
  const diversionZ = swarm.baitDiversion * -2.2;
  const lunge = swarm.attack * (0.72 + (variant.group % 2) * 0.18);
  const pull = swarm.netPull * Math.max(0, 1 - variant.group * 0.22);
  const pulseOffset = Math.sin(
    safeTime * variant.speed * 1.7 + variant.motionPhase,
  ) * 0.08;

  const inward = lunge + pull * 0.7;
  output.x = baseX
    + radialX * (outer - inward + opening)
    + diversionX;
  output.z = baseZ
    + radialZ * (outer - inward + opening * 0.2)
    + diversionZ;
  const travelX = -sine * variant.radiusX;
  const travelZ = cosine * variant.radiusZ;
  output.yaw = Math.atan2(travelX, travelZ);
  output.pitch = pulseOffset * 0.35;
  output.roll = variant.roll + pulseOffset;
  output.scale = variant.scale;
}

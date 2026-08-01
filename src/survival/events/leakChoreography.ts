export const LEAK_REVEAL_DURATION = 2.4;
export const LEAK_ITEM_DURATION = 1.1;
export const LEAK_REACTION_DURATION = 1;

export type LeakItemEffectKind =
  | 'none'
  | 'press-patch'
  | 'bail-water'
  | 'wedge-map';

export type LeakReactionKind =
  | 'safe'
  | 'broken-item'
  | 'consumed-item'
  | 'hull-damage'
  | 'lost-item';

export interface LeakReactionState {
  readonly safe: boolean;
  readonly brokenItem: boolean;
  readonly consumedItem?: boolean;
  readonly hullDamage: boolean;
  readonly lostItem: boolean;
}

export interface LeakSample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  jetStrength: number;
  dripStrength: number;
  splashStrength: number;
  interiorWater: number;
  wetBand: number;
  effect: number;
  cameraPush: number;
  boatKick: number;
  surgeStrength: number;
  effectKind: LeakItemEffectKind;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function pulse(progress: number, start: number, peak: number, end: number): number {
  if (progress <= start || progress >= end) return 0;
  return progress < peak
    ? smoothstep((progress - start) / (peak - start))
    : 1 - smoothstep((progress - peak) / (end - peak));
}

function resetLeakSample(output: LeakSample): void {
  output.x = 0;
  output.y = 0;
  output.z = 0;
  output.yaw = 0;
  output.pitch = 0;
  output.roll = 0;
  output.scaleX = 1;
  output.scaleY = 1;
  output.scaleZ = 1;
  output.jetStrength = 0;
  output.dripStrength = 0;
  output.splashStrength = 0;
  output.interiorWater = 0;
  output.wetBand = 0;
  output.effect = 0;
  output.cameraPush = 0;
  output.boatKick = 0;
  output.surgeStrength = 0;
  output.effectKind = 'none';
}

export function identityLeakSample(): LeakSample {
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
    jetStrength: 0,
    dripStrength: 0,
    splashStrength: 0,
    interiorWater: 0,
    wetBand: 0,
    effect: 0,
    cameraPush: 0,
    boatKick: 0,
    surgeStrength: 0,
    effectKind: 'none',
  };
}

export function sampleLeakReveal(progress: number, output: LeakSample): boolean {
  resetLeakSample(output);
  const t = clamp01(progress);
  if (t === 0) return true;

  const open = smoothstep(t / 0.34);
  const impact = pulse(t, 0.18, 0.54, 0.82);
  output.jetStrength = open * (1 + impact * 0.18);
  output.dripStrength = smoothstep((t - 0.38) / 0.62) * 0.28;
  output.splashStrength = pulse(t, 0.18, 0.5, 0.88);
  output.interiorWater = smoothstep((t - 0.24) / 0.7) * 0.72;
  output.wetBand = smoothstep(t / 0.42);
  output.cameraPush = pulse(t, 0.2, 0.56, 0.88) * 0.14;
  return true;
}

export function sampleLeakItemUse(
  choiceId: string,
  progress: number,
  output: LeakSample,
): boolean {
  resetLeakSample(output);
  if (choiceId !== 'ductTape' && choiceId !== 'bucket' && choiceId !== 'map') return false;

  const t = clamp01(progress);
  if (t === 0 || t === 1) return true;
  const lift = Math.min(
    smoothstep(t / 0.3),
    1 - smoothstep((t - 0.74) / 0.26),
  );
  const action = pulse(t, 0.2, 0.62, 0.9);
  output.jetStrength = 1;
  output.dripStrength = 0.28;
  output.interiorWater = 0.72;
  output.wetBand = 1;

  switch (choiceId) {
    case 'ductTape':
      output.x = 0.7 * lift;
      output.y = 0.4 * lift;
      output.z = -0.28 * lift;
      output.yaw = -0.22 * lift;
      output.pitch = -0.62 * action;
      output.roll = 0.1 * lift;
      output.scaleX = 1 + action * 0.16;
      output.scaleZ = 1 + action * 0.1;
      output.jetStrength = 1 - action * 0.72;
      output.effect = action;
      output.effectKind = 'press-patch';
      break;
    case 'bucket':
      output.x = 0.48 * lift;
      output.y = 0.58 * lift;
      output.z = -0.18 * lift;
      output.pitch = -0.82 * action;
      output.roll = -0.32 * lift + 0.16 * action;
      output.splashStrength = action;
      output.interiorWater = 0.72 - action * 0.2;
      output.effect = action;
      output.effectKind = 'bail-water';
      break;
    case 'map':
      output.x = 0.64 * lift;
      output.y = 0.34 * lift;
      output.z = -0.3 * lift;
      output.yaw = 0.18 * lift;
      output.pitch = -0.46 * action;
      output.roll = 0.24 * action;
      output.scaleX = 1 + action * 0.2;
      output.scaleY = 1 - action * 0.12;
      output.jetStrength = 1 - action * 0.5;
      output.effect = action;
      output.effectKind = 'wedge-map';
      break;
  }
  return true;
}

function reactionFlags(
  reaction: LeakReactionKind | Readonly<LeakReactionState>,
): number {
  if (typeof reaction !== 'string') {
    return (reaction.safe ? 1 : 0)
      | (reaction.brokenItem ? 2 : 0)
      | (reaction.hullDamage ? 4 : 0)
      | (reaction.lostItem ? 8 : 0)
      | (reaction.consumedItem ? 16 : 0);
  }
  switch (reaction) {
    case 'safe': return 1;
    case 'broken-item': return 2;
    case 'consumed-item': return 16;
    case 'hull-damage': return 4;
    case 'lost-item': return 8;
  }
}

export function sampleLeakReaction(
  reaction: LeakReactionKind | Readonly<LeakReactionState>,
  progress: number,
  output: LeakSample,
): boolean {
  resetLeakSample(output);
  const flags = reactionFlags(reaction);
  const t = clamp01(progress);
  if (t === 0) return true;
  const settle = smoothstep(t / 0.72);
  const hullDamage = (flags & 4) !== 0;
  const safe = (flags & 1) !== 0 && !hullDamage;

  output.wetBand = 1;
  output.interiorWater = safe ? 0.54 : 0.78;
  output.jetStrength = safe ? 1 - settle * 0.88 : 1;
  output.dripStrength = safe ? 0.28 + settle * 0.62 : 0.3;

  if (hullDamage) {
    const impact = pulse(t, 0.06, 0.42, 0.86);
    output.surgeStrength = impact;
    output.jetStrength += impact * 0.58;
    output.splashStrength = impact;
    output.boatKick = Math.sin(Math.PI * t) * impact * 0.13;
    output.cameraPush = impact * 0.09;
  }

  if ((flags & 8) !== 0) {
    const departure = smoothstep((t - 0.06) / 0.86);
    output.x = 2.8 * departure;
    output.y = 0.46 * departure;
    output.z = -0.82 * departure;
    output.yaw = 1.18 * departure;
    output.pitch = -0.24 * departure;
    output.roll = -0.72 * departure;
  } else if ((flags & 2) !== 0) {
    const buckle = smoothstep((t - 0.06) / 0.62);
    output.y = -0.2 * buckle;
    output.roll = 0.34 * buckle;
    output.pitch = -0.16 * buckle;
    output.scaleX = 1 + 0.08 * buckle;
    output.scaleY = 1 - 0.32 * buckle;
    output.scaleZ = 1 + 0.06 * buckle;
  } else if ((flags & 16) !== 0) {
    const press = smoothstep((t - 0.04) / 0.7);
    output.x = 0.74 * press;
    output.y = 0.36 * press;
    output.z = -0.3 * press;
    output.yaw = -0.2 * press;
    output.pitch = -0.68 * press;
    output.roll = 0.08 * press;
    output.scaleX = 1 + 0.24 * press;
    output.scaleY = 1 - 0.74 * press;
    output.scaleZ = 1 + 0.12 * press;
  }
  return true;
}

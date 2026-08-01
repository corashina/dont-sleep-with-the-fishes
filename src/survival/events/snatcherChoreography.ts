export const SNATCHER_REVEAL_DURATION = 2.5;
export const SNATCHER_ITEM_DURATION = 1.15;
export const SNATCHER_REACTION_DURATION = 1.2;

export type SnatcherItemEffectKind =
  | 'none'
  | 'telescope-club'
  | 'ring-throw'
  | 'late-net'
  | 'harpoon-recoil';

export interface SnatcherReactionState {
  readonly targetLost: boolean;
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
  warningStrength: number;
  backwardGlance: number;
  recoilStrength: number;
  targetAtRail: number;
  targetDeparture: number;
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
  effectKind: SnatcherItemEffectKind;
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
  output.warningStrength = 0;
  output.backwardGlance = 0;
  output.recoilStrength = 0;
  output.targetAtRail = 0;
  output.targetDeparture = 0;
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

function holdCrouchedThreat(output: SnatcherSample): void {
  output.fingerVisibility = 1;
  output.headVisibility = 1;
  output.pointStrength = 1;
  output.crouchStrength = 1;
  output.warningStrength = 1;
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
    warningStrength: 0,
    backwardGlance: 0,
    recoilStrength: 0,
    targetAtRail: 0,
    targetDeparture: 0,
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

export function sampleSnatcherReveal(
  progress: number,
  output: SnatcherSample,
): boolean {
  resetSnatcherSample(output);
  const t = clamp01(progress);
  output.warningStrength = 0.74;
  if (t === 0) return true;

  output.fingerVisibility = smoothstep((t - 0.04) / 0.24);
  output.headVisibility = smoothstep((t - 0.3) / 0.28);
  output.crouchStrength = smoothstep((t - 0.28) / 0.34);
  output.pointStrength = smoothstep((t - 0.37) / 0.24);
  output.warningStrength += pulse(t, 0.34, 0.58, 0.84) * 0.26;
  output.creatureY = -0.16 * output.crouchStrength;
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
  if (
    choiceId !== 'spyglass'
    && choiceId !== 'swimRing'
    && choiceId !== 'fishingNet'
    && choiceId !== 'harpoonGun'
  ) {
    return false;
  }

  holdCrouchedThreat(output);
  const t = clamp01(progress);
  if (t === 0 || t === 1) return true;
  const lift = Math.min(
    smoothstep(t / 0.24),
    1 - smoothstep((t - 0.8) / 0.2),
  );
  const action = pulse(t, 0.16, 0.56, 0.9);

  switch (choiceId) {
    case 'spyglass':
      output.itemX = 0.72 * lift;
      output.itemY = 0.78 * lift;
      output.itemZ = -0.2 * lift;
      output.itemYaw = 0.36 * lift;
      output.itemPitch = -0.28 * lift;
      output.itemRoll = -1.12 * action;
      output.effectStrength = action;
      output.effectKind = 'telescope-club';
      output.creatureRoll -= action * 0.16;
      break;
    case 'swimRing': {
      const travel = pulse(t, 0.12, 0.62, 0.96);
      output.itemX = 2.15 * travel;
      output.itemY = (0.52 + Math.sin(Math.PI * t) * 0.82) * travel;
      output.itemZ = -0.46 * travel;
      output.itemYaw = 1.7 * travel;
      output.itemRoll = -0.7 * travel;
      output.effectStrength = travel;
      output.effectKind = 'ring-throw';
      break;
    }
    case 'fishingNet': {
      const lateCast = smoothstep((t - 0.56) / 0.25)
        * (1 - smoothstep((t - 0.88) / 0.12));
      output.itemX = 0.46 * lift + lateCast * 1.2;
      output.itemY = 0.54 * lift + lateCast * 0.38;
      output.itemZ = -0.18 * lift;
      output.itemPitch = -0.42 * lift;
      output.itemRoll = 0.22 * lift - lateCast * 0.5;
      output.itemScaleX = 1 + lateCast * 0.38;
      output.itemScaleZ = 1 + lateCast * 0.24;
      output.effectStrength = lateCast;
      output.effectKind = 'late-net';
      break;
    }
    case 'harpoonGun':
      output.recoilStrength = action;
      output.itemX = 0.84 * lift - action * 0.32;
      output.itemY = 0.64 * lift + action * 0.08;
      output.itemZ = -0.24 * lift;
      output.itemYaw = -0.2 * lift;
      output.itemPitch = -0.18 * lift + action * 0.3;
      output.itemRoll = action * 0.15;
      output.effectStrength = action;
      output.effectKind = 'harpoon-recoil';
      output.creatureX = action * 0.16;
      output.creatureRoll -= action * 0.12;
      break;
  }
  return true;
}

export function sampleSnatcherReaction(
  reaction: Readonly<SnatcherReactionState>,
  progress: number,
  output: SnatcherSample,
): boolean {
  resetSnatcherSample(output);
  holdCrouchedThreat(output);
  const t = clamp01(progress);
  if (t === 0) return true;

  if (!reaction.targetLost) {
    const retreat = smoothstep((t - 0.18) / 0.72);
    output.pointStrength = 1 - retreat * 0.54;
    output.creatureX = retreat * 0.34;
    output.creatureY = -0.16 - retreat * 0.08;
    output.warningStrength = 1 - retreat * 0.26;
    return true;
  }

  const railApproach = smoothstep(t / 0.32);
  const departure = smoothstep((t - 0.58) / 0.32);
  output.targetAtRail = t >= 0.32 && t <= 0.58 ? 1 : 1 - departure;
  output.targetDeparture = departure;
  output.itemX = railApproach * 1.16 + departure * 2.75;
  output.itemY = railApproach * 0.58 + departure * 0.72;
  output.itemZ = railApproach * -0.34 - departure * 0.82;
  output.itemYaw = railApproach * 0.52 + departure * 1.48;
  output.itemPitch = -railApproach * 0.18;
  output.itemRoll = railApproach * 0.16 - departure * 0.82;
  output.backwardGlance = pulse(t, 0.64, 0.84, 1);
  output.creatureYaw = -output.backwardGlance * 0.72;
  output.creatureX = departure * 0.62;
  output.creatureY = -0.16 + departure * 0.16;
  output.pointStrength = 1 - departure * 0.82;
  output.warningStrength = 1 - departure * 0.62;
  return true;
}

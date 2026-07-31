export const WHIRLPOOL_REVEAL_DURATION = 3;
export const WHIRLPOOL_ITEM_DURATION = 1.25;
export const WHIRLPOOL_REACTION_DURATION = 1.4;

export type WhirlpoolItemEffectKind =
  | 'none'
  | 'anchor-catch'
  | 'ring-compression';

export interface WhirlpoolReactionState {
  readonly hullDamage: number;
  readonly anchorBroken: boolean;
  readonly ringBroken: boolean;
  readonly lostItemCount: number;
}

export interface WhirlpoolSample {
  vortexStrength: number;
  vortexDepression: number;
  vortexTangentStrength: number;
  vortexPhase: number;
  foamStrength: number;
  debrisPull: number;
  cameraRoll: number;
  boatYaw: number;
  boatRoll: number;
  anchorCatch: number;
  chainTension: number;
  chainSnap: number;
  ringCompression: number;
  ringSlip: number;
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
  effectKind: WhirlpoolItemEffectKind;
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

export function resetWhirlpoolSample(output: WhirlpoolSample): void {
  output.vortexStrength = 0;
  output.vortexDepression = 0;
  output.vortexTangentStrength = 0;
  output.vortexPhase = 0;
  output.foamStrength = 0;
  output.debrisPull = 0;
  output.cameraRoll = 0;
  output.boatYaw = 0;
  output.boatRoll = 0;
  output.anchorCatch = 0;
  output.chainTension = 0;
  output.chainSnap = 0;
  output.ringCompression = 0;
  output.ringSlip = 0;
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
  output.effectKind = 'none';
}

function holdVortex(output: WhirlpoolSample): void {
  output.vortexStrength = 1;
  output.vortexDepression = 1.18;
  output.vortexTangentStrength = 0.86;
  output.vortexPhase = Math.PI * 5.5;
  output.foamStrength = 1;
  output.debrisPull = 1;
}

export function createWhirlpoolSample(): WhirlpoolSample {
  const sample = {} as WhirlpoolSample;
  resetWhirlpoolSample(sample);
  return sample;
}

export const identityWhirlpoolSample = createWhirlpoolSample;

export function sampleWhirlpoolReveal(
  progress: number,
  output: WhirlpoolSample,
): boolean {
  resetWhirlpoolSample(output);
  const t = clamp01(progress);
  const firstBeat = smoothstep(t / 0.3) * 0.32;
  const secondBeat = smoothstep((t - 0.3) / 0.27) * 0.35;
  const thirdBeat = smoothstep((t - 0.57) / 0.3) * 0.33;
  const pull = firstBeat + secondBeat + thirdBeat;

  output.vortexStrength = pull;
  output.vortexDepression = 1.18 * smoothstep((t - 0.06) / 0.78);
  output.vortexTangentStrength = 0.86 * smoothstep((t - 0.12) / 0.7);
  output.vortexPhase = Math.PI * 5.5 * smoothstep(t);
  output.foamStrength = smoothstep((t - 0.03) / 0.52);
  output.debrisPull = smoothstep((t - 0.14) / 0.7);

  const heavyTurn = smoothstep((t - 0.62) / 0.28);
  output.boatYaw = -0.17 * heavyTurn;
  output.boatRoll = 0.035 * heavyTurn;
  output.cameraRoll = pulse(t, 0.58, 0.78, 0.98) * -0.035;
  return true;
}

export function sampleWhirlpoolItemUse(
  choiceId: string,
  progress: number,
  output: WhirlpoolSample,
): boolean {
  resetWhirlpoolSample(output);
  if (choiceId !== 'anchor' && choiceId !== 'swimRing') return false;
  holdVortex(output);
  const t = clamp01(progress);
  const lift = Math.min(
    smoothstep(t / 0.24),
    1 - smoothstep((t - 0.82) / 0.18),
  );
  const action = pulse(t, 0.12, 0.62, 0.94);

  if (choiceId === 'anchor') {
    output.anchorCatch = action;
    output.chainTension = smoothstep(t / 0.58)
      * (1 - smoothstep((t - 0.88) / 0.12));
    output.itemX = 0.18 * lift;
    output.itemY = -0.72 * action;
    output.itemZ = -0.26 * lift;
    output.itemPitch = -0.34 * action;
    output.itemRoll = 0.12 * lift;
    output.boatYaw = -0.17 * (1 - action * 0.72);
    output.boatRoll = -0.045 * action;
    output.cameraRoll = -0.022 * action;
    output.effectKind = 'anchor-catch';
  } else {
    output.ringCompression = action;
    output.ringSlip = smoothstep((t - 0.48) / 0.42);
    output.itemX = 0.82 * lift;
    output.itemY = -0.2 * action;
    output.itemZ = -0.34 * lift;
    output.itemYaw = -0.34 * lift;
    output.itemPitch = 0.24 * action;
    output.itemRoll = -0.42 * action;
    output.itemScaleX = 1 + action * 0.22;
    output.itemScaleY = 1 - action * 0.64;
    output.itemScaleZ = 1 + action * 0.12;
    output.boatYaw = -0.17 + action * 0.04;
    output.boatRoll = 0.055 * action;
    output.effectKind = 'ring-compression';
  }
  return true;
}

export function sampleWhirlpoolReaction(
  reaction: Readonly<WhirlpoolReactionState>,
  progress: number,
  output: WhirlpoolSample,
): boolean {
  resetWhirlpoolSample(output);
  holdVortex(output);
  const t = clamp01(progress);
  const damage = Number.isFinite(reaction.hullDamage)
    ? Math.max(0, -reaction.hullDamage)
    : 0;
  const lostCount = Number.isFinite(reaction.lostItemCount)
    ? Math.max(0, Math.min(2, Math.trunc(reaction.lostItemCount)))
    : 0;
  const severe = damage >= 60 || lostCount === 2;

  if (reaction.anchorBroken) {
    output.chainTension = 1 - smoothstep((t - 0.24) / 0.32);
    output.chainSnap = pulse(t, 0.18, 0.42, 0.84);
    output.boatYaw = -0.17 - output.chainSnap * 0.11;
    output.boatRoll = output.chainSnap * 0.11;
    output.cameraRoll = output.chainSnap * 0.055;
  } else if (reaction.ringBroken) {
    const tear = smoothstep((t - 0.08) / 0.62);
    output.ringCompression = 1 - tear * 0.42;
    output.ringSlip = tear;
    output.itemX = 1.18 * tear;
    output.itemY = -0.34 * tear;
    output.itemZ = -0.66 * tear;
    output.itemRoll = -1.2 * tear;
    output.itemScaleX = 1 + tear * 0.34;
    output.itemScaleY = 1 - tear * 0.78;
    output.itemScaleZ = 1 + tear * 0.16;
    output.boatYaw = -0.17;
    output.boatRoll = 0.08 * tear;
  } else if (!severe) {
    const release = smoothstep((t - 0.12) / 0.76);
    output.vortexStrength = 1 - release * 0.52;
    output.vortexDepression = 1.18 - release * 0.5;
    output.vortexTangentStrength = 0.86 - release * 0.46;
    output.foamStrength = 1 - release * 0.42;
    output.debrisPull = 1 - release * 0.34;
    output.boatYaw = -0.17 * (1 - release);
  }

  if (damage > 0 && !severe) {
    const hit = pulse(t, 0.08, 0.38, 0.82);
    output.boatRoll += hit * Math.min(0.14, damage * 0.0026);
    output.cameraRoll += hit * Math.min(0.065, damage * 0.0012);
  }

  if (severe) {
    const roll = pulse(t, 0.04, 0.48, 0.94);
    const heldAngle = smoothstep((t - 0.16) / 0.32)
      * (1 - smoothstep((t - 0.72) / 0.28));
    const release = smoothstep((t - 0.72) / 0.28);
    output.boatYaw = -0.17 - roll * 0.24;
    output.boatRoll = heldAngle === 0 ? 0 : -0.42 * heldAngle;
    output.cameraRoll = -0.14 * roll;
    output.supplyTravel = smoothstep((t - 0.14) / 0.62);
    output.vortexStrength = 1 - release * 0.82;
    output.vortexDepression = 1.18 - release * 0.76;
    output.vortexTangentStrength = 0.86 - release * 0.58;
    output.foamStrength = 1 - release * 0.54;
    output.debrisPull = 1 - release * 0.42;
  }
  return true;
}

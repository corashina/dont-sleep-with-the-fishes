export const WHIRLPOOL_REVEAL_DURATION = 3;
export const WHIRLPOOL_ITEM_DURATION = 1.25;
export const WHIRLPOOL_REACTION_DURATION = 1.4;

export type WhirlpoolItemEffectKind =
  | 'none'
  | 'anchor-cast'
  | 'ring-cast';

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
  streamStrength: number;
  streamFlow: number;
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
  output.streamStrength = 0;
  output.streamFlow = 0;
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
  output.vortexDepression = 1.55;
  output.vortexTangentStrength = 1.08;
  output.vortexPhase = Math.PI * 5.5;
  output.streamStrength = 1;
  output.streamFlow = 1;
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
  output.vortexDepression = 1.55 * smoothstep((t - 0.06) / 0.78);
  output.vortexTangentStrength = 1.08 * smoothstep((t - 0.12) / 0.7);
  output.vortexPhase = Math.PI * 5.5 * smoothstep(t);
  output.streamStrength = smoothstep((t - 0.09) / 0.58);
  output.streamFlow = smoothstep((t - 0.03) / 0.8);
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
  const action = pulse(t, 0.08, 0.6, 0.96);

  output.itemX = 0.7 * action;
  output.itemY = 0.24 * action;
  output.itemZ = -0.62 * action;
  output.itemYaw = -0.38 * action;
  output.itemPitch = -0.24 * action;
  output.itemRoll = choiceId === 'anchor' ? 0.26 * action : -0.48 * action;
  output.itemScaleX = 1 - action * 0.08;
  output.itemScaleY = 1 - action * 0.08;
  output.itemScaleZ = 1 - action * 0.08;
  output.effectKind = choiceId === 'anchor' ? 'anchor-cast' : 'ring-cast';
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

  if (reaction.anchorBroken || reaction.ringBroken) {
    const slip = smoothstep((t - 0.08) / 0.68);
    output.itemX = 1.08 * slip;
    output.itemY = 0.36 * slip;
    output.itemZ = -0.92 * slip;
    output.itemRoll = (reaction.anchorBroken ? 1.1 : -1.3) * slip;
    output.itemScaleX = 1 - slip * 0.22;
    output.itemScaleY = 1 - slip * 0.22;
    output.itemScaleZ = 1 - slip * 0.22;
  }

  if (lostCount > 0) {
    output.supplyTravel = smoothstep((t - 0.12) / 0.7);
  }

  const releaseStart = severe ? 0.7 : 0.22;
  const release = smoothstep((t - releaseStart) / (1 - releaseStart));
  output.vortexStrength = 1 - release * (severe ? 0.76 : 0.48);
  output.vortexDepression = 1.55 - release * (severe ? 0.82 : 0.56);
  output.vortexTangentStrength = 1.08 - release * (severe ? 0.58 : 0.42);
  output.streamStrength = 1 - release * (severe ? 0.62 : 0.38);
  output.streamFlow = 1 - release * 0.2;
  return true;
}

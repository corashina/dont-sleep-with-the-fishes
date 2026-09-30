import { clamp01, smoothstep } from '../animationMath';

export const WHIRLPOOL_REVEAL_DURATION = 3.6;
export const WHIRLPOOL_ITEM_DURATION = 4;
export const WHIRLPOOL_REACTION_DURATION = 2.6;

export interface WhirlpoolReactionState {
  readonly lostItemCount: number;
}

export interface WhirlpoolSample {
  /** Vortex depth and foam, 0 for calm sea. */
  strength: number;
  /** Lost supplies spiral from the boat into the throat. */
  supplyTravel: number;
}

export function createWhirlpoolSample(): WhirlpoolSample {
  const sample = {} as WhirlpoolSample;
  resetWhirlpoolSample(sample);
  return sample;
}

export function resetWhirlpoolSample(output: WhirlpoolSample): void {
  output.strength = 0;
  output.supplyTravel = 0;
}

export function sampleWhirlpoolReveal(output: WhirlpoolSample): void {
  resetWhirlpoolSample(output);
  output.strength = 1;
}

export function sampleWhirlpoolItemUse(output: WhirlpoolSample): void {
  resetWhirlpoolSample(output);
  output.strength = 1;
}

export function sampleWhirlpoolReaction(
  reaction: Readonly<WhirlpoolReactionState>,
  progress: number,
  output: WhirlpoolSample,
): void {
  resetWhirlpoolSample(output);
  const t = clamp01(progress);
  output.strength = 1;
  if (reaction.lostItemCount > 0) output.supplyTravel = smoothstep((t - 0.1) / 0.85);
}

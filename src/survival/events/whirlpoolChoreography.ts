import { clamp01, pulse, smoothstep } from '../animationMath';

export const WHIRLPOOL_REVEAL_DURATION = 3.6;
export const WHIRLPOOL_ITEM_DURATION = 4;
export const WHIRLPOOL_REACTION_DURATION = 2.6;

export interface WhirlpoolReactionState {
  readonly hullDamage: number;
  readonly lostItemCount: number;
}

export interface WhirlpoolSample {
  /** Vortex depth and foam, 0 for calm sea. */
  strength: number;
  /** Boat drag along the rim, 0 at rest. */
  drag: number;
  /** Short inward jolt when the whirlpool hits the boat. */
  lurch: number;
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
  output.drag = 0;
  output.lurch = 0;
  output.supplyTravel = 0;
}

export function sampleWhirlpoolReveal(progress: number, output: WhirlpoolSample): void {
  resetWhirlpoolSample(output);
  const t = clamp01(progress);
  output.strength = smoothstep(t / 0.75);
  output.drag = smoothstep((t - 0.3) / 0.7);
}

export function sampleWhirlpoolItemUse(output: WhirlpoolSample): void {
  resetWhirlpoolSample(output);
  output.strength = 1;
  output.drag = 1;
}

export function sampleWhirlpoolReaction(
  reaction: Readonly<WhirlpoolReactionState>,
  progress: number,
  output: WhirlpoolSample,
): void {
  resetWhirlpoolSample(output);
  const t = clamp01(progress);
  output.strength = 1;
  const hit = reaction.hullDamage < 0 || reaction.lostItemCount > 0;
  // Every outcome ends with the boat released at rest; a hit drags it first.
  output.drag = hit
    ? 1 + pulse(t, 0, 0.3, 0.75) * 0.4 - smoothstep((t - 0.45) / 0.55)
    : 1 - smoothstep((t - 0.1) / 0.8);
  output.lurch = hit ? pulse(t, 0.08, 0.26, 0.6) : 0;
  if (reaction.lostItemCount > 0) output.supplyTravel = smoothstep((t - 0.1) / 0.85);
}

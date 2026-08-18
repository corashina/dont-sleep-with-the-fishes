import { clamp01, pulse, smoothstep } from '../animationMath';

export const TORNADO_REVEAL_DURATION = 3;
export const TORNADO_ITEM_DURATION = 4;
export const TORNADO_REACTION_DURATION = 1.4;

export type TornadoItemEffectKind =
  | 'none'
  | 'anchor-cast'
  | 'ring-cast';

export interface TornadoReactionState {
  readonly hullDamage: number;
  readonly anchorBroken: boolean;
  readonly ringBroken: boolean;
  readonly lostItemCount: number;
}

export interface TornadoSample {
  visibility: number;
  funnelScale: number;
  spinRate: number;
  spinPhase: number;
  sway: number;
  effectStrength: number;
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
  effectKind: TornadoItemEffectKind;
}

export function resetTornadoSample(output: TornadoSample): void {
  output.visibility = 0;
  output.funnelScale = 0;
  output.spinRate = 0;
  output.spinPhase = 0;
  output.sway = 0;
  output.effectStrength = 0;
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

function holdTornado(output: TornadoSample): void {
  output.visibility = 1;
  output.funnelScale = 1;
  output.spinRate = 1;
  output.spinPhase = 1;
  output.sway = 1;
  output.effectStrength = 1;
}

export function createTornadoSample(): TornadoSample {
  const sample = {} as TornadoSample;
  resetTornadoSample(sample);
  return sample;
}

export function sampleTornadoReveal(
  _progress: number,
  output: TornadoSample,
): boolean {
  resetTornadoSample(output);
  holdTornado(output);
  return true;
}

export function sampleTornadoItemUse(
  choiceId: string,
  progress: number,
  output: TornadoSample,
): boolean {
  resetTornadoSample(output);
  if (choiceId !== 'anchor' && choiceId !== 'swimRing') return false;
  holdTornado(output);
  const action = pulse(clamp01(progress), 0.08, 0.6, 0.96);

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

export function sampleTornadoReaction(
  reaction: Readonly<TornadoReactionState>,
  progress: number,
  output: TornadoSample,
): boolean {
  resetTornadoSample(output);
  holdTornado(output);
  const t = clamp01(progress);
  const lostCount = Number.isFinite(reaction.lostItemCount)
    ? Math.max(0, Math.min(2, Math.trunc(reaction.lostItemCount)))
    : 0;

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

  const effect = 1 - smoothstep((t - 0.02) / 0.52);
  const spin = 1 - smoothstep((t - 0.08) / 0.65);
  const lateOpacity = 1 - smoothstep((t - 0.62) / 0.38);
  output.visibility = lateOpacity;
  output.funnelScale = 1;
  output.spinRate = spin;
  output.spinPhase = spin;
  output.sway = spin;
  output.effectStrength = effect;
  return true;
}

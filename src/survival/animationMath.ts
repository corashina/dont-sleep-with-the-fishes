export function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

export function smoothstep(value: number): number {
  const progress = clamp01(value);
  return progress * progress * (3 - 2 * progress);
}

export function pulse(progress: number, start: number, peak: number, end: number): number {
  if (progress <= start || progress >= end) return 0;
  return progress < peak
    ? smoothstep((progress - start) / (peak - start))
    : 1 - smoothstep((progress - peak) / (end - peak));
}

export function clamp01Unchecked(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function smoothstepUnchecked(value: number): number {
  const progress = clamp01Unchecked(value);
  return progress * progress * (3 - 2 * progress);
}

export function keyedRevealProgress(progress: number): number {
  if (progress < 0.16) return -0.06 * Math.sin((progress / 0.16) * Math.PI);
  if (progress < 0.82) return smoothstepUnchecked((progress - 0.16) / 0.66) * 1.06;
  return 1.06 + (1 - 1.06) * smoothstepUnchecked((progress - 0.82) / 0.18);
}

export type TimedAnimation<
  Kind extends string,
  State extends object = object,
  Resolve extends (...args: never[]) => void = () => void,
> = {
  readonly kind: Kind;
  elapsed: number;
  readonly duration: number;
  readonly resolve: Resolve;
} & State;

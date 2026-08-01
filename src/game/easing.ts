export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function smootherStep(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

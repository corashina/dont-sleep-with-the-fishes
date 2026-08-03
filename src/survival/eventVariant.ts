export type EventSide = -1 | 1;

export function eventSideFromSeed(seed: number): EventSide {
  const normalized = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  return (normalized & 1) === 0 ? -1 : 1;
}

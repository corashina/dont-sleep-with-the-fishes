export const SCAVENGE_WALK_SPEED = 3.0;
export const SCAVENGE_SPRINT_SPEED = 8.4;

export function scavengeSpeedMultiplier(carriedWeight: number): number {
  if (!Number.isFinite(carriedWeight) || carriedWeight < 0) return 1;
  if (carriedWeight >= 3) return 0.76;
  if (carriedWeight >= 2) return 0.88;
  return 1;
}

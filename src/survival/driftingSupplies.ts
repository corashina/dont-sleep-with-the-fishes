export const DRIFTING_SUPPLY_KINDS = Object.freeze([
  'barrel',
  'lifeboat',
  'container',
] as const);

export type DriftingSupplyKind = typeof DRIFTING_SUPPLY_KINDS[number];

export const DRIFTING_SUPPLY_DISTANCES = Object.freeze([
  'near',
  'middle',
  'far',
] as const);

export type DriftingSupplyDistance = typeof DRIFTING_SUPPLY_DISTANCES[number];

function normalizedSeed(seed: number): number {
  return Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;
}

export function driftingSupplyKindFromSeed(seed: number): DriftingSupplyKind {
  return DRIFTING_SUPPLY_KINDS[(normalizedSeed(seed) >>> 1) % DRIFTING_SUPPLY_KINDS.length]!;
}

export function driftingSupplyDistanceFromSeed(seed: number): DriftingSupplyDistance {
  return DRIFTING_SUPPLY_DISTANCES[
    (normalizedSeed(seed) >>> 5) % DRIFTING_SUPPLY_DISTANCES.length
  ]!;
}

export function isDriftingSupplyResult(
  resultId: string | undefined,
  kind: DriftingSupplyKind,
): boolean {
  return resultId?.startsWith(`drifting-supplies-${kind}-`) === true;
}

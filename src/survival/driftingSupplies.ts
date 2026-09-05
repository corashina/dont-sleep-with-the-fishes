import type { EventChoiceDefinition, WeightedEventOutcome } from './survivalTypes';

export const DRIFTING_SUPPLY_KINDS = Object.freeze([
  'barrel',
  'lifeboat',
  'container',
] as const);

export type DriftingSupplyKind = typeof DRIFTING_SUPPLY_KINDS[number];

export const DRIFTING_SUPPLY_PLAYER_ENERGY_COST = 1;
export const DRIFTING_SUPPLY_CARLITOS_ENERGY_COST = 2;

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

export function driftingSupplyChoiceForVariant(
  choice: EventChoiceDefinition,
  variantSeed: number,
): EventChoiceDefinition {
  if (choice.id === 'sleep') return choice;
  const kind = driftingSupplyKindFromSeed(variantSeed);
  const outcomes = choice.outcomes.filter(({ resultId }) => (
    isDriftingSupplyResult(resultId, kind)
  ));
  if (outcomes.length === 0) {
    throw new Error(`Drifting supplies have no ${kind} outcomes for ${choice.id}.`);
  }
  return {
    ...choice,
    get label() { return choice.label; },
    outcomes: outcomes as [WeightedEventOutcome, ...WeightedEventOutcome[]],
    ...(choice.requirements === undefined ? {} : {
      requirements: choice.requirements.map((requirement) => (
        requirement.resource === 'energy'
          ? { ...requirement, minimum: DRIFTING_SUPPLY_PLAYER_ENERGY_COST }
          : requirement
      )),
    }),
    ...(choice.companionAction === undefined ? {} : {
      companionAction: {
        ...choice.companionAction,
        energyCost: DRIFTING_SUPPLY_CARLITOS_ENERGY_COST,
      },
    }),
  };
}

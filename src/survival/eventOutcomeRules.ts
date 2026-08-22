import { nightDamageMultiplier } from './RunPressure';
import { SURVIVAL_BALANCE } from './survivalBalance';
import type {
  IntegerValue,
  RandomSource,
  ResourceEffect,
  SurvivalEventDefinition,
} from './survivalTypes';

interface SurvivalResources {
  readonly health: number;
  readonly hunger: number;
  readonly energy: number;
  readonly hull: number;
}

export function resolveIntegerValue(value: IntegerValue, random: RandomSource): number {
  if (typeof value === 'number') return value;
  return value.min + Math.floor(random.next() * (value.max - value.min + 1));
}

export function eventResourceDelta(
  effect: ResourceEffect & { readonly value: number },
  current: number,
  phase: SurvivalEventDefinition['phase'],
  day: number,
): number {
  const raw = effect.operation === 'set'
    ? effect.value - current
    : effect.operation === 'add' ? effect.value : -effect.value;
  return phase === 'night'
    && effect.operation === 'subtract'
    && (effect.resource === 'health' || effect.resource === 'hull')
    ? raw * nightDamageMultiplier(day)
    : raw;
}

export function clampSurvivalResources(resources: SurvivalResources): SurvivalResources {
  const maximum = SURVIVAL_BALANCE.thresholds.maximum;
  return {
    health: Math.min(maximum, Math.max(0, resources.health)),
    hunger: Math.min(maximum, Math.max(0, resources.hunger)),
    energy: Math.min(SURVIVAL_BALANCE.actions.maximumEnergy, Math.max(0, resources.energy)),
    hull: Math.min(maximum, Math.max(0, resources.hull)),
  };
}

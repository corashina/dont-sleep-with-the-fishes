import type { SurvivalEventDefinition } from './survivalTypes';

export const PRESSURE_DAYS = Object.freeze([8, 15, 25, 40] as const);
export const MAX_PRESSURE = PRESSURE_DAYS.length;

const QUIET_NIGHT_CHANCES = Object.freeze([0.30, 0.25, 0.20, 0.15, 0.10]);

export function pressureForDay(day: number): number {
  return PRESSURE_DAYS.filter((threshold) => day >= threshold).length;
}

export function pressureIncreaseForDay(day: number): 0 | 1 {
  return PRESSURE_DAYS.includes(day as typeof PRESSURE_DAYS[number]) ? 1 : 0;
}

export function quietNightChance(pressure: number): number {
  const index = Math.min(4, Math.max(0, Math.trunc(pressure)));
  return QUIET_NIGHT_CHANCES[index]!;
}

export function dangerousEventWeightMultiplier(pressure: number): number {
  return 1 + 0.25 * Math.min(4, Math.max(0, Math.trunc(pressure)));
}

export function weightedEventDrawWeight(
  event: Pick<SurvivalEventDefinition, 'danger' | 'weight'>,
  pressure: number,
): number {
  return event.danger === 'dangerous'
    ? event.weight * dangerousEventWeightMultiplier(pressure)
    : event.weight;
}

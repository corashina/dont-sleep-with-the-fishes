export const PRESSURE_DAYS = Object.freeze([8, 15, 25, 40] as const);
export const MAX_PRESSURE = PRESSURE_DAYS.length;
export const NIGHT_DAMAGE_DOUBLE_DAY = 50;

export function pressureForDay(day: number): number {
  return PRESSURE_DAYS.filter((threshold) => day >= threshold).length;
}

export function nightDamageMultiplier(day: number): 1 | 2 {
  return day >= NIGHT_DAMAGE_DOUBLE_DAY ? 2 : 1;
}

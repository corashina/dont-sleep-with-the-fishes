export const SURVIVAL_BALANCE = {
  start: { health: 100, hunger: 0, energy: 3, hull: 100 },
  dawn: { hungerIncrease: 18, starvationDamage: 15, normalEnergy: 3, hungryEnergy: 2, starvingEnergy: 1 },
  nightHullWear: { damage: 3, respiteInterval: 5 },
  thresholds: { hungry: 70, starving: 90, maximum: 100 },
  actions: {
    fishEnergy: 1, repairEnergy: 1, diveEnergy: 3,
    foodHunger: -35, repairHull: 25, tapeHull: 15, treatmentHealth: 30,
    maximumEnergy: 3,
    maximumStoredEnergy: 4,
  },
  fishing: {
    minimumBiteDelaySeconds: 3,
    biteDelayRangeSeconds: 4,
    reactionSeconds: 6,
  },
  diving: {
    success: 0.65, injury: 0.25, flashlightSuccess: 0.80,
    flashlightInjury: 0.18, injuryDamage: 50, overcastSuccessDelta: -0.05,
    overcastInjuryDelta: 0.05,
  },
  rescue: { firstEffectiveDay: 33, maximumLead: 8 },
  radio: {
    firstDay: 5,
    signalChance: 0.20,
    energy: 1,
    rescueLead: [2, 1, 1, 1, 1] as const,
  },
  dayEvents: {
    firstDay: 3,
    chance: 0.25,
  },
} as const;

export function radioRescueLeadForSignal(sentSignals: number): number {
  const gains = SURVIVAL_BALANCE.radio.rescueLead;
  return gains[Math.min(sentSignals, gains.length - 1)]!;
}

export type RepairEnergyCost = 0 | 1 | 2 | 3;

export type RescueLead = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface RescueChanceStep {
  readonly firstDay: number;
  readonly chance: number;
}

export const RESCUE_CHANCE_STEPS: readonly RescueChanceStep[] = Object.freeze([
  Object.freeze({ firstDay: 33, chance: 0.01 }),
  Object.freeze({ firstDay: 35, chance: 0.05 }),
  Object.freeze({ firstDay: 38, chance: 0.15 }),
  Object.freeze({ firstDay: 41, chance: 0.32 }),
  Object.freeze({ firstDay: 44, chance: 0.55 }),
  Object.freeze({ firstDay: 47, chance: 0.72 }),
]);

export function validateRescueChanceSteps(
  steps: readonly RescueChanceStep[],
): void {
  if (steps.length === 0
    || steps[0]?.firstDay !== SURVIVAL_BALANCE.rescue.firstEffectiveDay) {
    throw new Error('Rescue chance must start on the first effective day.');
  }
  let previousDay = 0;
  let previousChance = 0;
  for (const step of steps) {
    if (!Number.isInteger(step.firstDay) || step.firstDay <= previousDay) {
      throw new Error('Rescue chance days must be ascending integers.');
    }
    if (!Number.isFinite(step.chance) || step.chance <= 0 || step.chance >= 1) {
      throw new Error('Rescue chance must be between zero and one.');
    }
    if (step.chance < previousChance) {
      throw new Error('Rescue chance cannot decrease.');
    }
    previousDay = step.firstDay;
    previousChance = step.chance;
  }
}

export function clampRescueLead(value: number): RescueLead {
  return Math.min(
    SURVIVAL_BALANCE.rescue.maximumLead,
    Math.max(0, Math.trunc(value)),
  ) as RescueLead;
}

export function rescueChanceForDay(realDay: number, rescueLead: number): number {
  const effectiveDay = realDay + clampRescueLead(rescueLead);
  let chance = 0;
  for (const step of RESCUE_CHANCE_STEPS) {
    if (effectiveDay < step.firstDay) break;
    chance = step.chance;
  }
  return chance;
}

validateRescueChanceSteps(RESCUE_CHANCE_STEPS);

const QUIET_NIGHT_CHANCES = Object.freeze([0.30, 0.25, 0.20, 0.15, 0.10]);

export function quietNightChance(pressure: number): number {
  const index = Math.min(4, Math.max(0, Math.trunc(pressure)));
  return QUIET_NIGHT_CHANCES[index]!;
}

export function nightlyHullWearDamage(completedDay: number): number {
  return completedDay % SURVIVAL_BALANCE.nightHullWear.respiteInterval === 0
    ? 0
    : SURVIVAL_BALANCE.nightHullWear.damage;
}

export function repairEnergyCost(hull: number): RepairEnergyCost {
  if (hull >= SURVIVAL_BALANCE.thresholds.maximum) return 0;
  return SURVIVAL_BALANCE.actions.repairEnergy;
}

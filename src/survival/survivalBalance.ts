export const SURVIVAL_BALANCE = {
  start: { health: 100, hunger: 20, energy: 3, hull: 75 },
  dawn: { hungerIncrease: 18, starvationDamage: 15, normalEnergy: 3, hungryEnergy: 2, starvingEnergy: 1 },
  thresholds: { hungry: 70, starving: 90, maximum: 100 },
  actions: {
    fishEnergy: 1, diveEnergy: 3, repairEnergy: 2,
    foodHunger: -35, repairHull: 25, tapeHull: 15, treatmentHealth: 30,
    bottledPaperEnergy: 1, bottledPaperRescueProgress: 15, maximumEnergy: 3,
  },
  fishing: {
    minimumBiteDelaySeconds: 3,
    biteDelayRangeSeconds: 4,
    reactionSeconds: 1.5,
  },
  diving: {
    success: 0.65, injury: 0.25, flashlightSuccess: 0.80,
    flashlightInjury: 0.10, injuryDamage: 10, overcastSuccessDelta: -0.05,
    overcastInjuryDelta: 0.05,
  },
  night: { quietChance: 0.25 },
  rescue: { firstDay: 5, initialChance: 0.05, dailyIncrease: 0.08, chanceCap: 0.60, progressCap: 25 },
} as const;

export const SURVIVAL_BALANCE = {
  start: { health: 100, hunger: 20, energy: 4, hull: 75 },
  dawn: { hungerIncrease: 18, starvationDamage: 15, normalEnergy: 4, hungryEnergy: 3, starvingEnergy: 2 },
  thresholds: { hungry: 70, starving: 90, maximum: 100 },
  actions: {
    fishEnergy: 2, diveEnergy: 3, repairEnergy: 2,
    foodHunger: -35, repairHull: 25, tapeHull: 15, treatmentHealth: 30, restEnergy: 2,
    bottledPaperEnergy: 1, bottledPaperRescueProgress: 15, maximumEnergy: 4,
  },
  fishing: {
    rodSuccess: 0.70, rodDouble: 0.20, rodBaitSuccess: 0.90,
    rodBaitDouble: 0.40, handSuccess: 0.30, handBaitSuccess: 0.55,
  },
  diving: {
    success: 0.65, injury: 0.25, flashlightSuccess: 0.80,
    flashlightInjury: 0.10, injuryDamage: 10, overcastSuccessDelta: -0.05,
    overcastInjuryDelta: 0.05,
  },
  rescue: { firstDay: 5, initialChance: 0.05, dailyIncrease: 0.08, chanceCap: 0.60, progressCap: 25 },
} as const;

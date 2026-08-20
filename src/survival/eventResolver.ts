import type {
  EventChoiceDefinition,
  RandomSource,
  ResourceEffect,
  WeightedEventOutcome,
} from './survivalTypes';

function resolveEffect(effect: ResourceEffect, random: RandomSource): ResourceEffect {
  const value = effect.value;
  if (typeof value === 'number') return { ...effect };
  return {
    ...effect,
    value: value.min + Math.floor(random.next() * (value.max - value.min + 1)),
  };
}

export function resolveWeightedOutcome(
  choice: EventChoiceDefinition,
  random: RandomSource,
  priorAppearanceCount = 0,
  resultId?: string,
): WeightedEventOutcome {
  const eligible = choice.outcomes.filter(
    (outcome) => (outcome.minimumPriorAppearances ?? 0) <= priorAppearanceCount,
  );
  let selected = resultId === undefined
    ? undefined
    : eligible.find((outcome) => outcome.resultId === resultId);
  if (resultId !== undefined && selected === undefined) {
    throw new Error(`Unknown event result: ${resultId}`);
  }
  if (selected === undefined) {
    const total = eligible.reduce((sum, outcome) => sum + Math.max(0, outcome.weight), 0);
    const roll = random.next() * total;
    let boundary = 0;
    selected = eligible[eligible.length - 1] ?? choice.outcomes[0]!;
    for (const outcome of eligible) {
      if (outcome.weight <= 0) continue;
      boundary += outcome.weight;
      if (roll < boundary) {
        selected = outcome;
        break;
      }
    }
  }

  return {
    ...(selected.resultId === undefined ? {} : { resultId: selected.resultId }),
    weight: selected.weight,
    message: selected.message,
    ...(selected.presentationKey === undefined
      ? {}
      : { presentationKey: selected.presentationKey }),
    ...(selected.minimumPriorAppearances === undefined
      ? {}
      : { minimumPriorAppearances: selected.minimumPriorAppearances }),
    effects: {
      ...(selected.effects.resources
        ? { resources: selected.effects.resources.map((effect) => resolveEffect(effect, random)) }
        : {}),
      ...(selected.effects.items
        ? { items: selected.effects.items.map((mutation) => ({ ...mutation })) }
        : {}),
      ...(selected.effects.chest !== undefined ? { chest: selected.effects.chest } : {}),
      ...(selected.effects.nextDawnEnergy !== undefined
        ? { nextDawnEnergy: selected.effects.nextDawnEnergy }
        : {}),
      ...(selected.effects.followUpNight !== undefined
        ? { followUpNight: selected.effects.followUpNight }
        : {}),
      ...(selected.effects.endingReason !== undefined
        ? { endingReason: selected.effects.endingReason }
        : {}),
    },
  };
}

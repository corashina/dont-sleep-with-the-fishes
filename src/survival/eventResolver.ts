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
): WeightedEventOutcome {
  const total = choice.outcomes.reduce((sum, outcome) => sum + Math.max(0, outcome.weight), 0);
  const roll = random.next() * total;
  let boundary = 0;
  let selected = choice.outcomes[choice.outcomes.length - 1]!;
  for (const outcome of choice.outcomes) {
    if (outcome.weight <= 0) continue;
    boundary += outcome.weight;
    if (roll < boundary) {
      selected = outcome;
      break;
    }
  }

  return {
    weight: selected.weight,
    message: selected.message,
    effects: {
      ...(selected.effects.resources
        ? { resources: selected.effects.resources.map((effect) => resolveEffect(effect, random)) }
        : {}),
      ...(selected.effects.items
        ? { items: selected.effects.items.map((mutation) => ({ ...mutation })) }
        : {}),
      ...(selected.effects.rescue !== undefined ? { rescue: selected.effects.rescue } : {}),
    },
  };
}

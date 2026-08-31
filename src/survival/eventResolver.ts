import { resolveIntegerValue } from './eventOutcomeRules';
import type {
  EventChoiceDefinition,
  RandomSource,
  ResourceEffect,
  WeightedEventOutcome,
} from './survivalTypes';

function resolveEffect(effect: ResourceEffect, random: RandomSource): ResourceEffect {
  return {
    ...effect,
    value: resolveIntegerValue(effect.value, random),
  };
}

function drawOutcome(
  outcomes: readonly WeightedEventOutcome[],
  random: RandomSource,
): WeightedEventOutcome {
  const total = outcomes.reduce((sum, outcome) => sum + Math.max(0, outcome.weight), 0);
  const roll = random.next() * total;
  let boundary = 0;
  let selected = outcomes[outcomes.length - 1]!;
  for (const outcome of outcomes) {
    if (outcome.weight <= 0) continue;
    boundary += outcome.weight;
    if (roll < boundary) return outcome;
  }
  return selected;
}

function selectOutcome(
  choice: EventChoiceDefinition,
  random: RandomSource,
  priorAppearanceCount: number,
  resultId?: string,
): WeightedEventOutcome {
  const eligible = choice.outcomes.filter(
    (outcome) => (outcome.minimumPriorAppearances ?? 0) <= priorAppearanceCount,
  );
  if (resultId === undefined) {
    return eligible.length > 0 ? drawOutcome(eligible, random) : choice.outcomes[0]!;
  }
  const selected = eligible.find((outcome) => outcome.resultId === resultId);
  if (selected === undefined) throw new Error(`Unknown event result: ${resultId}`);
  return selected;
}

function resolvedEffects(
  selected: WeightedEventOutcome,
  random: RandomSource,
): WeightedEventOutcome['effects'] {
  return {
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
  };
}

export function resolveWeightedOutcome(
  choice: EventChoiceDefinition,
  random: RandomSource,
  priorAppearanceCount = 0,
  resultId?: string,
): WeightedEventOutcome {
  const selected = selectOutcome(choice, random, priorAppearanceCount, resultId);

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
    effects: resolvedEffects(selected, random),
  };
}

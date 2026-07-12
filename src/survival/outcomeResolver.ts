import { drawWeighted, resolveInteger } from '../canonical/resolve';
import type {
  CanonicalEventDefinition,
  EventChoiceDefinition,
  EventHistory,
  EventResource,
  EventRoute,
  RandomSource,
  ResolvedEventOutcome,
  ResolvedEventResources,
  SurvivalInventory,
  WeightedEventOutcome,
} from './survivalTypes';

export interface CanonicalEventEligibility {
  phase: 'day' | 'night';
  day: number;
  danger: number;
  inventory: Readonly<SurvivalInventory>;
  route: EventRoute | null;
  history: ReadonlyMap<string, EventHistory>;
}

function hasUsableItem(inventory: Readonly<SurvivalInventory>, itemId: keyof SurvivalInventory): boolean {
  return inventory[itemId].owned;
}

function normalizedWeight(weight: number): number {
  return Number.isFinite(weight) && weight > 0 ? weight : 0;
}

function drawNormalized<T>(
  entries: readonly { weight: number; value: T }[],
  random: RandomSource,
): T {
  const normalized = entries.map((entry) => ({
    weight: normalizedWeight(entry.weight),
    value: entry.value,
  }));
  if (normalized.every(({ weight }) => weight === 0)) return normalized[0]!.value;
  return drawWeighted(normalized, random);
}

export function eligibleEvents(
  catalog: readonly CanonicalEventDefinition[],
  criteria: CanonicalEventEligibility,
): CanonicalEventDefinition[] {
  return catalog.filter((event) => {
    if (event.selectable === false) return false;
    if (event.phase !== criteria.phase || criteria.danger < event.dangerMin) return false;
    if (event.requiredItems?.some((itemId) => !hasUsableItem(criteria.inventory, itemId))) return false;
    if (event.forbiddenItems?.some((itemId) => hasUsableItem(criteria.inventory, itemId))) return false;
    if (
      event.requiredAnyItems !== undefined
      && !event.requiredAnyItems.some((itemId) => hasUsableItem(criteria.inventory, itemId))
    ) return false;

    const history = criteria.history.get(event.id);
    if (history === undefined) {
      return criteria.day >= event.minDay
        && (event.maxDay === undefined || criteria.day <= event.maxDay);
    }
    if (event.maxAppearances > 0 && history.appearances >= event.maxAppearances) return false;
    return event.cooldownDays === 0 || criteria.day - history.lastDay >= event.cooldownDays;
  });
}

export function drawWeightedEvent(
  pool: readonly CanonicalEventDefinition[],
  random: RandomSource,
  route: EventRoute | null,
): CanonicalEventDefinition | undefined {
  if (pool.length === 0) return undefined;
  const weighted = pool.map((event) => ({
    weight: event.weight + (route === null ? 0 : (event.routeWeightBonuses?.[route] ?? 0)),
    value: event,
  }));
  return drawNormalized(weighted, random);
}

function addDelta(
  target: ResolvedEventResources,
  resource: EventResource,
  delta: number,
): void {
  target[resource] = (target[resource] ?? 0) + delta;
}

function assertConsistentResourceOperations(outcome: WeightedEventOutcome): void {
  const modes = new Map<EventResource, 'set' | 'delta'>();
  for (const effect of outcome.effects.resources ?? []) {
    const mode = effect.operation === 'set' ? 'set' : 'delta';
    const previous = modes.get(effect.resource);
    if (previous !== undefined && previous !== mode) {
      throw new Error(
        `Event outcome cannot mix set and add/subtract effects for resource "${effect.resource}".`,
      );
    }
    modes.set(effect.resource, mode);
  }
}

function resolveSelectedOutcome(
  selected: WeightedEventOutcome,
  random: RandomSource,
): ResolvedEventOutcome {
  assertConsistentResourceOperations(selected);
  const resourceDeltas: ResolvedEventResources = {};
  const resourceSets: ResolvedEventResources = {};

  for (const effect of selected.effects.resources ?? []) {
    const value = resolveInteger(effect.value, random);
    if (effect.operation === 'set') resourceSets[effect.resource] = value;
    else addDelta(resourceDeltas, effect.resource, effect.operation === 'add' ? value : -value);
  }

  const resolved: ResolvedEventOutcome = {
    message: selected.message,
    resourceDeltas,
    resourceSets,
    itemMutations: (selected.effects.items ?? []).map((mutation) => ({ ...mutation })),
  };
  if (selected.effects.route !== undefined) resolved.route = selected.effects.route;
  if (selected.effects.terminal !== undefined) resolved.terminal = selected.effects.terminal;
  return resolved;
}

export function resolveEventOutcome(
  choice: EventChoiceDefinition,
  random: RandomSource,
): ResolvedEventOutcome;
export function resolveEventOutcome(
  outcome: WeightedEventOutcome,
  random: RandomSource,
): ResolvedEventOutcome;
export function resolveEventOutcome(
  choiceOrOutcome: EventChoiceDefinition | WeightedEventOutcome,
  random: RandomSource,
): ResolvedEventOutcome {
  const selected = 'outcomes' in choiceOrOutcome
    ? drawNormalized(
      choiceOrOutcome.outcomes.map((outcome) => ({ weight: outcome.weight, value: outcome })),
      random,
    )
    : choiceOrOutcome;
  return resolveSelectedOutcome(selected, random);
}

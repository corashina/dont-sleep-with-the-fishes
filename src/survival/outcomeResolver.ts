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

export function eligibleEvents(
  catalog: readonly CanonicalEventDefinition[],
  criteria: CanonicalEventEligibility,
): CanonicalEventDefinition[] {
  return catalog.filter((event) => {
    if (event.phase !== criteria.phase || criteria.danger < event.dangerMin) return false;
    if (event.requiredItems?.some((itemId) => !hasUsableItem(criteria.inventory, itemId))) return false;
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
    weight: Math.max(0, event.weight + (route === null ? 0 : (event.routeWeightBonuses?.[route] ?? 0))),
    value: event,
  }));
  if (weighted.every(({ weight }) => weight === 0)) return pool[0];
  return drawWeighted(weighted, random);
}

function addDelta(
  target: ResolvedEventResources,
  resource: EventResource,
  delta: number,
): void {
  target[resource] = (target[resource] ?? 0) + delta;
}

export function resolveEventOutcome(
  choice: EventChoiceDefinition,
  random: RandomSource,
): ResolvedEventOutcome {
  const selected = drawWeighted(
    choice.outcomes.map((outcome) => ({ weight: outcome.weight, value: outcome })),
    random,
  );
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
  return resolved;
}

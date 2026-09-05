import type { ItemId } from '../game/ItemState';
import { weightedEventDrawWeight } from './RunPressure';
import type {
  ChestState,
  RandomSource,
  SurvivalEventDefinition,
  WeatherId,
} from './survivalTypes';
import {
  localizeEventDefinitionText,
  registerEventDefinitionText,
} from '../i18n/eventMessages';

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export interface EventEligibility {
  readonly phase: 'day' | 'night';
  readonly day: number;
  readonly weather: WeatherId;
  readonly lastEventId: string | null;
  readonly lastSeenDay: ReadonlyMap<string, number>;
  readonly targetableItemIds: ReadonlySet<ItemId>;
  readonly appearanceCounts: ReadonlyMap<string, number>;
  readonly inventoryItemIds: ReadonlySet<ItemId>;
  readonly rescueLead: number;
  readonly pressure?: number;
  readonly chestState?: ChestState;
  readonly hasLivingCompanion?: boolean;
  readonly excludedIds?: ReadonlySet<string>;
}

function matchesEventSchedule(
  eventEntry: SurvivalEventDefinition,
  criteria: EventEligibility,
): boolean {
  if (eventEntry.phase !== criteria.phase || eventEntry.id === criteria.lastEventId) return false;
  if (criteria.day < eventEntry.earliestDay) return false;
  if (eventEntry.latestDay !== undefined && criteria.day > eventEntry.latestDay) return false;
  if (eventEntry.weather !== undefined && !eventEntry.weather.includes(criteria.weather)) return false;
  const lastSeen = criteria.lastSeenDay.get(eventEntry.id);
  return lastSeen === undefined || criteria.day - lastSeen >= eventEntry.cooldownDays;
}

function matchesEventInventory(
  eventEntry: SurvivalEventDefinition,
  criteria: EventEligibility,
): boolean {
  if (eventEntry.targetItemIds !== undefined
    && !eventEntry.targetItemIds.some((itemId) => criteria.targetableItemIds.has(itemId))) return false;
  if (eventEntry.absentItemIds !== undefined
    && eventEntry.absentItemIds.some((itemId) => criteria.inventoryItemIds.has(itemId))) return false;
  return true;
}

function matchesEventHistory(
  eventEntry: SurvivalEventDefinition,
  criteria: EventEligibility,
): boolean {
  if (criteria.excludedIds?.has(eventEntry.id)) return false;
  if (eventEntry.requiresLivingCompanion === true && criteria.hasLivingCompanion !== true) return false;
  if (eventEntry.maximumAppearances !== undefined
    && (criteria.appearanceCounts.get(eventEntry.id) ?? 0) >= eventEntry.maximumAppearances) return false;
  if (eventEntry.minimumRescueLead !== undefined
    && criteria.rescueLead < eventEntry.minimumRescueLead) return false;
  return true;
}

function matchesEventPressure(
  eventEntry: SurvivalEventDefinition,
  criteria: EventEligibility,
): boolean {
  const pressure = criteria.pressure ?? 0;
  if (eventEntry.minimumPressure !== undefined && pressure < eventEntry.minimumPressure) return false;
  if (eventEntry.maximumPressure !== undefined && pressure > eventEntry.maximumPressure) return false;
  const chestState = criteria.chestState ?? 'none';
  return eventEntry.allowedChestStates === undefined
    || eventEntry.allowedChestStates.includes(chestState);
}

function isEventEligible(
  eventEntry: SurvivalEventDefinition,
  criteria: EventEligibility,
): boolean {
  return matchesEventSchedule(eventEntry, criteria)
    && matchesEventInventory(eventEntry, criteria)
    && matchesEventHistory(eventEntry, criteria)
    && matchesEventPressure(eventEntry, criteria);
}

export function eligibleEvents(
  catalog: readonly SurvivalEventDefinition[],
  criteria: EventEligibility,
): readonly SurvivalEventDefinition[] {
  return catalog.filter((eventEntry) => isEventEligible(eventEntry, criteria));
}

const fallbackDefinitions: Record<'day' | 'night', SurvivalEventDefinition> = {
  day: {
    id: 'day-calm-fallback', phase: 'day', title: 'eventText271',
    revealText: 'eventText272',
    prompt: 'eventText273', danger: 'safe', cue: 'none',
    weight: 1, earliestDay: 1, cooldownDays: 0,
    choices: [{ id: 'sleep', label: 'eventText274', outcomes: [{ weight: 1, message: 'eventText275', effects: {} }] }],
  },
  night: {
    id: 'night-calm-fallback', phase: 'night', title: 'eventText276',
    revealText: 'eventText277',
    prompt: 'eventText278', danger: 'safe', cue: 'none',
    weight: 1, earliestDay: 1, cooldownDays: 0,
    choices: [{ id: 'sleep', label: 'eventText063', outcomes: [{ weight: 1, message: 'eventText279', effects: {} }] }],
  },
};

for (const eventDefinition of Object.values(fallbackDefinitions)) {
  localizeEventDefinitionText(eventDefinition);
  registerEventDefinitionText(eventDefinition);
}

const FALLBACKS: Readonly<Record<'day' | 'night', SurvivalEventDefinition>> =
  deepFreeze(fallbackDefinitions);

export function survivalEventFallbackById(
  id: string,
): SurvivalEventDefinition | undefined {
  return Object.values(FALLBACKS).find((event) => event.id === id);
}

export function drawWeightedEvent(
  random: RandomSource,
  events: readonly SurvivalEventDefinition[],
  eligibility: EventEligibility,
): SurvivalEventDefinition {
  const pool = eligibleEvents(events, eligibility);
  if (pool.length === 0) return FALLBACKS[eligibility.phase];
  const pressure = eligibility.pressure ?? 0;
  const totalWeight = pool.reduce(
    (sum, eventEntry) => sum + weightedEventDrawWeight(eventEntry, pressure),
    0,
  );
  const roll = random.next() * totalWeight;
  let boundary = 0;
  for (const eventEntry of pool) {
    boundary += weightedEventDrawWeight(eventEntry, pressure);
    if (roll < boundary) return eventEntry;
  }
  return pool[pool.length - 1]!;
}

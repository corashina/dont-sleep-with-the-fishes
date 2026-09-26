import { CONSTELLATION_COUNT, STARRY_NIGHT_ITEMS } from './starryNight';
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
  readonly food?: number;
  readonly pressure?: number;
  readonly chestState?: ChestState;
  readonly hasCompanion?: boolean;
  readonly companionExhausted?: boolean;
  readonly excludedIds?: ReadonlySet<string>;
}

function matchesEventSchedule(
  eventEntry: SurvivalEventDefinition,
  criteria: EventEligibility,
): boolean {
  if (eventEntry.id === 'kraken') return false;
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
  if (eventEntry.id === 'starry-night'
    && STARRY_NIGHT_ITEMS.filter((id) => !criteria.inventoryItemIds.has(id)).length < CONSTELLATION_COUNT) return false;
  if ((criteria.food ?? 0) < (eventEntry.minimumFood ?? 0)) return false;
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
  if (eventEntry.requiresCompanion === true && criteria.hasCompanion !== true) return false;
  if (eventEntry.id === 'guarded-sleep' && criteria.companionExhausted === true) return false;
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

const fallbackDefinitions: Record<'day', SurvivalEventDefinition> = {
  day: {
    id: 'day-calm-fallback', phase: 'day', title: 'eventText271',
    revealText: 'eventText272',
    prompt: 'eventText273', danger: 'safe', cue: 'none',
    weight: 1, earliestDay: 1, cooldownDays: 0,
    choices: [{ id: 'sleep', label: 'eventText274', outcomes: [{ weight: 1, message: 'eventText275', effects: {} }] }],
  },
};

for (const eventDefinition of Object.values(fallbackDefinitions)) {
  localizeEventDefinitionText(eventDefinition);
  registerEventDefinitionText(eventDefinition);
}

const FALLBACKS: Readonly<Record<'day', SurvivalEventDefinition>> =
  deepFreeze(fallbackDefinitions);

export function survivalEventFallbackById(
  id: string,
): SurvivalEventDefinition | undefined {
  return Object.values(FALLBACKS).find((event) => event.id === id);
}

function eventDrawWeight(
  event: SurvivalEventDefinition,
  eligibility: EventEligibility,
): number {
  const appearances = eligibility.appearanceCounts.get(event.id) ?? 0;
  // Keep repeats possible, but favor variety across a 30–35 day run.
  // First appearance: full weight; one prior appearance: 1/8; two: 1/27.
  return weightedEventDrawWeight(event, eligibility.pressure ?? 0) / (appearances + 1) ** 3;
}

export function drawWeightedEvent(
  random: RandomSource,
  events: readonly SurvivalEventDefinition[],
  eligibility: EventEligibility,
): SurvivalEventDefinition {
  const pool = eligibleEvents(events, eligibility);
  if (pool.length === 0) {
    if (eligibility.phase === 'day') return FALLBACKS.day;
    throw new Error(`No eligible night event on day ${eligibility.day}.`);
  }
  const totalWeight = pool.reduce(
    (sum, eventEntry) => sum + eventDrawWeight(eventEntry, eligibility),
    0,
  );
  const roll = random.next() * totalWeight;
  let boundary = 0;
  for (const eventEntry of pool) {
    boundary += eventDrawWeight(eventEntry, eligibility);
    if (roll < boundary) return eventEntry;
  }
  return pool[pool.length - 1]!;
}

import type { ItemInstanceId } from '../game/ItemState';
import type {
  ActionOutcome,
  ItemCondition,
} from './survivalTypes';
import type { SurvivalSnapshot } from './survivalSnapshot';
import type { EventOutcomePresentation } from './eventPresentationTypes';

function eventIdHash(eventId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < eventId.length; index += 1) {
    hash ^= eventId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Produces a stable unsigned value for renderer-owned event variants. */
export function deriveEventVariantSeed(seed: number, day: number, eventId: string): number {
  let value = (seed >>> 0) ^ Math.imul(day >>> 0, 0x9e3779b1) ^ eventIdHash(eventId);
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  return (value ^ (value >>> 16)) >>> 0;
}

function changedTo(
  before: SurvivalSnapshot,
  after: SurvivalSnapshot,
  condition: ItemCondition,
): readonly ItemInstanceId[] {
  return Object.keys(after.inventory)
    .filter((id) => {
      const instanceId = id as ItemInstanceId;
      return before.inventory[instanceId] !== undefined
        && after.inventory[instanceId]?.condition === condition
        && before.inventory[instanceId]?.condition !== condition;
    })
    .sort((left, right) => left.localeCompare(right)) as ItemInstanceId[];
}

function gainedItems(
  before: SurvivalSnapshot,
  after: SurvivalSnapshot,
): readonly ItemInstanceId[] {
  return Object.keys(after.inventory)
    .filter((id) => {
      const instanceId = id as ItemInstanceId;
      const previous = before.inventory[instanceId]?.condition;
      const current = after.inventory[instanceId]?.condition;
      return (previous === undefined || previous === 'lost' || previous === 'consumed')
        && (current === 'usable' || current === 'broken');
    })
    .sort((left, right) => left.localeCompare(right)) as ItemInstanceId[];
}

export function deriveEventOutcomePresentation(
  before: SurvivalSnapshot,
  after: SurvivalSnapshot,
  outcome: ActionOutcome,
  selectedInstanceId: ItemInstanceId | null,
): EventOutcomePresentation {
  return {
    outcome,
    resourceDeltas: { ...outcome.deltas },
    gainedInstanceIds: gainedItems(before, after),
    brokenInstanceIds: changedTo(before, after, 'broken'),
    lostInstanceIds: changedTo(before, after, 'lost'),
    consumedInstanceIds: changedTo(before, after, 'consumed'),
    selectedInstanceId,
    selectedCondition: selectedInstanceId === null
      ? null
      : after.inventory[selectedInstanceId]?.condition ?? null,
    targetInstanceId: before.pendingEventTargetId,
  };
}

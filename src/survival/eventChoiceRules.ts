import type { ItemId, ItemInstanceId } from '../game/ItemState';
import { carlitosHelpUnavailableMessage } from './CarlitosState';
import { driftingSupplyChoiceForVariant } from './driftingSupplies';
import { deriveEventVariantSeed } from './eventPresentationOutcome';
import { ownsNightTraderReward } from './nightTraderTrades';
import { eligibleHandymanRewards } from './tradeRules';
import type { SurvivalSnapshot } from './survivalSnapshot';
import type { EventChoiceDefinition, EventChoiceRequirement, SurvivalEventDefinition } from './survivalTypes';

export type EventChoiceFailure =
  | { readonly kind: 'resource'; readonly resource: EventChoiceRequirement['resource']; readonly minimum: number }
  | { readonly kind: 'item'; readonly itemId: ItemId }
  | { readonly kind: 'chest'; readonly state: NonNullable<EventChoiceDefinition['requiredChestState']> }
  | { readonly kind: 'companion' }
  | { readonly kind: 'trade' };

export interface EventChoiceDecision {
  readonly choice: EventChoiceDefinition;
  readonly visible: boolean;
  readonly instanceId: ItemInstanceId | null;
  readonly failures: readonly EventChoiceFailure[];
}

function defaultInstance(choice: EventChoiceDefinition, snapshot: SurvivalSnapshot): ItemInstanceId | null {
  if (choice.itemId === undefined) return null;
  return Object.values(snapshot.inventory)
    .filter((item) => item?.type === choice.itemId && item?.condition === 'usable')
    .map((item) => item!.instanceId).sort()[0] ?? null;
}

function tradeUnavailable(event: SurvivalEventDefinition, choice: EventChoiceDefinition, snapshot: SurvivalSnapshot): boolean {
  if (event.id === 'night-trader') return ownsNightTraderReward(choice.id, snapshot.inventory);
  if (event.id !== 'handyman' || choice.itemId === undefined) return false;
  const owned = new Set(Object.values(snapshot.inventory)
    .filter((item) => item?.condition === 'usable' || item?.condition === 'broken')
    .map((item) => item!.type));
  return eligibleHandymanRewards(owned, choice.itemId).length === 0;
}

function itemFailures(event: SurvivalEventDefinition, choice: EventChoiceDefinition, snapshot: SurvivalSnapshot,
  instanceId: ItemInstanceId | null): EventChoiceFailure[] {
  if (choice.itemId === undefined) return [];
  if (event.id === 'night-trader') {
    const resource = choice.itemId === 'cannedFood' ? 'food' : choice.itemId === 'baitTin' ? 'bait' : null;
    if (resource !== null) return snapshot[resource] < 1 ? [{ kind: 'resource', resource, minimum: 1 }] : [];
  }
  return instanceId === null ? [{ kind: 'item', itemId: choice.itemId }] : [];
}

export function eventChoiceDecision(event: SurvivalEventDefinition, catalogChoice: EventChoiceDefinition,
  snapshot: SurvivalSnapshot): EventChoiceDecision {
  const choice = event.id === 'drifting-supplies'
    ? driftingSupplyChoiceForVariant(catalogChoice, deriveEventVariantSeed(snapshot.seed, snapshot.day, event.id))
    : catalogChoice;
  const instanceId = defaultInstance(choice, snapshot);
  const failures: EventChoiceFailure[] = (choice.requirements ?? [])
    .filter(({ resource, minimum }) => snapshot[resource] < minimum)
    .map(({ resource, minimum }) => ({ kind: 'resource', resource, minimum }));
  failures.push(...itemFailures(event, choice, snapshot, instanceId));
  if (choice.requiredChestState !== undefined && choice.requiredChestState !== snapshot.chest.state) {
    failures.push({ kind: 'chest', state: choice.requiredChestState });
  }
  const companion = choice.companionAction !== undefined;
  if (companion && (snapshot.carlitos === null || carlitosHelpUnavailableMessage(snapshot.carlitos) !== null)) {
    failures.push({ kind: 'companion' });
  }
  if (tradeUnavailable(event, choice, snapshot)) failures.push({ kind: 'trade' });
  return { choice, visible: !companion || snapshot.carlitos !== null, instanceId, failures };
}

import { handymanTradeLabel, traderOfferLabel } from '../i18n/tradeMessages';
import type { ItemId } from '../game/ItemState';
import {
  createNightTraderStock,
  eligibleHandymanRewards,
  parseTraderChoiceId,
} from './tradeRules';
import type { SurvivalSnapshot } from './survivalSnapshot';
import type { EventChoiceDefinition, SurvivalEventDefinition } from './survivalTypes';

type TradeState = Pick<SurvivalSnapshot, 'inventory' | 'seed' | 'day'>;

export function prepareTradeEvent(
  event: SurvivalEventDefinition,
  state: TradeState,
): SurvivalEventDefinition {
  if (event.id !== 'night-trader' && event.id !== 'handyman') return event;
  const owned = new Set<ItemId>(Object.values(state.inventory)
    .filter((item) => item?.condition === 'usable' || item?.condition === 'broken')
    .map((item) => item!.type));
  const choices = event.id === 'handyman'
    ? handymanChoices(event, owned)
    : traderChoices(event, owned, state);
  return { ...event, get title() { return event.title; },
    get revealText() { return event.revealText; }, get prompt() { return event.prompt; },
    choices: choices as [EventChoiceDefinition, ...EventChoiceDefinition[]] };
}

function handymanChoices(event: SurvivalEventDefinition, owned: ReadonlySet<ItemId>): EventChoiceDefinition[] {
  return event.choices.filter((choice) => choice.itemId === undefined
    || eligibleHandymanRewards(owned, choice.itemId).length > 0)
    .map((choice) => choice.itemId === undefined ? choice : {
      ...choice, get label() { return handymanTradeLabel(choice.itemId!); },
    });
}

function traderChoices(
  event: SurvivalEventDefinition,
  owned: ReadonlySet<ItemId>,
  state: TradeState,
): EventChoiceDefinition[] {
  const stock = createNightTraderStock(owned, state.seed, state.day);
  return event.choices.flatMap((choice) => {
    if (choice.id === 'sleep') return [choice];
    const offer = [stock.consumable, stock.equipment]
      .find((entry) => entry?.choiceIds.some((id) => id === choice.id));
    if (offer == null) return [];
    const resource = parseTraderChoiceId(choice.id)!.payment;
    return [{
      ...choice,
      get label() { return traderOfferLabel(offer.itemId, resource, offer.price); },
      requirements: [{ resource, minimum: offer.price }],
      outcomes: [{ ...choice.outcomes[0], get message() { return choice.outcomes[0].message; }, effects: {
        resources: [{ resource, operation: 'subtract' as const, value: offer.price }],
        items: [{ kind: 'gain' as const, itemId: offer.itemId, quantity: 1 as const, fallbackFood: 1 as const }],
      } }] as [EventChoiceDefinition['outcomes'][0]],
    }];
  });
}

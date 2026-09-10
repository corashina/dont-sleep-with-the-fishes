import { handymanTradeLabel } from '../i18n/tradeMessages';
import type { ItemId } from '../game/ItemState';
import { eligibleHandymanRewards } from './tradeRules';
import { nightTraderEventForSeed } from './nightTraderTrades';
import { deriveEventVariantSeed } from './eventPresentationOutcome';
import type { SurvivalSnapshot } from './survivalSnapshot';
import type { EventChoiceDefinition, SurvivalEventDefinition } from './survivalTypes';

type TradeState = Pick<SurvivalSnapshot, 'inventory' | 'seed' | 'day'>;

export function prepareTradeEvent(
  event: SurvivalEventDefinition,
  state: TradeState,
): SurvivalEventDefinition {
  if (event.id === 'night-trader') {
    return nightTraderEventForSeed(event, deriveEventVariantSeed(state.seed, state.day, event.id));
  }
  if (event.id !== 'handyman') return event;
  const owned = new Set<ItemId>(Object.values(state.inventory)
    .filter((item) => item?.condition === 'usable' || item?.condition === 'broken')
    .map((item) => item!.type));
  const choices = handymanChoices(event, owned);
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

import { ITEM_DEFINITIONS, type ItemId } from '../game/ItemState';
import { mulberry32 } from './random';
import type { EventChoiceDefinition, EventEffects, ItemCondition, SurvivalEventDefinition } from './survivalTypes';

export interface NightTraderTrade {
  readonly id: string;
  readonly payment: ItemId;
  readonly reward: ItemId;
  readonly message: string;
}

function trade(payment: ItemId, reward: ItemId, id = `${payment}-${reward}`, message = 'traderReceived'): NightTraderTrade {
  if (Math.abs(ITEM_DEFINITIONS[payment].weight - ITEM_DEFINITIONS[reward].weight) > 1) {
    throw new Error(`Night Trader weight difference exceeds one: ${id}`);
  }
  return Object.freeze({ id, payment, reward, message });
}

// Deliberate barter pairs. Weight is a limit, not permission to trade any two items.
export const NIGHT_TRADER_TRADES: readonly NightTraderTrade[] = Object.freeze([
  trade('cannedFood', 'ductTape', 'food', 'eventText245'),
  trade('baitTin', 'energyBar', 'bait', 'eventText246'),
  trade('map', 'compass', 'map', 'eventText247'),
  trade('umbrella', 'medicalKit', 'umbrella', 'eventText248'),
  trade('swimRing', 'radio', 'swimRing', 'eventText249'),
  trade('cannedFood', 'energyBar'),
  trade('energyBar', 'cannedFood'),
  trade('ductTape', 'cannedFood'),
  trade('energyBar', 'ductTape'),
  trade('ductTape', 'energyBar'),
  trade('baitTin', 'cannedFood'),
  trade('cannedFood', 'baitTin'),
  trade('compass', 'map'),
  trade('spyglass', 'flashlight'),
  trade('flashlight', 'spyglass'),
  trade('map', 'spyglass'),
  trade('spyglass', 'map'),
  trade('knife', 'flashlight'),
  trade('flashlight', 'knife'),
  trade('knife', 'bucket'),
  trade('bucket', 'knife'),
  trade('umbrella', 'swimRing'),
  trade('swimRing', 'umbrella'),
  trade('medicalKit', 'umbrella'),
  trade('flareGun', 'shotgun'),
  trade('shotgun', 'flareGun'),
  trade('fishingNet', 'scubaSet'),
  trade('scubaSet', 'fishingNet'),
  trade('bucket', 'anchor'),
  trade('anchor', 'bucket'),
  trade('anchor', 'scubaSet'),
  trade('scubaSet', 'anchor'),
]);

const tradesById = new Map(NIGHT_TRADER_TRADES.map((offer) => [offer.id, offer]));

export function nightTraderTrade(id: string): NightTraderTrade {
  const offer = tradesById.get(id);
  if (offer === undefined) throw new Error(`Unknown Night Trader offer: ${id}`);
  return offer;
}

export function nightTraderOffers(seed: number): readonly NightTraderTrade[] {
  const random = mulberry32(seed);
  const pool = [...NIGHT_TRADER_TRADES];
  for (let index = pool.length - 1; index > 0; index--) {
    const other = Math.floor(random.next() * (index + 1));
    [pool[index], pool[other]] = [pool[other]!, pool[index]!];
  }
  const offers: NightTraderTrade[] = [];
  for (const offer of pool) {
    if (offers.some(({ payment, reward }) => payment === offer.payment || reward === offer.reward)) continue;
    offers.push(offer);
    if (offers.length === 5) return offers;
  }
  throw new Error('Night Trader cannot draw five distinct offers.');
}

function resourceFor(item: ItemId): 'food' | 'bait' | undefined {
  if (item === 'cannedFood') return 'food';
  if (item === 'baitTin') return 'bait';
  return undefined;
}

function tradeEffects({ payment, reward }: NightTraderTrade): EventEffects {
  const costResource = resourceFor(payment);
  const rewardResource = resourceFor(reward);
  return {
    resources: [
      ...(costResource === undefined ? [] : [{ resource: costResource, operation: 'subtract' as const, value: 1 }]),
      ...(rewardResource === undefined ? [] : [{ resource: rewardResource, operation: 'add' as const, value: 1 }]),
    ],
    items: [
      ...(costResource === undefined ? [{
        kind: ITEM_DEFINITIONS[payment].durable ? 'lose' as const : 'consume' as const,
        itemId: payment, quantity: 1,
      }] : []),
      ...(rewardResource === undefined ? [{ kind: 'gain' as const, itemId: reward, quantity: 1 as const, fallbackFood: 1 as const }] : []),
    ],
  };
}

export function nightTraderChoices(): [EventChoiceDefinition, ...EventChoiceDefinition[]] {
  const choices = NIGHT_TRADER_TRADES.map<EventChoiceDefinition>((offer) => ({
    id: offer.id,
    itemId: offer.payment,
    label: 'traderExchange',
    outcomes: [{ resultId: 'trader-reward', weight: 1, message: offer.message, effects: tradeEffects(offer) }],
  }));
  return [choices[0]!, ...choices.slice(1)];
}

export function nightTraderEventForSeed(event: SurvivalEventDefinition, seed: number): SurvivalEventDefinition {
  const offers = nightTraderOffers(seed);
  const choices = offers.map(({ id }) => event.choices.find((choice) => choice.id === id)!);
  choices.push(event.choices.find(({ id }) => id === 'sleep')!);
  return {
    ...event,
    get title() { return event.title; },
    get revealText() { return event.revealText; },
    get prompt() { return event.prompt; },
    choices: choices as [EventChoiceDefinition, ...EventChoiceDefinition[]],
  };
}

export function ownsNightTraderReward(
  choiceId: string,
  inventory: Readonly<Record<string, { readonly type: ItemId; readonly condition: ItemCondition } | undefined>>,
): boolean {
  if (choiceId === 'sleep') return false;
  const { reward } = nightTraderTrade(choiceId);
  return ITEM_DEFINITIONS[reward].durable && Object.values(inventory).some((item) => (
    item?.type === reward && (item.condition === 'usable' || item.condition === 'broken')
  ));
}

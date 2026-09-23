import type { ItemId } from '../game/ItemState';
import { deriveEventVariantSeed } from './eventPresentationOutcome';
import { mulberry32 } from './random';
import type { SurvivalSnapshot } from './survivalSnapshot';
import type { EventChoiceDefinition, SurvivalEventDefinition } from './survivalTypes';

export const STARRY_NIGHT_ITEMS = Object.freeze([
  'cannedFood', 'baitTin', 'ductTape', 'compass', 'map', 'knife', 'energyBar',
] as const satisfies readonly ItemId[]);
export type StarryNightItem = typeof STARRY_NIGHT_ITEMS[number];
export const CONSTELLATION_COUNT = 2;

export function constellationItems(seed: number, owned: ReadonlySet<ItemId>): readonly ItemId[] {
  const pool = STARRY_NIGHT_ITEMS.filter((id) => !owned.has(id));
  if (pool.length < CONSTELLATION_COUNT) throw new Error('Starry Night requires two unowned items.');
  const random = mulberry32(seed);
  for (let index = pool.length - 1; index > 0; index--) {
    const other = Math.floor(random.next() * (index + 1));
    [pool[index], pool[other]] = [pool[other]!, pool[index]!];
  }
  return pool.slice(0, CONSTELLATION_COUNT);
}

export function starryNightChoices(): [EventChoiceDefinition, ...EventChoiceDefinition[]] {
  const choices = STARRY_NIGHT_ITEMS.map<EventChoiceDefinition>((itemId) => ({
    id: itemId,
    label: 'starryNightWish',
    outcomes: [{
      resultId: 'starry-night-gift', weight: 1, message: 'starryNightGift',
      effects: { items: [{ kind: 'gain', itemId, quantity: 1, fallbackFood: 1 }] },
    }],
  }));
  return [choices[0]!, ...choices.slice(1)];
}

export function prepareStarryNightEvent(
  event: SurvivalEventDefinition,
  state: Pick<SurvivalSnapshot, 'inventory' | 'seed' | 'day'>,
): SurvivalEventDefinition {
  if (event.id !== 'starry-night') return event;
  const owned = new Set(Object.values(state.inventory)
    .filter((item) => item?.condition === 'usable' || item?.condition === 'broken')
    .map((item) => item!.type));
  const items = constellationItems(deriveEventVariantSeed(state.seed, state.day, event.id), owned);
  const choices = items.map((id) => event.choices.find((choice) => choice.id === id)!);
  choices.push(event.choices.find(({ id }) => id === 'sleep')!);
  return {
    ...event,
    get title() { return event.title; },
    get revealText() { return event.revealText; },
    get prompt() { return event.prompt; },
    choices: choices as [EventChoiceDefinition, ...EventChoiceDefinition[]],
  };
}

import { describe, expect, it } from 'vitest';
import { type ItemInstance, type ItemInstanceId } from '../src/game/ItemState';
import { survivalEventById } from '../src/survival/eventCatalog';
import { deriveEventVariantSeed } from '../src/survival/eventPresentationOutcome';
import { NIGHT_TRADER_TRADES, nightTraderOffers } from '../src/survival/nightTraderTrades';
import { SurvivalSession } from '../src/survival/SurvivalSession';

const variant = (seed: number) => deriveEventVariantSeed(seed, 10, 'night-trader');
const seedFor = (id: string) => {
  for (let seed = 0; seed < 1000; seed++) {
    if (nightTraderOffers(variant(seed)).some((trade) => trade.id === id)) return seed;
  }
  throw new Error(`Offer never drawn: ${id}`);
};

describe('Night Trader offers', () => {
  it('draws five distinct payments and rewards, with repeatable varied offers', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 250; seed++) {
      const offers = nightTraderOffers(seed);
      expect(offers).toHaveLength(5);
      expect(new Set(offers.map(({ payment }) => payment)).size).toBe(5);
      expect(new Set(offers.map(({ reward }) => reward)).size).toBe(5);
      expect(nightTraderOffers(seed)).toEqual(offers);
      offers.forEach(({ id }) => seen.add(id));
      expect(survivalEventById('night-trader', seed)!.choices.map(({ id }) => id))
        .toEqual([...offers.map(({ id }) => id), 'sleep']);
    }
    expect(seen.size).toBe(NIGHT_TRADER_TRADES.length);
  });

  it.each(NIGHT_TRADER_TRADES.filter(({ id }) => ['map', 'energyBar-cannedFood', 'cannedFood-baitTin'].includes(id)))('exchanges exactly the displayed $payment for $reward after restoring', (trade) => {
    const instanceId = `${trade.payment}-1` as ItemInstanceId;
    const saved: ItemInstance[] = [{ type: trade.payment, instanceId }];
    const session = new SurvivalSession(saved, {
      seed: seedFor(trade.id), initial: { day: 10 }, initialEventId: 'night-trader',
    });
    const restored = SurvivalSession.restore(session.exportCheckpoint());
    const response = { kind: 'item' as const, choiceId: trade.id, instanceId };
    const outcome = session.resolveEvent(response);
    expect(outcome.accepted).toBe(true);
    expect(restored.resolveEvent(response)).toEqual(outcome);
    const inventory = Object.values(session.snapshot().inventory);
    expect(inventory.some((item) => item?.type === trade.payment && item.condition === 'usable')).toBe(false);
    if (trade.reward === 'cannedFood') expect(session.snapshot().food).toBe(1);
    else if (trade.reward === 'baitTin') expect(session.snapshot().bait).toBe(1);
    else expect(inventory.some((item) => item?.type === trade.reward && item.condition === 'usable')).toBe(true);
    expect(outcome.eventResult?.resultId).toBe('trader-reward');
  });

  it.each([
    ['food', 'food', 'ductTape'],
    ['bait', 'bait', 'energyBar'],
  ] as const)('accepts the %s offer from resource stock without an item instance', (choiceId, resource, reward) => {
    const session = new SurvivalSession([], {
      seed: seedFor(choiceId),
      initial: { day: 10, [resource]: 1 },
      initialEventId: 'night-trader',
    });

    const outcome = session.resolveEvent({ kind: 'choice', choiceId });

    expect(outcome.accepted).toBe(true);
    expect(session.snapshot()[resource]).toBe(0);
    expect(Object.values(session.snapshot().inventory).some((item) => (
      item?.type === reward && item.condition === 'usable'
    ))).toBe(true);
  });

  it('rejects a resource offer when its stock is empty', () => {
    const session = new SurvivalSession([], {
      seed: seedFor('food'), initial: { day: 10 }, initialEventId: 'night-trader',
    });

    expect(session.resolveEvent({ kind: 'choice', choiceId: 'food' }).accepted).toBe(false);
  });

  it('rejects a catalog offer absent from this visit without taking payment', () => {
    const offers = nightTraderOffers(variant(17));
    const trade = NIGHT_TRADER_TRADES.find(({ id }) => !offers.some((offer) => offer.id === id))!;
    const instanceId = `${trade.payment}-1` as ItemInstanceId;
    const session = new SurvivalSession([{ type: trade.payment, instanceId }], {
      seed: 17, initial: { day: 10 }, initialEventId: 'night-trader',
    });
    const before = session.snapshot();
    expect(session.resolveEvent({ kind: 'item', choiceId: trade.id, instanceId }).accepted).toBe(false);
    expect(session.snapshot().inventory).toEqual(before.inventory);
  });

  it.each([
    ['map', 'map', 'compass', 'usable'],
    ['map', 'map', 'compass', 'broken'],
    ['food', 'cannedFood', 'ductTape', 'usable'],
    ['flareGun-shotgun', 'flareGun', 'shotgun', 'usable'],
  ] as const)('refuses owned %s rewards in %s/%s/%s without payment', (choiceId, payment, reward, condition) => {
    const session = new SurvivalSession([
      { type: payment, instanceId: `${payment}-1` }, { type: reward, instanceId: `${reward}-1` },
    ], {
      seed: seedFor(choiceId), initial: { day: 10 }, initialEventId: 'night-trader',
      initialConditions: { [`${reward}-1`]: condition },
    });
    const before = session.snapshot();
    expect(session.resolveEvent({ kind: 'item', choiceId, instanceId: `${payment}-1` }).accepted).toBe(false);
    expect(session.snapshot().inventory).toEqual(before.inventory);
    expect(session.snapshot().food).toBe(before.food);
  });
});

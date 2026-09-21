// Importance: 95/100. The preview must allow real trades through normal session rules.
import { describe, expect, it } from 'vitest';
import { createEventTestResult, EVENT_TEST_OPTIONS } from '../src/app/EventTest';
import { ITEM_IDS } from '../src/game/ItemState';
import { deriveEventVariantSeed } from '../src/survival/eventPresentationOutcome';
import { nightTraderOffers } from '../src/survival/nightTraderTrades';
import { SurvivalSession } from '../src/survival/SurvivalSession';

describe('event preview stock', () => {
  it('allows every stocked Handyman item to be traded for a missing reward', () => {
    const option = EVENT_TEST_OPTIONS.find(({ id }) => id === 'handyman')!;
    const result = createEventTestResult(option, 0);
    for (const payment of result.savedItems.filter(({ type }) => type !== 'carlitos')) {
      const session = new SurvivalSession(result.savedItems, { seed: 0, initialEventId: 'handyman' });
      const outcome = session.resolveEvent({
        kind: 'item', choiceId: payment.type, instanceId: payment.instanceId,
      });
      expect(outcome.accepted, payment.type).toBe(true);
      expect(outcome.eventResult?.resultId).toBe('handyman-reward');
    }
  });

  it('allows all five Night Trader offers without owning their rewards', () => {
    const option = EVENT_TEST_OPTIONS.find(({ id }) => id === 'night-trader')!;
    if (option.phase === 'ending') throw new Error('Expected an event preview.');
    expect(option.seed).toBe(0);
    const seed = option.seed!;
    const result = createEventTestResult(option, seed);
    const offers = nightTraderOffers(deriveEventVariantSeed(seed, 1, option.eventId));
    expect(offers).toHaveLength(5);
    for (const offer of offers) {
      const payment = result.savedItems.find(({ type }) => type === offer.payment);
      expect(payment).toBeDefined();
      expect(result.savedItems.some(({ type }) => type === offer.reward)).toBe(false);
      const session = new SurvivalSession(result.savedItems, {
        seed, initialEventId: option.eventId,
      });
      const outcome = session.resolveEvent({
        kind: 'item', choiceId: offer.id, instanceId: payment!.instanceId,
      });
      expect(outcome.accepted).toBe(true);
      expect(outcome.eventResult?.resultId).toBe('trader-reward');
      expect(Object.values(session.snapshot().inventory).some((item) => (
        item?.type === offer.reward && item.condition === 'usable'
      ))).toBe(true);
    }
  });

  it('keeps every item in the item animation lab', () => {
    const option = EVENT_TEST_OPTIONS.find(({ id }) => id === 'item-animation-lab')!;
    expect(createEventTestResult(option, 0).savedItems.map(({ type }) => type)).toEqual(ITEM_IDS);
  });
});

import { describe, expect, it } from 'vitest';
import { ITEM_IDS, type ItemId } from '../src/game/ItemState';
import { drawChestReward } from '../src/survival/chest';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from './helpers/random';

describe('chest rewards', () => {
  const rewardItems = ITEM_IDS.filter((itemId) => itemId !== 'carlitos');

  it.each(rewardItems)('can award missing %s', (missing) => {
    const owned = new Set<ItemId>(rewardItems.filter((itemId) => itemId !== missing));
    expect(drawChestReward(owned, sequenceRandom([0]))).toEqual({ kind: 'item', itemId: missing });
  });

  it('gives scuba gear three times the weight of other items', () => {
    const owned = new Set<ItemId>(rewardItems.filter((itemId) => (
      itemId !== 'compass' && itemId !== 'scubaSet'
    )));

    expect(drawChestReward(owned, sequenceRandom([0.249999]))).toEqual({ kind: 'item', itemId: 'compass' });
    expect(drawChestReward(owned, sequenceRandom([0.25]))).toEqual({ kind: 'item', itemId: 'scubaSet' });
  });

  it('gives two food when every reward item is owned', () => {
    expect(drawChestReward(new Set(rewardItems), sequenceRandom([0]))).toEqual({
      kind: 'resource',
      resource: 'food',
      quantity: 2,
    });
  });
});

describe('chest energy costs', () => {
  it('retrieves a drifting chest with one energy', () => {
    const session = new SurvivalSession([], {
      seed: 1, initial: { day: 3, energy: 1 }, initialEventId: 'drifting-chest',
    });
    expect(session.resolveEvent({ kind: 'choice', choiceId: 'retrieve' }).accepted).toBe(true);
    expect(session.snapshot()).toMatchObject({ energy: 0, chest: { state: 'closed' } });
  });

  it('cannot retrieve a drifting chest without energy', () => {
    const session = new SurvivalSession([], {
      seed: 1, initial: { day: 3, energy: 0 }, initialEventId: 'drifting-chest',
    });
    expect(session.resolveEvent({ kind: 'choice', choiceId: 'retrieve' }).accepted).toBe(false);
    expect(session.snapshot()).toMatchObject({ energy: 0, chest: { state: 'none' } });
  });

  it.each([0, 1, 2])('preserves the chest when opening with %i energy is blocked', (energy) => {
    const session = new SurvivalSession([], {
      seed: 1, initial: { energy }, initialChest: { state: 'closed', acquiredDay: 0 },
    });
    const before = session.snapshot();
    expect(session.perform('openChest')).toMatchObject({ accepted: false, code: 'not-enough-energy' });
    expect(session.snapshot()).toEqual(before);
  });

  it.each(['item', 'resource'] as const)('spends three energy for a %s reward', (kind) => {
    const saved = kind === 'resource'
      ? ITEM_IDS.filter((id) => id !== 'carlitos').map((type) => ({ instanceId: `${type}-1` as const, type }))
      : [];
    const session = new SurvivalSession(saved, {
      seed: 1, initial: { energy: 3 }, initialChest: { state: 'closed', acquiredDay: 0 },
    });
    expect(session.perform('openChest')).toMatchObject({
      accepted: true, deltas: { energy: -3 }, rewardSummary: { kind },
    });
    expect(session.snapshot()).toMatchObject({ energy: 0, chest: { state: 'none' } });
  });
});

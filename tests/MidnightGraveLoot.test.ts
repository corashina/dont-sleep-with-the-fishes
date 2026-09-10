import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS, ITEM_IDS } from '../src/game/ItemState';
import { drawMidnightGraveLoot } from '../src/survival/midnightGraveLoot';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from './helpers/random';

describe('Midnight grave rewards', () => {
  it('limits every reward to food, bait, or one missing item with weight 1', () => {
    const seen = new Set<string>();
    for (let index = 0; index < 100; index += 1) {
      const loot = drawMidnightGraveLoot(new Set(['knife']), { next: () => index / 100 });
      expect((loot.items?.length ?? 0) + (loot.resources?.length ?? 0)).toBe(1);
      for (const resource of loot.resources ?? []) {
        expect(['food', 'bait']).toContain(resource.resource);
        expect(resource.value).toBe(1);
        seen.add(resource.resource);
      }
      for (const item of loot.items ?? []) {
        expect(item.kind).toBe('gain');
        if (item.kind !== 'gain') throw new Error('Expected an item gain');
        expect(ITEM_DEFINITIONS[item.itemId].weight).toBe(1);
        expect(item.itemId).not.toBe('knife');
        expect(item.quantity).toBe(1);
        seen.add(item.itemId);
      }
    }
    expect(seen.has('food')).toBe(true);
    expect(seen.has('bait')).toBe(true);
    expect(seen.has('compass')).toBe(true);
  });

  it('still yields food or bait when all items are owned', () => {
    for (const roll of [0, 0.999]) {
      const loot = drawMidnightGraveLoot(new Set(ITEM_IDS), { next: () => roll });
      expect(loot.items).toBeUndefined();
      expect(loot.resources?.[0]?.resource).toBe(roll === 0 ? 'food' : 'bait');
    }
  });

  it.each([
    [0, 'tour-chest'], [0.39999, 'tour-chest'],
    [0.4, 'tour-grave'], [0.59999, 'tour-grave'],
    [0.8, 'tour-attack'], [0.99999, 'tour-attack'],
  ])('resolves roll %s as %s', (roll, resultId) => {
    const session = new SurvivalSession([], {
      seed: 11, initialEventId: 'midnight-tour', random: sequenceRandom([roll, 0]),
    });
    expect(session.resolveEvent({ kind: 'choice', choiceId: 'visit' }).eventResult?.resultId).toBe(resultId);
  });

  it.each([0, 0.1, 0.5])('reports the actual grave gain and keeps it through dawn, roll %s', (roll) => {
    const session = new SurvivalSession([], {
      seed: 11, initialEventId: 'midnight-tour', random: sequenceRandom([0.5, roll, 0.99]),
    });
    const result = session.resolveEvent({ kind: 'choice', choiceId: 'visit' });
    expect(result.eventResult?.resultId).toBe('tour-grave');
    expect(result.rewardSummary?.kind).toBe('bundle');
    if (result.rewardSummary?.kind !== 'bundle') throw new Error('Expected rewards');
    expect(result.rewardSummary.rewards).toHaveLength(1);
    const reward = result.rewardSummary.rewards[0]!;
    expect(session.snapshot().chest.state).toBe('none');
    expect(session.beginDawn().accepted).toBe(true);
    expect(session.snapshot()).toMatchObject({ day: 2, energy: 2 });
    if (reward.kind === 'resource') {
      expect(session.snapshot()[reward.id]).toBe(reward.quantity);
    } else {
      expect(Object.values(session.snapshot().inventory).some((item) => item?.type === reward.id)).toBe(true);
      expect(ITEM_DEFINITIONS[reward.id].weight).toBe(1);
    }
  });
});

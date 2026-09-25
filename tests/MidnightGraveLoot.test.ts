import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS } from '../src/game/ItemState';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from './helpers/random';

describe('Midnight grave rewards', () => {

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
    } else if (reward.kind === 'item') {
      expect(Object.values(session.snapshot().inventory).some((item) => item?.type === reward.id)).toBe(true);
      expect(ITEM_DEFINITIONS[reward.id].weight).toBe(1);
    }
  });
});

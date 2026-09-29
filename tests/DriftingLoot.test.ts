import { describe,expect,it } from 'vitest';
import { drawDriftingLoot } from '../src/survival/driftingLoot';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createSurvivalSaveDocument,parseSurvivalSaveDocument } from '../src/survival/SurvivalSaveData';
import { sequenceRandom } from './helpers/random';

describe('drifting loot', () => {

  // Importance: 95/100. A carcass grants supplies only, within the displayed limits.
  it.each([
    [0, ['food']],
    [0.4, ['bait']],
    [0.9, ['food', 'bait']],
  ] as const)('draws whale supplies at roll %s', (roll, ids) => {
    const rewards = drawDriftingLoot('whale', new Set(), sequenceRandom([roll, 0.99, 0.99]));
    expect(rewards).toEqual(ids.map(id => ({ kind: 'resource', id, quantity: 3 })));
  });

  it('does not award owned consumables', () => {
    const rewards = drawDriftingLoot(
      'barrel',
      new Set(['ductTape', 'energyBar']),
      sequenceRandom([0, 0, 0, 0]),
    );
    expect(rewards.filter((reward) => reward.kind === 'item')).toEqual([]);
  });

  it('saves and restores all rewards in a bundle', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const session = new SurvivalSession([], { seed, initial: { day: 3 }, initialEventId: 'drifting-supplies' });
      const outcome = session.resolveEvent({ kind: 'choice', choiceId: 'retrieve' });
      expect(outcome.rewardSummary?.kind).toBe('bundle');
      const document = createSurvivalSaveDocument({ scavengeElapsedSeconds: 0, session: session.exportCheckpoint() });
      const parsed = parseSurvivalSaveDocument(JSON.parse(JSON.stringify(document)));
      expect(parsed).not.toBeNull();
      expect(SurvivalSession.restore(parsed!.checkpoint.session).snapshot().lastOutcome?.rewardSummary).toEqual(outcome.rewardSummary);
    }
  });
});

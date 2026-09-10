import { describe,expect,it } from 'vitest';
import { ITEM_DEFINITIONS,type ItemId } from '../src/game/ItemState';
import { DRIFTING_LOOT_POOLS,drawDriftingLoot } from '../src/survival/driftingLoot';
import { DRIFTING_SUPPLY_KINDS } from '../src/survival/driftingSupplies';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createSurvivalSaveDocument,parseSurvivalSaveDocument } from '../src/survival/SurvivalSaveData';
import { sequenceRandom } from './helpers/random';

describe('drifting loot', () => {
  it.each(DRIFTING_SUPPLY_KINDS)('keeps %s supply quantities independent and within 1–3', (kind) => {
    const rewards = drawDriftingLoot(kind, new Set(), sequenceRandom([0.99, 0, 0.999, 0.99, 0.99]));
    expect(rewards).toEqual([
      { kind: 'resource', id: 'food', quantity: 1 },
      { kind: 'resource', id: 'bait', quantity: 3 },
    ]);
  });

  it('redistributes owned durable weights while keeping the no-item chance', () => {
    const owned = new Set(DRIFTING_LOOT_POOLS.container.valuable.filter(([id]) => ITEM_DEFINITIONS[id].durable).map(([id]) => id));
    for (let index = 0; index < 100; index += 1) {
      const rewards = drawDriftingLoot('container', owned, sequenceRandom([0, 0, 0, (index + 0.5) / 100]));
      const items = rewards.filter(reward => reward.kind === 'item');
      expect(items).toHaveLength(index < 95 ? 1 : 0);
      for (const item of items) expect(owned.has(item.id as ItemId)).toBe(false);
    }
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

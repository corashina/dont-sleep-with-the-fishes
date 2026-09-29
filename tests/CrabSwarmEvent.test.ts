// Importance: 95/100. Theft must remove exactly one item and never remove Carlitos.
import { describe, expect, it } from 'vitest';
import type { ItemId, ItemInstanceId } from '../src/game/ItemState';
import { SurvivalSession } from '../src/survival/SurvivalSession';

function game(items: ItemId[], seed = 42) {
  return new SurvivalSession(items.map(type => ({ type, instanceId: `${type}-1` as ItemInstanceId })), {
    seed, initialEventId: 'crab-swarm', initial: { day: 10, food: 0, bait: 0 },
  });
}

describe('Crab swarm', () => {
  it.each(['fishingNet', 'bucket', 'knife'] as const)('defends with %s without item loss or damage', item => {
    const session = game([item, 'map', 'carlitos']);
    const before = session.snapshot();
    const outcome = session.resolveEvent({ kind: 'item', choiceId: item, instanceId: `${item}-1` });
    expect(outcome.accepted).toBe(true);
    expect(session.snapshot().inventory).toEqual(before.inventory);
    expect(session.snapshot().health).toBe(before.health);
    expect(session.snapshot().hull).toBe(before.hull);
  });

  it.each(['sleep', 'flashlight'])('steals one item after %s and persists the loss', choiceId => {
    for (let seed = 0; seed < 16; seed += 1) {
      const session = game(['flashlight', 'map', 'bucket', 'carlitos'], seed);
      const before = session.snapshot();
      const outcome = session.resolveEvent(choiceId === 'sleep'
        ? { kind: 'choice', choiceId }
        : { kind: 'item', choiceId, instanceId: 'flashlight-1' });
      expect(outcome.accepted).toBe(true);
      const after = session.snapshot();
      const lost = Object.values(after.inventory).filter(item => item?.condition === 'lost');
      expect(lost).toHaveLength(1);
      expect(before.carlitos).not.toBeNull();
      expect(after.carlitos).toEqual(before.carlitos);
      expect(after.health).toBe(before.health);
      expect(after.hull).toBe(before.hull);
      expect(session.resolveEvent({ kind: 'choice', choiceId: 'sleep' }).accepted).toBe(false);
      expect(SurvivalSession.restore(session.exportCheckpoint()).snapshot().inventory).toEqual(after.inventory);
    }
  });

  it('rejects a defense item that is not aboard', () => {
    const session = game(['map']);
    const before = session.snapshot();
    expect(session.resolveEvent({ kind: 'item', choiceId: 'bucket', instanceId: 'bucket-1' }).accepted).toBe(false);
    expect(session.snapshot().inventory).toEqual(before.inventory);
  });
});

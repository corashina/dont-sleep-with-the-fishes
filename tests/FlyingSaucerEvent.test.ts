import { describe, expect, it } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import { SurvivalSession } from '../src/survival/SurvivalSession';

function session() {
  return new SurvivalSession([
    { instanceId: 'flareGun-1' as ItemInstanceId, type: 'flareGun' },
    { instanceId: 'flashlight-1' as ItemInstanceId, type: 'flashlight' },
  ], { seed: 42, initial: { day: 15 }, initialEventId: 'flying-saucer', radioSignalsEnabled: false });
}

describe('flying saucer event', () => {
  it.each(['flareGun', 'flashlight'] as const)('damages the player after a %s signal', (itemId) => {
    const game = session();
    const before = game.snapshot();
    const result = game.resolveEvent({ kind: 'item', choiceId: itemId, instanceId: `${itemId}-1` as ItemInstanceId });
    expect(result).toMatchObject({ accepted: true, eventResult: { resultId: 'ufo-beam-hit' } });
    const after = game.snapshot();
    expect(after).toMatchObject({
      state: 'nightEvent', pendingEventId: null, ending: null,
      health: before.health - 40, hull: before.hull, rescueLead: before.rescueLead,
    });
    expect(after.inventory['flareGun-1' as ItemInstanceId]?.condition).toBe(itemId === 'flareGun' ? 'consumed' : 'usable');
    expect(after.inventory['flashlight-1' as ItemInstanceId]?.condition).toBe('usable');
    expect(game.exportCheckpoint().pendingEventId).toBeNull();
    expect(game.beginDawn().accepted).toBe(true);
  });

  it.each(['hide', 'timeout'] as const)('survives by staying silent: %s', (action) => {
    const game = session();
    const result = game.resolveEvent(action === 'hide' ? { kind: 'choice', choiceId: 'sleep' } : { kind: 'endure' });
    expect(result).toMatchObject({ accepted: true, eventResult: { resultId: 'ufo-pass' } });
    expect(game.snapshot()).toMatchObject({ ending: null, pendingEventId: null });
    expect(game.snapshot().inventory['flareGun-1' as ItemInstanceId]?.condition).toBe('usable');
  });
});

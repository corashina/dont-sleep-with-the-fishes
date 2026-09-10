import { describe, expect, it } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import { survivalEventById } from '../src/survival/eventCatalog';
import { resolveEventItemUseContext } from '../src/survival/eventItemUseChoreography';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from './helpers/random';

function session(health = 100) {
  return new SurvivalSession([
    { instanceId: 'flareGun-1' as ItemInstanceId, type: 'flareGun' },
    { instanceId: 'flashlight-1' as ItemInstanceId, type: 'flashlight' },
    { instanceId: 'shotgun-1' as ItemInstanceId, type: 'shotgun' },
    { instanceId: 'radio-1' as ItemInstanceId, type: 'radio' },
    { instanceId: 'spyglass-1' as ItemInstanceId, type: 'spyglass' },
  ], {
    seed: 42, random: sequenceRandom([0]), initial: { day: 15, health },
    initialEventId: 'ghost-ship', radioSignalsEnabled: false,
  });
}

describe('ghost ship event', () => {
  it.each([
    ['flashlight', 'usable', 'flashlight-signal'],
    ['flareGun', 'consumed', 'flare-sky'],
    ['shotgun', 'consumed', 'shotgun-fire'],
  ] as const)('punishes %s signals and uses the normal item cost', (itemId, condition, context) => {
    const game = session();
    const before = game.snapshot();
    const instanceId = `${itemId}-1` as ItemInstanceId;
    expect(resolveEventItemUseContext('ghost-ship', itemId, itemId)).toBe(context);
    const result = game.resolveEvent({ kind: 'item', choiceId: itemId, instanceId });
    expect(result).toMatchObject({
      accepted: true, deltas: { health: -20, pressure: 1 },
      eventResult: { eventId: 'ghost-ship', resultId: 'ghost-ship-signaled' },
    });
    expect(game.snapshot()).toMatchObject({
      health: before.health - 20, pressure: before.pressure + 1,
      hull: before.hull, rescueLead: before.rescueLead,
      inventory: { [instanceId]: { condition } },
    });
  });

  it.each(['silent', 'timeout'] as const)('passes safely on %s without spending items', (action) => {
    const game = session();
    const before = game.snapshot();
    expect(game.resolveEvent(action === 'silent'
      ? { kind: 'choice', choiceId: 'sleep' } : { kind: 'endure' })).toMatchObject({
      accepted: true, eventResult: { resultId: 'ghost-ship-pass' },
    });
    expect(game.snapshot()).toMatchObject({
      health: before.health, pressure: before.pressure, hull: before.hull,
      rescueLead: before.rescueLead, inventory: before.inventory,
    });
  });

  it('offers shotgun instead of radio and rejects a radio signal', () => {
    expect(survivalEventById('ghost-ship')!.choices.map(({ id }) => id))
      .toEqual(['spyglass', 'flashlight', 'flareGun', 'shotgun', 'sleep']);
    expect(session().resolveEvent({ kind: 'item', choiceId: 'radio', instanceId: 'radio-1' }).accepted).toBe(false);
  });

  it('uses the normal death path when the signal drains the remaining health', () => {
    const game = session(20);
    expect(game.resolveEvent({ kind: 'item', choiceId: 'shotgun', instanceId: 'shotgun-1' }).accepted).toBe(true);
    expect(game.snapshot()).toMatchObject({ health: 0, state: 'dead' });
  });
});

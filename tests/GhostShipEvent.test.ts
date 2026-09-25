import { describe, expect, it } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import { survivalEventById } from '../src/survival/eventCatalog';
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

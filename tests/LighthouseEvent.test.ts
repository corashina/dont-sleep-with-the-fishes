import { describe,expect,it } from 'vitest';
import type { ItemId,ItemInstanceId } from '../src/game/ItemState';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from './helpers/random';

function session(itemId?: ItemId): SurvivalSession {
  return new SurvivalSession(itemId === undefined ? [] : [{
    type: itemId, instanceId: `${itemId}-1` as ItemInstanceId,
  }], {
    seed: 1, random: sequenceRandom([0]),
    initial: { day: 15, rescueLead: 2 }, initialEventId: 'lighthouse',
  });
}

describe('lighthouse signals', () => {

  it('rejects a signal without the required item', () => {
    expect(session().resolveEvent({
      kind: 'item', choiceId: 'flareGun', instanceId: 'flareGun-1',
    }).accepted).toBe(false);
  });
});

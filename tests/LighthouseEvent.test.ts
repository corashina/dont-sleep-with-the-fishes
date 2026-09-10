import { describe,expect,it } from 'vitest';
import type { ItemId,ItemInstanceId } from '../src/game/ItemState';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { resolveEventItemUseContext } from '../src/survival/eventItemUseChoreography';
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
  it.each([
    ['flareGun', 4, 'consumed', 'flare-sky'],
    ['flashlight', 2, 'usable', 'flashlight-signal'],
    ['shotgun', 1, 'consumed', 'shotgun-fire'],
  ] as const)('resolves %s with its normal animation and item cost', (itemId, lead, condition, context) => {
    const run = session(itemId);
    const instanceId = `${itemId}-1` as ItemInstanceId;
    expect(resolveEventItemUseContext('lighthouse', itemId, itemId)).toBe(context);
    expect(run.resolveEvent({ kind: 'item', choiceId: itemId, instanceId })).toMatchObject({
      accepted: true, deltas: { rescueLead: lead }, eventResult: { eventId: 'lighthouse' },
    });
    expect(run.snapshot()).toMatchObject({
      rescueLead: 2 + lead, inventory: { [instanceId]: { condition } },
    });
  });

  it('rejects a signal without the required item', () => {
    expect(session().resolveEvent({
      kind: 'item', choiceId: 'flareGun', instanceId: 'flareGun-1',
    }).accepted).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import type { ItemId, ItemInstanceId } from '../src/game/ItemState';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from './helpers/random';

function session(eventId: string, items: ItemId[], roll = 0, food = 3) {
  return new SurvivalSession(items.map((type, index) => ({
    type, instanceId: `${type}-${index + 1}` as ItemInstanceId,
  })), {
    seed: 41,
    initialEventId: eventId,
    random: sequenceRandom([roll]),
    initial: { day: 20, food, energy: 0, hunger: 0 },
  });
}

function use(game: SurvivalSession, type: ItemId) {
  const item = Object.values(game.snapshot().inventory).find((entry) => entry?.type === type)!;
  return game.resolveEvent({ kind: 'item', choiceId: type, instanceId: item.instanceId });
}

describe('new event player options', () => {

  it('rejects a shark distraction without enough Food', () => {
    const game = session('swarm-of-sharks', ['cannedFood'], 0, 0);
    const before = game.snapshot();
    expect(use(game, 'cannedFood').accepted).toBe(false);
    expect(game.snapshot()).toEqual(before);
  });
});

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
  it.each([0, 0.99])('protects the Snatcher target with the net, roll %s', (roll) => {
    const game = session('snatcher', ['fishingNet', 'bucket'], roll);
    const result = use(game, 'fishingNet');
    expect(result.accepted).toBe(true);
    expect(game.snapshot().health).toBe(100);
    expect(Object.values(game.snapshot().inventory).find((item) => item?.type === 'bucket')?.condition).toBe('usable');
    expect(Object.values(game.snapshot().inventory).find((item) => item?.type === 'fishingNet')?.condition)
      .toBe(roll === 0 ? 'usable' : 'broken');
  });

  it.each([
    ['swarm-of-sharks', 2],
    ['something-under-us', 1],
  ] as const)('spends Food to divert %s', (event, cost) => {
    const game = session(event, ['cannedFood']);
    const before = game.snapshot();
    expect(use(game, 'cannedFood').accepted).toBe(true);
    expect(game.snapshot().food).toBe(before.food - cost);
    expect(game.snapshot().health).toBe(before.health);
    expect(game.snapshot().hull).toBe(before.hull);
    game.beginDawn();
    expect(game.snapshot().energy).toBe(3);
  });

  it('rejects a shark distraction without enough Food', () => {
    const game = session('swarm-of-sharks', ['cannedFood'], 0, 1);
    const before = game.snapshot();
    expect(use(game, 'cannedFood').accepted).toBe(false);
    expect(game.snapshot()).toEqual(before);
  });

  it('uses Tape to protect supplies while wind still damages the hull', () => {
    const game = session('windy-night', ['ductTape', 'bucket']);
    expect(use(game, 'ductTape').accepted).toBe(true);
    expect(game.snapshot().hull).toBe(90);
    expect(Object.values(game.snapshot().inventory).find((item) => item?.type === 'ductTape')?.condition).toBe('consumed');
    expect(Object.values(game.snapshot().inventory).find((item) => item?.type === 'bucket')?.condition).toBe('usable');
  });

  it.each([0, 0.99])('uses the Anchor in shallow dangerous waters, roll %s', (roll) => {
    const game = session('dangerous-waters', ['anchor'], roll);
    expect(use(game, 'anchor').accepted).toBe(true);
    expect(game.snapshot().hull).toBe(roll === 0 ? 100 : 90);
    expect(Object.values(game.snapshot().inventory)[0]?.condition).toBe(roll === 0 ? 'usable' : 'broken');
  });

  it.each([0, 0.99])('keeps Binoculars and charges lookout sleep at dawn, roll %s', (roll) => {
    const game = session('dangerous-waters', ['spyglass'], roll);
    expect(use(game, 'spyglass').accepted).toBe(true);
    expect(game.snapshot().hull).toBe(roll === 0 ? 100 : 90);
    expect(Object.values(game.snapshot().inventory)[0]?.condition).toBe('usable');
    expect(game.snapshot().energy).toBe(0);
    game.beginDawn();
    expect(game.snapshot().energy).toBe(2);
  });

  it('calls Other People without a dawn signal, keeps Radio, and charges sleep at dawn', () => {
    const game = session('other-people', ['radio']);
    const before = game.snapshot();
    const result = use(game, 'radio');
    expect(result.accepted).toBe(true);
    expect(result.eventResult?.resultId).toBe('people-signaled');
    expect(game.snapshot().rescueLead).toBe(before.rescueLead + 5);
    expect(Object.values(game.snapshot().inventory)[0]?.condition).toBe('usable');
    expect(game.snapshot().state).not.toBe('rescued');
    game.beginDawn();
    expect(game.snapshot().energy).toBe(2);
  });
});

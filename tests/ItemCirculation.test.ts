import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS, ITEM_IDS, type ItemId, type ItemInstance } from '../src/game/ItemState';
import { survivalEventById } from '../src/survival/eventCatalog';
import { formatJournalEntry } from '../src/survival/journal';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { prepareTradeEvent } from '../src/survival/tradeEvents';
import { sequenceRandom } from './helpers/random';

const saved = (...ids: ItemId[]): ItemInstance[] => ids.map((type) => ({ type, instanceId: `${type}-1` }));

describe('item circulation', () => {
  it('consumes one tape per repair and never repairs without another tape', () => {
    const game = new SurvivalSession(saved('ductTape', 'map', 'flashlight'), {
      seed: 2, initialConditions: { 'map-1': 'broken', 'flashlight-1': 'broken' },
    });
    expect(game.perform('repairItem', { kind: 'itemRepair', target: 'map-1' }).accepted).toBe(true);
    expect(game.snapshot().inventory['ductTape-1']?.condition).toBe('consumed');
    expect(game.snapshot().inventory['map-1']?.condition).toBe('usable');
    const before = game.snapshot();
    expect(game.perform('repairItem', { kind: 'itemRepair', target: 'flashlight-1' }))
      .toMatchObject({ accepted: false, code: 'no-duct-tape' });
    expect(game.snapshot()).toEqual(before);
  });

  it('can discard broken equipment without tape, then recover its type from a chest', () => {
    const game = new SurvivalSession(saved(...ITEM_IDS.filter((id) => id !== 'carlitos')), {
      seed: 2, initialConditions: { 'scubaSet-1': 'broken' },
      initialChest: { state: 'closed', acquiredDay: 0 },
    });
    expect(game.perform('discardItem', { kind: 'itemDiscard', target: 'scubaSet-1' }).accepted).toBe(true);
    expect(game.perform('openChest').rewardSummary).toEqual({ kind: 'item', id: 'scubaSet', quantity: 1 });
    expect(game.snapshot().inventory['scubaSet-1']?.condition).toBe('usable');
  });

  it('rejects discard of usable equipment without changing the inventory', () => {
    const game = new SurvivalSession(saved('scubaSet'), { seed: 2 });
    const before = game.snapshot();
    expect(game.perform('discardItem', { kind: 'itemDiscard', target: 'scubaSet-1' }).accepted).toBe(false);
    expect(game.snapshot()).toEqual(before);
  });

  it.each([
    ['plane', 0.049, 'broken'], ['plane', 0.05, 'usable'],
    ['death-stare', 0.399, 'broken'], ['death-stare', 0.4, 'usable'],
  ] as const)('uses contextual flashlight wear for %s at %s', (eventId, wearRoll, condition) => {
    const game = new SurvivalSession(saved('flashlight'), {
      seed: 1, initialEventId: eventId, random: sequenceRandom([0, wearRoll]),
    });
    expect(game.resolveEvent({ kind: 'item', choiceId: 'flashlight', instanceId: 'flashlight-1' }).accepted).toBe(true);
    expect(game.snapshot().inventory['flashlight-1']?.condition).toBe(condition);
    if (eventId === 'plane') expect(game.snapshot().rescueLead).toBe(2);
  });

  it('keeps the completed dive reward when scuba breaks', () => {
    const game = new SurvivalSession(saved('scubaSet'), {
      seed: 2, random: sequenceRandom([0, 0.99, 0, 0, 0.149]),
    });
    expect(game.perform('dive')).toMatchObject({ accepted: true, deltas: { food: 1 } });
    expect(game.snapshot().inventory['scubaSet-1']?.condition).toBe('broken');
  });

  it('does not wear equipment on a rejected or cancelled action', () => {
    let rolls = 0;
    const game = new SurvivalSession(saved('scubaSet', 'fishingNet'), {
      seed: 2, initial: { energy: 2 }, random: { next: () => { rolls += 1; return 0; } },
    });
    expect(game.perform('dive').accepted).toBe(false);
    expect(rolls).toBe(0);
    const begun = game.beginFishing('net');
    if (!begun.accepted) throw new Error('Expected net fishing.');
    const beforeCancel = rolls;
    expect(game.cancelFishing(begun.attempt.view().id).accepted).toBe(true);
    expect(rolls).toBe(beforeCancel);
    expect(game.snapshot().inventory['fishingNet-1']?.condition).toBe('usable');
  });

  it('consumes a swim ring even when its event outcome succeeds', () => {
    const game = new SurvivalSession(saved('swimRing'), {
      seed: 2, initialEventId: 'tornado', random: sequenceRandom([0]),
    });
    expect(game.resolveEvent({ kind: 'item', choiceId: 'swimRing', instanceId: 'swimRing-1' }).accepted).toBe(true);
    expect(game.snapshot().inventory['swimRing-1']?.condition).toBe('consumed');
  });

  it('Handyman exchanges equal weights, hides the reward, and excludes owned equipment', () => {
    const game = new SurvivalSession(saved('anchor'), { seed: 3, initialEventId: 'handyman' });
    const prepared = prepareTradeEvent(survivalEventById('handyman')!, game.snapshot());
    const choice = prepared.choices.find((entry) => entry.id === 'anchor')!;
    expect(choice.label.toLowerCase()).not.toMatch(/scuba|nurkowania|buceo/);
    expect(choice.outcomes[0].effects.items).toBeUndefined();
    const outcome = game.resolveEvent({ kind: 'item', choiceId: 'anchor', instanceId: 'anchor-1' });
    expect(outcome.rewardSummary).toEqual({ kind: 'item', id: 'scubaSet', quantity: 1 });
    expect(ITEM_DEFINITIONS.anchor.weight).toBe(ITEM_DEFINITIONS.scubaSet.weight);
    expect(game.snapshot().inventory['anchor-1']?.condition).toBe('lost');
    expect(game.snapshot().inventory['scubaSet-1']?.condition).toBe('usable');
    expect(game.beginDawn().accepted).toBe(true);
    expect(formatJournalEntry(game.snapshot().journalEntries[0]!).nighttime).toMatch(/scuba|nurkowania|buceo/);
  });

  it('Handyman refuses a full weight pool without taking payment', () => {
    const game = new SurvivalSession(saved('anchor', 'scubaSet'), {
      seed: 3, initialEventId: 'handyman', initialConditions: { 'scubaSet-1': 'broken' },
    });
    const before = game.snapshot();
    expect(game.resolveEvent({ kind: 'item', choiceId: 'anchor', instanceId: 'anchor-1' }).accepted).toBe(false);
    expect(game.snapshot()).toEqual(before);
  });

  it.each(['handyman', 'night-trader'] as const)('keeps %s exchange stable through a checkpoint', (eventId) => {
    const game = new SurvivalSession(saved('anchor'), {
      seed: 3, initialEventId: eventId, initial: { food: 6, bait: 6, day: 20 },
    });
    const restored = SurvivalSession.restore(game.exportCheckpoint());
    const response = eventId === 'handyman'
      ? { kind: 'item' as const, choiceId: 'anchor', instanceId: 'anchor-1' as const }
      : { kind: 'choice' as const, choiceId: 'food-equipment' };
    expect(restored.resolveEvent(response)).toEqual(game.resolveEvent(response));
    expect(restored.exportCheckpoint()).toEqual(game.exportCheckpoint());
  });

  it('trader shows stock and price, charges once, and grants the shown item', () => {
    const game = new SurvivalSession([], { seed: 8, initialEventId: 'night-trader', initial: { food: 3 } });
    const event = prepareTradeEvent(survivalEventById('night-trader')!, game.snapshot());
    const choice = event.choices.find((entry) => entry.id === 'food-equipment')!;
    const gain = choice.outcomes[0].effects.items![0]!;
    if (gain.kind !== 'gain') throw new Error('Expected a gain.');
    expect(choice.label).toContain('3');
    expect(game.resolveEvent({ kind: 'choice', choiceId: choice.id }).rewardSummary)
      .toEqual({ kind: 'item', id: gain.itemId, quantity: 1 });
    expect(game.snapshot().food).toBe(0);
    expect(game.resolveEvent({ kind: 'choice', choiceId: choice.id }).accepted).toBe(false);
  });

  it('does not take a trader payment when the player cannot afford the offer', () => {
    const game = new SurvivalSession([], { seed: 8, initialEventId: 'night-trader', initial: { food: 2 } });
    const before = game.snapshot();
    expect(game.resolveEvent({ kind: 'choice', choiceId: 'food-equipment' }).accepted).toBe(false);
    expect(game.snapshot()).toEqual(before);
  });
});

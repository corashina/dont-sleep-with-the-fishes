import { describe, expect, it } from 'vitest';
import { ITEM_IDS, type ItemId, type ItemInstance } from '../src/game/ItemState';
import { drawDiveItem } from '../src/survival/diveRewards';
import { formatJournalEntry } from '../src/survival/journal';
import { formatDiveResult } from '../src/survival/SurvivalDayActionFlow';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from './helpers/random';

const inventoryIds = ITEM_IDS.filter((id) => id !== 'carlitos');
const saved = (ids: readonly ItemId[]): ItemInstance[] => ids.map((type) => ({
  type, instanceId: `${type}-1`,
}));

describe('dive item selection', () => {
  it.each(inventoryIds)('includes missing %s', (missing) => {
    const present = new Set(inventoryIds.filter((id) => id !== missing));
    expect(drawDiveItem(present, sequenceRandom([0.5]))).toBe(missing);
  });

  it('assigns relative chances of 3, 2, and 1 to item weights 1, 2, and 3', () => {
    const present = new Set(inventoryIds.filter((id) => !['compass', 'medicalKit', 'anchor'].includes(id)));
    const results = Array.from({ length: 600 }, (_, index) => (
      drawDiveItem(present, sequenceRandom([(index + 0.5) / 600]))
    ));
    expect(results.filter((id) => id === 'compass')).toHaveLength(300);
    expect(results.filter((id) => id === 'medicalKit')).toHaveLength(200);
    expect(results.filter((id) => id === 'anchor')).toHaveLength(100);
  });

  it('returns no item when every inventory item is present', () => {
    expect(drawDiveItem(new Set(inventoryIds), sequenceRandom([0]))).toBeNull();
  });
});

describe('normal dive item rewards', () => {
  it.each(['calm', 'overcast'] as const)('gives an item on 10%% of all dives in %s weather', (weather) => {
    let itemFinds = 0;
    for (let index = 0; index < 100; index += 1) {
      const session = new SurvivalSession(saved(['scubaSet']), {
        seed: 1, weather, random: sequenceRandom([(index + 0.5) / 100, 0.99, 0]),
      });
      if (session.perform('dive').rewardSummary?.kind === 'item') itemFinds += 1;
    }
    expect(itemFinds).toBe(10);
  });

  it.each(inventoryIds.filter((id) => id !== 'scubaSet'))('adds missing %s and preserves it on restore', (missing) => {
    const session = new SurvivalSession(saved(inventoryIds.filter((id) => id !== missing)), {
      seed: 1, weather: 'calm',
    });
    const outcome = session.perform('dive');
    expect(outcome.rewardSummary).toEqual({ kind: 'item', id: missing, quantity: 1 });
    expect(session.snapshot().inventory[`${missing}-1`]?.condition).toBe('usable');
    expect(formatDiveResult(outcome)).toMatchObject({ reward: outcome.rewardSummary });
    expect(formatDiveResult(outcome).lines).not.toContain('Nothing found.');
    expect(SurvivalSession.restore(session.exportCheckpoint()).snapshot()).toEqual(session.snapshot());
  });

  it('excludes broken items and usable copies with another instance number', () => {
    const items = saved(inventoryIds.filter((id) => id !== 'anchor' && id !== 'cannedFood'));
    items.push({ type: 'cannedFood', instanceId: 'cannedFood-2' });
    const session = new SurvivalSession(items, {
      seed: 1, weather: 'calm', random: sequenceRandom([0.6, 0.99, 0]),
      initialConditions: { 'compass-1': 'broken' },
    });
    expect(session.perform('dive').rewardSummary?.id).toBe('anchor');
    expect(session.snapshot().inventory['compass-1']?.condition).toBe('broken');
    expect(session.snapshot().inventory['cannedFood-1']).toBeUndefined();
  });

  it.each(['lost', 'consumed'] as const)('can recover a %s item', (condition) => {
    const session = new SurvivalSession(saved(inventoryIds), {
      seed: 1, weather: 'calm', random: sequenceRandom([0.6, 0.99, 0]),
      initialConditions: { 'medicalKit-1': condition },
    });
    expect(session.perform('dive').rewardSummary?.id).toBe('medicalKit');
    expect(session.snapshot().inventory['medicalKit-1']?.condition).toBe('usable');
  });

  it.each([
    ['cannedFood', 'food', 'recoveredFood'], ['baitTin', 'bait', 'recoveredBait'],
  ] as const)('adds the usable resource for %s', (missing, resource, recoveredResource) => {
    const session = new SurvivalSession(saved(inventoryIds.filter((id) => id !== missing)), {
      seed: 1, weather: 'calm', random: sequenceRandom([0.6, 0.99, 0]),
    });
    expect(session.perform('dive').deltas[resource]).toBe(1);
    expect(session.snapshot()[resource]).toBe(1);
    expect(session.snapshot()[recoveredResource]).toBe(1);
  });

  it('uses the existing supply reward when no item is missing', () => {
    const session = new SurvivalSession(saved(inventoryIds), {
      seed: 1, weather: 'calm', random: sequenceRandom([0.6, 0.99, 0, 0]),
    });
    expect(session.perform('dive')).toMatchObject({ code: 'dive-recovered', deltas: { energy: -3, food: 1 } });
    expect(session.snapshot().lastOutcome?.rewardSummary).toBeUndefined();
  });

  it('records an item and injury without calling the dive empty', () => {
    const session = new SurvivalSession(saved(inventoryIds.filter((id) => id !== 'compass')), {
      seed: 1, weather: 'calm', random: sequenceRandom([0.6, 0, 0, 0]),
    });
    expect(session.perform('dive')).toMatchObject({
      deltas: { energy: -3, health: -15 }, rewardSummary: { id: 'compass' },
    });
    session.endDay();
    const entry = session.snapshot().journalEntries.at(-1)!;
    expect(entry.actions[0]).toMatchObject({
      action: 'dive', inventoryMutations: [{ kind: 'gain', instanceIds: ['compass-1'] }],
    });
    const text = formatJournalEntry(entry).daytime;
    expect(text).toContain('compass');
    expect(text).toContain('I came back hurt');
    expect(text).not.toContain('empty-handed');
  });
});

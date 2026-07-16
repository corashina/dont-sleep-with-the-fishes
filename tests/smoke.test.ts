import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS, ITEM_IDS, createItemInstances } from '../src/game/ItemState';
import type { ItemId, ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import { ACTION_FOR_ITEM } from '../src/survival/BoatInteraction';
import { WEATHER_IDS } from '../src/survival/BoatWorld';
import { SURVIVAL_EVENTS } from '../src/survival/events';
import { SurvivalInventoryState } from '../src/survival/inventory';
import { formatDuration } from '../src/ui/formatDuration';

const saved = (...types: ItemId[]): ItemInstance[] => types.map((type, index) => ({
  instanceId: `${type}-${index + 1}` as ItemInstanceId,
  type,
}));

describe('demo contracts', () => {
  it('exposes the complete physical-inventory milestone', () => {
    expect(ITEM_IDS).toHaveLength(19);
    expect(createItemInstances()).toHaveLength(22);
    expect(ITEM_DEFINITIONS.scubaSet.weight).toBe(3);
    expect(ACTION_FOR_ITEM.scubaSet).toBe('dive');
    expect(ACTION_FOR_ITEM.fishingRod).toBe('fish');
  });

  it('ships exactly seventeen authored survival events', () => {
    expect(SURVIVAL_EVENTS).toHaveLength(17);
    expect(new Set(SURVIVAL_EVENTS.map((event) => event.id)).size).toBe(SURVIVAL_EVENTS.length);
  });

  it('ships exactly three weather definitions', () => {
    expect(WEATHER_IDS).toEqual(['calm', 'overcast', 'squall']);
    expect(new Set(WEATHER_IDS).size).toBe(3);
  });

  it('maps all nineteen scavenged item types into per-instance survival state', () => {
    const inventory = new SurvivalInventoryState(saved(...ITEM_IDS)).snapshot();

    expect(Object.keys(inventory)).toHaveLength(ITEM_IDS.length);
    ITEM_IDS.forEach((id) => {
      const item = Object.values(inventory).find((candidate) => candidate?.type === id);
      expect(item?.condition).toBe('usable');
      expect(typeof ITEM_DEFINITIONS[id].durable).toBe('boolean');
      expect(ITEM_DEFINITIONS[id].charges === null || Number.isInteger(ITEM_DEFINITIONS[id].charges)).toBe(true);
    });
  });

  it.each([
    [120, '02:00'],
    [61, '01:01'],
    [0.1, '00:01'],
    [0, '00:00'],
  ] as const)('formats %s seconds as %s', (seconds, formatted) => {
    expect(formatDuration(seconds)).toBe(formatted);
  });
});

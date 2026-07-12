import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS, ITEM_IDS, createItemInstances } from '../src/game/ItemState';
import type { ItemId, ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import { ACTION_FOR_ITEM } from '../src/survival/BoatInteraction';
import { WEATHER_IDS } from '../src/survival/BoatWorld';
import { SURVIVAL_EVENTS } from '../src/survival/events';
import { createSurvivalInventory } from '../src/survival/inventory';
import { formatCountdown } from '../src/ui/GameUI';

const saved = (...types: ItemId[]): ItemInstance[] => types.map((type, index) => ({
  instanceId: `${type}-${index + 1}` as ItemInstanceId,
  type,
}));

describe('demo contracts', () => {
  it('exposes the complete physical-inventory milestone', () => {
    expect(ITEM_IDS).toHaveLength(9);
    expect(createItemInstances()).toHaveLength(14);
    expect(ITEM_DEFINITIONS.scubaSet.weight).toBe(3);
    expect(ACTION_FOR_ITEM.scubaSet).toBe('dive');
    expect(ACTION_FOR_ITEM.fishingRod).toBe('fish');
  });

  it('ships exactly sixteen authored survival events', () => {
    expect(SURVIVAL_EVENTS).toHaveLength(16);
    expect(new Set(SURVIVAL_EVENTS.map((event) => event.id)).size).toBe(SURVIVAL_EVENTS.length);
  });

  it('ships exactly three weather definitions', () => {
    expect(WEATHER_IDS).toEqual(['calm', 'overcast', 'squall']);
    expect(new Set(WEATHER_IDS).size).toBe(3);
  });

  it('maps all nine scavenged items into survival definitions', () => {
    const inventory = createSurvivalInventory(saved(...ITEM_IDS));

    expect(Object.keys(inventory).sort()).toEqual([...ITEM_IDS].sort());
    ITEM_IDS.forEach((id) => {
      expect(inventory[id].owned).toBe(true);
      expect(typeof inventory[id].durable).toBe('boolean');
      expect(inventory[id].charges === null || Number.isInteger(inventory[id].charges)).toBe(true);
    });
  });

  it.each([
    [120, '02:00'],
    [61, '01:01'],
    [0.1, '00:01'],
    [0, '00:00'],
  ] as const)('formats %s seconds as %s', (seconds, formatted) => {
    expect(formatCountdown(seconds)).toBe(formatted);
  });
});

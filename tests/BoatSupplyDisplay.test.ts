import { Group } from 'three';
import { describe, expect, it } from 'vitest';
import type { ItemInstance } from '../src/game/ItemState';
import { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import type { SurvivalSnapshot } from '../src/survival/survivalTypes';
import { createTestPropModels } from './helpers/propModels';

const foodItems = [
  { instanceId: 'cannedFood-1', type: 'cannedFood' },
  { instanceId: 'cannedFood-2', type: 'cannedFood' },
  { instanceId: 'cannedFood-3', type: 'cannedFood' },
] as const satisfies readonly ItemInstance[];

function snapshot(
  overrides: Partial<SurvivalSnapshot> = {},
): SurvivalSnapshot {
  return {
    state: 'day',
    day: 1,
    health: 100,
    hunger: 20,
    energy: 3,
    hull: 100,
    food: 0,
    bait: 0,
    recoveredFood: 0,
    recoveredBait: 0,
    repairMaterial: 0,
    rescueProgress: 0,
    weather: 'calm',
    actedToday: false,
    journalEntries: [],
    inventory: {},
    savedItems: [],
    pendingEventId: null,
    lastOutcome: null,
    seed: 8,
    ...overrides,
  };
}

describe('BoatSupplyDisplay', () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
    [7, 3],
  ] as const)('shows %i food as %i pooled copies', (quantity, visibleCopies) => {
    const library = createTestPropModels();
    const display = new BoatSupplyDisplay(library, new Group(), foodItems);
    display.sync(snapshot({ food: quantity, savedItems: foodItems }));

    expect(display.recordFor('cannedFood')).toMatchObject({
      quantity,
      usableQuantity: quantity,
      brokenQuantity: 0,
      visibleCopies,
    });
    expect(display.recordFor('cannedFood')?.root.children.filter(({ visible }) => visible))
      .toHaveLength(visibleCopies);
    display.dispose();
    library.dispose();
  });

  it('uses exact resource quantities for bait and repair material', () => {
    const library = createTestPropModels();
    const display = new BoatSupplyDisplay(library, new Group(), []);
    display.sync(snapshot({ bait: 5, repairMaterial: 4 }));

    expect(display.recordFor('baitTin')).toMatchObject({
      quantity: 5,
      visibleCopies: 3,
    });
    expect(display.recordFor('repairMaterial')).toMatchObject({
      quantity: 4,
      visibleCopies: 3,
      backingInstanceId: null,
    });
    display.dispose();
    library.dispose();
  });

  it('prefers an event-selected usable duplicate, then an eligible usable duplicate', () => {
    const library = createTestPropModels();
    const items = foodItems.slice(0, 2);
    const display = new BoatSupplyDisplay(library, new Group(), items);
    display.sync(snapshot({
      food: 2,
      savedItems: items,
      inventory: {
        'cannedFood-1': { ...items[0]!, condition: 'usable' },
        'cannedFood-2': { ...items[1]!, condition: 'usable' },
      },
    }));
    expect(display.recordFor('cannedFood')?.backingInstanceId).toBe('cannedFood-1');

    display.setEventEligibleItems(new Set(['cannedFood-2']));
    expect(display.recordFor('cannedFood')?.backingInstanceId).toBe('cannedFood-2');
    display.setEventSelectedItem('cannedFood-1');
    expect(display.recordFor('cannedFood')?.backingInstanceId).toBe('cannedFood-1');
    display.dispose();
    library.dispose();
  });

  it('preserves usable and broken counts under one item-type record', () => {
    const library = createTestPropModels();
    const items = [
      { instanceId: 'compass-1', type: 'compass' },
    ] as const satisfies readonly ItemInstance[];
    const display = new BoatSupplyDisplay(library, new Group(), items);
    display.sync(snapshot({
      savedItems: items,
      inventory: {
        'compass-1': { ...items[0], condition: 'broken' },
      },
    }));
    expect(display.recordFor('compass')).toMatchObject({
      quantity: 1,
      usableQuantity: 0,
      brokenQuantity: 1,
      visibleCopies: 1,
      backingInstanceId: 'compass-1',
    });
    display.dispose();
    library.dispose();
  });
});

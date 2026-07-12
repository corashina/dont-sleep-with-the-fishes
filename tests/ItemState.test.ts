import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS, ITEM_IDS, createItemInstances } from '../src/game/ItemState';

describe('physical item catalog', () => {
  it('defines the approved weights and counts', () => {
    expect(ITEM_DEFINITIONS.scubaSet).toMatchObject({ weight: 3, spawnCount: 1, durable: true });
    expect(ITEM_DEFINITIONS.fishingRod.weight).toBe(2);
    expect(ITEM_DEFINITIONS.cannedFood).toMatchObject({ weight: 1, spawnCount: 3, charges: 1 });
    expect(ITEM_DEFINITIONS.waterJug).toMatchObject({ weight: 2, spawnCount: 2, charges: 3 });
    expect(ITEM_IDS).toHaveLength(21);
  });

  it('creates twenty-five stable unique ship instances', () => {
    const first = createItemInstances();
    const second = createItemInstances();
    expect(first).toHaveLength(25);
    expect(first).toEqual(second);
    expect(new Set(first.map(({ instanceId }) => instanceId))).toHaveLength(25);
    expect(first.some(({ type }) => type === 'repairKit')).toBe(false);
    expect(first.filter(({ type }) => type === 'cannedFood').map(({ instanceId }) => instanceId))
      .toEqual(['cannedFood-1', 'cannedFood-2', 'cannedFood-3']);
  });
});

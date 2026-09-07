import { Group } from 'three';
import { describe, expect, it } from 'vitest';
import { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createTestPropModels } from './helpers/propModels';

describe('boat food display', () => {
  it('updates the food models up to six and reuses them when stock changes', () => {
    const models = createTestPropModels();
    const display = new BoatSupplyDisplay(models, new Group(), []);
    const base = new SurvivalSession([], { seed: 1 }).snapshot();
    const food = display.recordFor('cannedFood')!;
    const copies = [...food.root.children];
    try {
      for (const quantity of [0, 1, 2, 3, 4, 5, 6, 9, 5, 2, 0, 6]) {
        display.sync({ ...base, food: quantity, bait: 9 });
        const visible = food.root.children.filter((copy) => copy.visible);
        expect(visible).toHaveLength(Math.min(quantity, 6));
        expect(food.visibleCopies).toBe(visible.length);
        expect(food.quantity).toBe(quantity);
        expect(food.root.visible).toBe(quantity > 0);
        expect(food.root.children).toEqual(copies);
        expect(display.recordFor('baitTin')!.visibleCopies).toBe(3);
      }
    } finally {
      display.dispose();
      models.dispose();
    }
  });
});

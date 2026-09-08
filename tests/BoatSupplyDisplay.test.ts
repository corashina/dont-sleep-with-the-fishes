import { Group } from 'three';
import { describe, expect, it } from 'vitest';
import { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createTestPropModels } from './helpers/propModels';

describe('boat supply display', () => {
  it.each(['cannedFood', 'baitTin'] as const)('shows up to eight %s models without moving existing models', (groupId) => {
    const models = createTestPropModels();
    const display = new BoatSupplyDisplay(models, new Group(), []);
    const base = new SurvivalSession([], { seed: 1 }).snapshot();
    const resource = groupId === 'cannedFood' ? 'food' : 'bait';
    const food = display.recordFor(groupId)!;
    const copies = [...food.root.children];
    display.sync({ ...base, [resource]: 3 });
    const positions = copies.map((copy) => copy.position.toArray());
    const rotations = copies.map((copy) => copy.quaternion.toArray());
    try {
      for (const quantity of [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 3, 4, 3, 2, 0, 8]) {
        display.sync({ ...base, [resource]: quantity });
        const visible = food.root.children.filter((copy) => copy.visible);
        expect(visible).toHaveLength(Math.min(quantity, 8));
        expect(food.visibleCopies).toBe(visible.length);
        expect(food.quantity).toBe(quantity);
        expect(food.root.visible).toBe(quantity > 0);
        expect(food.root.children).toEqual(copies);
        const otherGroup = groupId === 'cannedFood' ? 'baitTin' : 'cannedFood';
        expect(display.recordFor(otherGroup)!.visibleCopies).toBe(0);
        expect(copies.map((copy) => copy.position.toArray())).toEqual(positions);
        expect(copies.map((copy) => copy.quaternion.toArray())).toEqual(rotations);
        for (const copy of visible) {
          expect(copy.scale.toArray()).toEqual(groupId === 'cannedFood' ? [0.5, 0.5, 0.5] : [0.375, 0.375, 0.375]);
        }
        const originalX = groupId === 'cannedFood' ? [-0.10, 0.10, 0] : [-0.105, 0.105, 0];
        const originalZ = groupId === 'cannedFood' ? [-1.24, -1.24, -1.24] : [-1.650, -1.650, -1.855];
        const originalYaw = groupId === 'cannedFood' ? [0.10, -0.05, -0.08] : [-0.05, 0.08, -0.03];
        for (let index = 0; index < Math.min(visible.length, 3); index += 1) {
          expect(visible[index]!.position.x).toBe(originalX[index]);
          expect(visible[index]!.position.z).toBe(originalZ[index]);
          expect(visible[index]!.rotation.y).toBe(originalYaw[index]);
        }
        if (quantity >= 3 && groupId === 'cannedFood') {
          expect(visible[2]!.position.y - visible[0]!.position.y).toBeCloseTo(0.22);
        }
      }
    } finally {
      display.dispose();
      models.dispose();
    }
  });

  it('starts borrowed food actors at the current layout after stock changes', () => {
    const saved = [{ instanceId: 'cannedFood-1', type: 'cannedFood' }] as const;
    const models = createTestPropModels();
    const display = new BoatSupplyDisplay(models, new Group(), saved);
    const base = new SurvivalSession(saved, { seed: 1 }).snapshot();
    try {
      for (const quantity of [3, 4, 3]) {
        display.sync({ ...base, food: quantity });
        const copy = display.recordFor('cannedFood')!.root.children[0]!;
        const actor = display.borrowEventActor('cannedFood-1')!;
        expect(actor.root.position.toArray()).toEqual(copy.position.toArray());
        expect(actor.root.quaternion.toArray()).toEqual(copy.quaternion.toArray());
        actor.release();
      }
    } finally {
      display.dispose();
      models.dispose();
    }
  });
});

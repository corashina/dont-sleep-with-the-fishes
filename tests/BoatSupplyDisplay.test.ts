import { Group, Mesh, type Object3D } from 'three';
import { describe,expect,it } from 'vitest';
import { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createTestPropModels } from './helpers/propModels';

describe('boat supply display', () => {
  // Importance: 95. Event copies must not retain stale damage after repair.
  it('keeps borrowed geometry consistent through break and repair', () => {
    const saved = [{ instanceId: 'knife-1', type: 'knife' }] as const;
    const models = createTestPropModels();
    const display = new BoatSupplyDisplay(models, new Group(), saved);
    const usable = new SurvivalSession(saved, { seed: 1 }).snapshot();
    const broken = new SurvivalSession(saved, {
      seed: 1, initialConditions: { 'knife-1': 'broken' },
    }).snapshot();
    const firstMesh = (root: Object3D): Mesh => {
      let result: Mesh | undefined;
      root.traverse((object) => { if (result === undefined && object instanceof Mesh) result = object; });
      return result!;
    };
    try {
      display.sync(usable);
      const copy = firstMesh(display.recordFor('knife')!.root);
      const original = copy.geometry;
      for (const state of [broken, usable, broken, usable]) {
        display.sync(state);
        expect(copy.geometry === original).toBe(state === usable);
        const actor = display.borrowEventActor('knife-1')!;
        expect(firstMesh(actor.root).geometry).toBe(copy.geometry);
        actor.release();
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

  it('keeps remaining food cans in place when a seagull steals one', () => {
    const models = createTestPropModels();
    const display = new BoatSupplyDisplay(models, new Group(), []);
    const base = new SurvivalSession([], { seed: 1 }).snapshot();
    try {
      display.sync({ ...base, food: 3 });
      const cans = display.recordFor('cannedFood')!.root.children;
      const positions = cans.slice(0, 3).map((can) => can.position.toArray());
      const actor = display.borrowFoodCan()!;

      expect(actor.root.position.toArray()).toEqual(positions[2]);
      expect(cans.slice(0, 3).map((can) => can.visible)).toEqual([true, true, false]);

      display.sync({ ...base, food: 2 });
      actor.release();

      expect(cans.slice(0, 3).map((can) => can.visible)).toEqual([true, true, false]);
      expect(cans.slice(0, 2).map((can) => can.position.toArray())).toEqual(positions.slice(0, 2));
    } finally {
      display.dispose();
      models.dispose();
    }
  });
});

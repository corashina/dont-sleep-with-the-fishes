import { Group } from 'three';
import { describe,expect,it } from 'vitest';
import { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createTestPropModels } from './helpers/propModels';

describe('boat supply display', () => {

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

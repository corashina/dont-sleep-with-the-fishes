import { Group } from 'three';
import { describe, expect, it } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
import { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import { createTestPropModels } from './helpers/propModels';

describe('BoatSupplyDisplay', () => {
  it('finds an item type from an instance id', () => {
    const propModels = createTestPropModels();
    const display = new BoatSupplyDisplay(propModels, new Group(), []);

    try {
      expect(display.itemType('flashlight-1' as ItemInstanceId)).toBe('flashlight');
      expect(display.itemType('missing-1' as ItemInstanceId)).toBeNull();
    } finally {
      display.dispose();
      propModels.dispose();
    }
  });
});

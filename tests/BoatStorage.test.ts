import { describe, expect, it } from 'vitest';
import { BOAT_SUPPLY_GROUP_IDS } from '../src/world/BoatStorage';

describe('boat storage', () => {
  it('has no repair material supply group', () => {
    expect(BOAT_SUPPLY_GROUP_IDS).not.toContain('repairMaterial');
  });
});

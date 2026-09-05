import { describe, expect, it } from 'vitest';
import { calculateHullRepair } from '../src/survival/survivalBalance';

describe('calculateHullRepair', () => {
  it.each([
    [7, 3, 3, 93],
    [90, 3, 1, 10],
    [7, 1, 1, 33],
    [66, 3, 2, 34],
    [1, 4, 3, 99],
    [100, 3, 0, 0],
    [50, 0, 0, 0],
  ])(
    'repairs hull %i with energy %i by spending %i and restoring %i',
    (hull, energy, energySpent, hullRestored) => {
      expect(calculateHullRepair(hull, energy)).toEqual({ energySpent, hullRestored });
    },
  );
});

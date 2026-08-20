import { describe, expect, it } from 'vitest';
import {
  RESCUE_CHANCE_STEPS,
  clampRescueLead,
  rescueChanceForDay,
  validateRescueChanceSteps,
} from '../src/survival/survivalBalance';

describe('survival rescue balance', () => {
  it.each([
    [23, 0, 0], [24, 0, 0.01], [27, 0, 0.01],
    [28, 0, 0.03], [30, 0, 0.03], [31, 0, 0.06],
    [34, 0, 0.10], [37, 0, 0.16], [40, 0, 0.24],
    [43, 0, 0.38], [80, 0, 0.38],
    [23, 8, 0], [24, 8, 0.06], [32, 8, 0.24],
  ])('uses day %i and lead %i for chance %f', (day, lead, chance) => {
    expect(rescueChanceForDay(day, lead)).toBe(chance);
  });

  it('clamps rescue lead from zero through eight', () => {
    expect([-2, 0, 4, 8, 12].map(clampRescueLead)).toEqual([0, 0, 4, 8, 8]);
  });

  it('rejects invalid rescue curves', () => {
    expect(() => validateRescueChanceSteps([
      { firstDay: 25, chance: 0.01 },
    ])).toThrow(/day 24/i);
    expect(() => validateRescueChanceSteps([
      { firstDay: 24, chance: 0.10 },
      { firstDay: 23, chance: 0.20 },
    ])).toThrow(/ascending/i);
    expect(() => validateRescueChanceSteps([
      { firstDay: 24, chance: 0.20 },
      { firstDay: 28, chance: 0.10 },
    ])).toThrow(/decrease/i);
  });

  it('keeps the approved curve frozen', () => {
    expect(RESCUE_CHANCE_STEPS).toEqual([
      { firstDay: 24, chance: 0.01 },
      { firstDay: 28, chance: 0.03 },
      { firstDay: 31, chance: 0.06 },
      { firstDay: 34, chance: 0.10 },
      { firstDay: 37, chance: 0.16 },
      { firstDay: 40, chance: 0.24 },
      { firstDay: 43, chance: 0.38 },
    ]);
  });
});

import { describe, expect, it } from 'vitest';

import { createSchoolVariants } from '../src/survival/events/schoolOfFishChoreography';

describe('school of fish choreography', () => {
  it('uses slow movement and wide distance lanes', () => {
    const variants = createSchoolVariants(24, 7);

    expect(variants).toHaveLength(24);
    expect(Math.min(...variants.map((variant) => variant.speed))).toBeGreaterThanOrEqual(0.34);
    expect(Math.max(...variants.map((variant) => variant.speed))).toBeLessThanOrEqual(0.6);
    expect(Math.min(...variants.map((variant) => variant.orbitRadiusX))).toBeGreaterThanOrEqual(2.95);
    expect(Math.min(...variants.map((variant) => variant.orbitRadiusZ))).toBeGreaterThanOrEqual(4.95);
    expect(variants.filter((variant) => variant.orbitRadiusX >= 4).length).toBeGreaterThanOrEqual(6);
    expect(variants.filter((variant) => variant.orbitRadiusZ >= 6.7).length).toBeGreaterThanOrEqual(6);
  });
});

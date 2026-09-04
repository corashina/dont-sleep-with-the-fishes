import { describe, expect, it } from 'vitest';
import { createSchoolVariants } from '../src/survival/events/schoolOfFishChoreography';

describe('school of fish choreography', () => {
  it('spreads fish across near and far distance bands', () => {
    const variants = createSchoolVariants(20, 42);
    const radiiX = variants.map((variant) => variant.orbitRadiusX);
    const radiiZ = variants.map((variant) => variant.orbitRadiusZ);

    expect(Math.min(...radiiX)).toBeLessThan(3);
    expect(Math.max(...radiiX)).toBeGreaterThan(8);
    expect(Math.min(...radiiZ)).toBeLessThan(4.1);
    expect(Math.max(...radiiZ)).toBeGreaterThan(14);
    expect(radiiZ.filter((radius) => radius > 13)).toHaveLength(4);
  });
});

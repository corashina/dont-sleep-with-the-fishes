import { describe, expect, it, vi } from 'vitest';
import { FixedStepClock } from '../src/physics/FixedStepClock';

describe('FixedStepClock', () => {
  it('accumulates partial frames and reports indices for accepted steps', () => {
    const clock = new FixedStepClock(0.1, 3);
    const step = vi.fn();
    expect(clock.advance(0.04, step)).toBe(0);
    expect(clock.advance(0.16, step)).toBe(2);
    expect(step.mock.calls).toEqual([
      [0.1, 0, 2],
      [0.1, 1, 2],
    ]);
  });

  it('caps catch-up and drops excess accumulated time', () => {
    const clock = new FixedStepClock(0.1, 3);
    const step = vi.fn();
    expect(clock.advance(0.8, step)).toBe(3);
    expect(clock.advance(0.099, step)).toBe(0);
    expect(clock.advance(0.001, step)).toBe(1);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0])(
    'does not advance for %s',
    (delta) => {
      const step = vi.fn();
      expect(new FixedStepClock().advance(delta, step)).toBe(0);
      expect(step).not.toHaveBeenCalled();
    },
  );

  it('clears accumulated time on reset', () => {
    const clock = new FixedStepClock(0.1, 3);
    clock.advance(0.09, () => undefined);
    clock.reset();
    expect(clock.advance(0.01, () => undefined)).toBe(0);
  });
});

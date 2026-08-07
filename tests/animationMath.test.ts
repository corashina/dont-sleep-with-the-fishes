import { describe, expect, it } from 'vitest';
import {
  clamp,
  smootherstepRange,
  smoothstepRange,
} from '../src/survival/animationMath';

describe('animationMath ranges', () => {
  it('clamps and eases bounded ranges', () => {
    expect(clamp(-2, -1, 3)).toBe(-1);
    expect(clamp(5, -1, 3)).toBe(3);
    expect(smoothstepRange(2, 4, 3)).toBe(0.5);
    expect(smootherstepRange(2, 4, 3)).toBe(0.5);
    expect(Number.isNaN(smoothstepRange(0, 1, Number.NaN))).toBe(true);
  });
});

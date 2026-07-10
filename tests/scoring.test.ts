import { describe, expect, it } from 'vitest';
import { gradeForSavedCount } from '../src/game/scoring';

describe('gradeForSavedCount', () => {
  it.each([
    [0, 'Barely Afloat'],
    [1, 'Barely Afloat'],
    [2, 'Hard Choices'],
    [3, 'Hard Choices'],
    [4, 'Well Provisioned'],
    [5, 'Every Slot Counted'],
  ] as const)('maps %i saved items to %s', (count, label) => {
    expect(gradeForSavedCount(count).label).toBe(label);
  });

  it('clamps out-of-range counts', () => {
    expect(gradeForSavedCount(-4).savedCount).toBe(0);
    expect(gradeForSavedCount(12).savedCount).toBe(5);
  });
});

// Importance: 95/100. Invalid samples must not produce a false 60 FPS claim.
import { expect, it } from 'vitest';
import { summarizeFrameTimes } from '../scripts/ocean-foam-lab/frameTiming';
it('reports a slow baseline as slow and uses upper tail samples', () => {
  expect(summarizeFrameTimes([18, 19, 20]).p95Ms).toBe(20);
  expect(summarizeFrameTimes([19, 20, 21]).p95Ms).toBe(21);
});
it('rejects missing or invalid frame measurements', () => {
  for (const values of [[], [NaN], [Infinity], [-1]])
    expect(() => summarizeFrameTimes(values)).toThrow();
});

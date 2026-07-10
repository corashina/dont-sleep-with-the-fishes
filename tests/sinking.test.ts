import { describe, expect, it } from 'vitest';
import { getSinkingState } from '../src/game/sinking';

describe('getSinkingState', () => {
  it('starts stable and ends at authored limits', () => {
    const start = getSinkingState(0, 120);
    const end = getSinkingState(120, 120);
    expect(start.progress).toBe(0);
    expect(start.rollRadians).toBeCloseTo(-0.05);
    expect(end.progress).toBe(1);
    expect(end.rollRadians).toBeCloseTo(-0.32);
    expect(end.sinkOffset).toBeCloseTo(-4.2);
    expect(end.waveAmplitudeScale).toBeCloseTo(1.35);
  });

  it('is monotonic and clamped', () => {
    const samples = [-10, 0, 30, 60, 90, 120, 150].map((time) => getSinkingState(time, 120));
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]!.progress).toBeGreaterThanOrEqual(samples[index - 1]!.progress);
      expect(samples[index]!.sinkOffset).toBeLessThanOrEqual(samples[index - 1]!.sinkOffset);
    }
    expect(samples[0]!.progress).toBe(0);
    expect(samples.at(-1)!.progress).toBe(1);
  });
});

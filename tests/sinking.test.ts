import { describe, expect, it } from 'vitest';
import { getSinkingState } from '../src/game/sinking';

describe('getSinkingState', () => {
  it('keeps the ship level for the full scavenging run while the storm escalates', () => {
    const start = getSinkingState(0, 120);
    const end = getSinkingState(120, 120);
    expect(start.progress).toBe(0);
    expect(end.progress).toBe(1);
    expect(start.rollRadians).toBe(0);
    expect(end.rollRadians).toBe(0);
    expect(start.pitchRadians).toBe(0);
    expect(end.pitchRadians).toBe(0);
    expect(start.sinkOffset).toBe(0);
    expect(end.sinkOffset).toBe(0);
    expect(end.waveAmplitudeScale).toBeCloseTo(1.35);
  });

  it('is monotonic and clamped', () => {
    const samples = [-10, 0, 30, 60, 90, 120, 150].map((time) => getSinkingState(time, 120));
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]!.progress).toBeGreaterThanOrEqual(samples[index - 1]!.progress);
      expect(samples[index]!.sinkOffset).toBe(0);
      expect(samples[index]!.pitchRadians).toBe(0);
      expect(samples[index]!.rollRadians).toBe(0);
    }
    expect(samples[0]!.progress).toBe(0);
    expect(samples.at(-1)!.progress).toBe(1);
  });
});

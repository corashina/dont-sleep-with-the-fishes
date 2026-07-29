// Importance: 4/5. Protects sinking timing and bounds.
import { describe, expect, it } from 'vitest';
import { SCAVENGE_DURATION_SECONDS } from '../src/game/scavengeRules';
import { getSinkingState } from '../src/game/sinking';

describe('getSinkingState', () => {
  it('keeps the ship level for the full scavenging run while the storm escalates', () => {
    const start = getSinkingState(0, SCAVENGE_DURATION_SECONDS);
    const end = getSinkingState(SCAVENGE_DURATION_SECONDS, SCAVENGE_DURATION_SECONDS);
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
    const samples = [-10, 0, 0.25, 0.5, 0.75, 1, 1.25]
      .map((progress) => getSinkingState(progress * SCAVENGE_DURATION_SECONDS, SCAVENGE_DURATION_SECONDS));
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

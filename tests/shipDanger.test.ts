import { describe, expect, it } from 'vitest';
import { getShipDangerState } from '../src/game/shipDanger';

describe('getShipDangerState', () => {
  it('shows every hazard at full baseline strength when the run starts', () => {
    expect(getShipDangerState(0, 60)).toMatchObject({
      progress: 0,
      fireIntensity: 1,
      smokeDensity: 1,
      waterFlow: 1,
      alarmRate: 0.7,
    });
    expect(getShipDangerState(0, 60).alarmPulse).toBe(1);
  });

  it('raises presentation strength only near the deadline', () => {
    expect(getShipDangerState(30, 60).fireIntensity).toBe(1);
    expect(getShipDangerState(60, 60)).toMatchObject({
      progress: 1,
      fireIntensity: 1.25,
      smokeDensity: 1.35,
      waterFlow: 1.3,
      alarmRate: 2,
    });
  });

  it('stays deterministic, finite, and clamped', () => {
    const samples = [-10, 0, 20, 45, 60, 90]
      .map((elapsed) => getShipDangerState(elapsed, 60));
    expect(samples[0]).toEqual(samples[1]);
    expect(samples.at(-1)?.progress).toBe(1);
    samples.forEach((sample) => {
      Object.values(sample).forEach((value) => expect(Number.isFinite(value)).toBe(true));
      expect(sample.alarmPulse).toBeGreaterThanOrEqual(0);
      expect(sample.alarmPulse).toBeLessThanOrEqual(1);
    });
  });
});

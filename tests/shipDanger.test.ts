// Importance: 4/5. Protects deterministic danger timing, alarm phase, and allocation reuse.
import { describe, expect, it } from 'vitest';
import {
  createShipAlarmPhase,
  createShipDangerState,
  resetShipAlarmPhase,
  sampleShipDangerStateInto,
} from '../src/game/shipDanger';

describe('ship danger state', () => {
  function sample(elapsed: number, duration = 60, alarmElapsed = elapsed) {
    const state = createShipDangerState();
    sampleShipDangerStateInto(state, elapsed, duration, alarmElapsed);
    return state;
  }

  it('shows every hazard at full baseline strength when the run starts', () => {
    expect(sample(0)).toMatchObject({
      progress: 0,
      alarmRate: 0.7,
    });
    expect(sample(0).alarmPulse).toBe(1);
  });

  it('raises alarm speed only near the deadline', () => {
    expect(sample(60)).toMatchObject({
      progress: 1,
      alarmRate: 2,
    });
  });

  it('stays deterministic, finite, and clamped', () => {
    const samples = [-10, 0, 20, 45, 60, 90]
      .map((elapsed) => sample(elapsed));
    expect(samples[0]).toEqual(samples[1]);
    expect(samples.at(-1)?.progress).toBe(1);
    samples.forEach((sample) => {
      Object.values(sample).forEach((value) => expect(Number.isFinite(value)).toBe(true));
      expect(sample.alarmPulse).toBeGreaterThanOrEqual(0);
      expect(sample.alarmPulse).toBeLessThanOrEqual(1);
    });
  });

  it('updates one caller-owned object without allocation', () => {
    const state = createShipDangerState();
    const first = sampleShipDangerStateInto(state, 0, 60, 0);
    const second = sampleShipDangerStateInto(state, 60, 60, 60);
    expect(first).toBe(state);
    expect(second).toBe(state);
    expect(second.progress).toBe(1);
  });

  it('resets alarm phase at loop start and freezes it while elapsed time is frozen', () => {
    const phase = createShipAlarmPhase();
    resetShipAlarmPhase(phase, 12);
    expect(phase.elapsedAt(12)).toBe(0);
    expect(phase.elapsedAt(12.25)).toBeCloseTo(0.25);
    expect(phase.elapsedAt(12.25)).toBeCloseTo(0.25);
    resetShipAlarmPhase(phase, 40);
    expect(phase.elapsedAt(40)).toBe(0);
  });

  it('drives lamp timing from alarm phase, not scavenging elapsed time', () => {
    const state = createShipDangerState();
    sampleShipDangerStateInto(state, 48, 60, 0);
    expect(state.alarmPulse).toBe(1);
    sampleShipDangerStateInto(state, 48, 60, 0.5);
    expect(state.alarmPulse).toBe(0);
  });
});

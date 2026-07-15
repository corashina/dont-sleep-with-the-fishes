import { describe, expect, it } from 'vitest';
import {
  BOAT_DRIFT_CONFIG,
  BoatDriftMotion,
  sampleBoatWaveHeights,
  weatherAmplitudeScale,
  type BoatWaveHeights,
} from '../src/survival/BoatDriftMotion';

const level = (height = 0): BoatWaveHeights => ({
  bow: height,
  stern: height,
  port: height,
  starboard: height,
});

describe('BoatDriftMotion', () => {
  it('keeps the ocean weather amplitude contract', () => {
    expect(weatherAmplitudeScale('calm')).toBe(0.78);
    expect(weatherAmplitudeScale('overcast')).toBe(1);
    expect(weatherAmplitudeScale('squall')).toBe(1.35);
  });

  it('samples the same four wave heights for the same time and scale', () => {
    expect(sampleBoatWaveHeights(3.25, 0.78))
      .toEqual(sampleBoatWaveHeights(3.25, 0.78));
  });

  it('produces a stronger squall hull response than calm at the same wave time', () => {
    const time = 1;
    const calm = new BoatDriftMotion().update(
      sampleBoatWaveHeights(time, weatherAmplitudeScale('calm')),
      time,
      1 / 60,
      false,
    );
    const squall = new BoatDriftMotion().update(
      sampleBoatWaveHeights(time, weatherAmplitudeScale('squall')),
      time,
      1 / 60,
      false,
    );
    const hullResponse = ({ heave, pitch, roll }: typeof calm.boat): number =>
      Math.abs(heave) + Math.abs(pitch) + Math.abs(roll);

    expect(hullResponse(squall.boat)).toBeGreaterThan(hullResponse(calm.boat));
  });

  it('derives positive bow pitch and starboard roll from height differences', () => {
    const motion = new BoatDriftMotion();
    const frame = motion.update({
      bow: 0.8,
      stern: -0.8,
      port: -0.5,
      starboard: 0.5,
    }, 2, 1 / 60, false);

    expect(frame.boat.pitch).toBeGreaterThan(0);
    expect(frame.boat.roll).toBeGreaterThan(0);
    expect(frame.rider.pitch).toBeLessThan(0);
    expect(frame.rider.roll).toBeLessThan(0);
  });

  it('damps a pose change and caps boat and rider channels', () => {
    const motion = new BoatDriftMotion();
    motion.update(level(), 0, 1 / 60, false);
    const frame = motion.update({
      bow: 100,
      stern: -100,
      port: -100,
      starboard: 100,
    }, 0.1, 0.1, false);

    expect(Math.abs(frame.boat.pitch)).toBeLessThanOrEqual(BOAT_DRIFT_CONFIG.pitchLimit);
    expect(Math.abs(frame.boat.roll)).toBeLessThanOrEqual(BOAT_DRIFT_CONFIG.rollLimit);
    expect(Math.abs(frame.boat.yaw)).toBeLessThanOrEqual(BOAT_DRIFT_CONFIG.yawLimit);
    expect(Math.abs(frame.rider.pitch)).toBeLessThanOrEqual(BOAT_DRIFT_CONFIG.riderRotationLimit);
    expect(Math.abs(frame.rider.roll)).toBeLessThanOrEqual(BOAT_DRIFT_CONFIG.riderRotationLimit);
    expect(Math.abs(frame.rider.y)).toBeLessThanOrEqual(BOAT_DRIFT_CONFIG.riderHeaveLimit);
  });

  it('returns a neutral frame under reduced motion and eases back after it clears', () => {
    const motion = new BoatDriftMotion();
    const steep = { bow: 1, stern: -1, port: -1, starboard: 1 };
    motion.update(steep, 1, 1 / 60, false);
    const reduced = motion.update(steep, 1.1, 0.1, true);
    const resumed = motion.update(steep, 1.2, 0.1, false);

    expect(reduced.boat).toEqual({ heave: 0, pitch: 0, roll: 0, yaw: 0 });
    expect(reduced.rider).toEqual({ y: 0, pitch: 0, roll: 0, yaw: 0 });
    expect(reduced.bowImpact).toBe(0);
    expect(resumed.boat.pitch).toBeGreaterThan(0);
    expect(resumed.boat.pitch).toBeLessThan(BOAT_DRIFT_CONFIG.pitchLimit);
  });

  it('suppresses bow impact when a long frame gap loses sample continuity', () => {
    const motion = new BoatDriftMotion();
    motion.update(level(), 0, 1 / 60, false);
    const frame = motion.update({ ...level(), bow: 2 }, 5, 5, false);

    expect(frame.bowImpact).toBe(0);
    expect(Number.isFinite(frame.angularVelocity.pitch)).toBe(true);
    expect(Number.isFinite(frame.angularVelocity.roll)).toBe(true);
  });

  it('suppresses long-gap impact while the hull integrates downward', () => {
    const motion = new BoatDriftMotion();
    motion.update(level(), 0, 1 / 60, false);

    const frame = motion.update(level(-2), 5, 5, false);

    expect(frame.boat.heave).toBeLessThan(0);
    expect(frame.bowImpact).toBe(0);
  });
});

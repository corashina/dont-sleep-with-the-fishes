import { describe, expect, it } from 'vitest';
import { BoatBuoyancy, deriveBoatPose, smoothBoatPose } from '../src/ocean/BoatBuoyancy';

describe('lifeboat buoyancy', () => {
  it('derives height, pitch, and roll from four samples', () => {
    const pose = deriveBoatPose(
      { bow: 1.2, stern: 0.4, port: 0.9, starboard: 0.3 },
      { length: 4, width: 2 },
    );
    expect(pose.y).toBeCloseTo(0.7);
    expect(pose.pitch).toBeCloseTo(Math.atan2(0.8, 4));
    expect(pose.roll).toBeCloseTo(Math.atan2(0.6, 2));
  });

  it('smooths toward the target without overshoot', () => {
    const current = { y: 0, pitch: 0, roll: 0, driftX: 0, driftZ: 0 };
    const target = { y: 2, pitch: 0.3, roll: -0.2, driftX: 0.4, driftZ: -0.5 };
    const next = smoothBoatPose(current, target, 0.05, 7);
    expect(next.y).toBeGreaterThan(0);
    expect(next.y).toBeLessThan(2);
    expect(next.roll).toBeLessThan(0);
    expect(next.roll).toBeGreaterThan(-0.2);
  });

  it('samples the boat footprint and derives constrained drift from wave normals', () => {
    const calls: Array<[number, number, number, number]> = [];
    const heights = [4, 0, 2, 2];
    const buoyancy = new BoatBuoyancy((time, x, z, amplitudeScale) => {
      calls.push([time, x, z, amplitudeScale]);
      return {
        height: heights[calls.length - 1] ?? 0,
        displacementX: 0,
        displacementZ: 0,
        normal: { x: -0.8, y: 0, z: 0.6 },
      };
    });

    const pose = buoyancy.sampleTarget(1.5, 10, -3, 1.25);

    expect(calls).toEqual([
      [1.5, 10, -5, 1.25],
      [1.5, 10, -1, 1.25],
      [1.5, 9, -3, 1.25],
      [1.5, 11, -3, 1.25],
    ]);
    expect(pose.y).toBe(2);
    expect(pose.pitch).toBeCloseTo(Math.atan2(4, 4));
    expect(pose.roll).toBe(0);
    expect(pose.driftX).toBeCloseTo(0.24);
    expect(pose.driftZ).toBeCloseTo(-0.18);
    expect(Math.abs(pose.driftX)).toBeLessThanOrEqual(0.35);
    expect(Math.abs(pose.driftZ)).toBeLessThanOrEqual(0.35);
  });
});

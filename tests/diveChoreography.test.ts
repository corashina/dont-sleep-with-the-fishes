import { describe, expect, it } from 'vitest';
import {
  DIVE_ENTRY_DURATION_SECONDS,
  DIVE_IMPACT_SECONDS,
  createDivePose,
  sampleDivePose,
} from '../src/survival/diveChoreography';

describe('dive choreography', () => {
  it('uses the approved 5.8 second entry and 3.6 second impact', () => {
    expect(DIVE_ENTRY_DURATION_SECONDS).toBe(5.8);
    expect(DIVE_IMPACT_SECONDS).toBe(3.6);
  });

  it('moves right before it raises and settles the goggles', () => {
    const pose = createDivePose();
    sampleDivePose(1.1, pose);
    expect(pose.cameraX).toBeGreaterThan(0.6);
    expect(pose.goggleLift).toBe(0);
    sampleDivePose(2.2, pose);
    expect(pose.goggleLift).toBe(1);
    expect(pose.goggleSettle).toBeCloseTo(1);
  });

  it('crosses the water once the backward pitch reaches impact', () => {
    const pose = createDivePose();
    sampleDivePose(DIVE_IMPACT_SECONDS - 0.01, pose);
    expect(pose.submerged).toBe(false);
    expect(pose.waterCoverage).toBeLessThan(1);
    sampleDivePose(DIVE_IMPACT_SECONDS, pose);
    expect(pose.submerged).toBe(true);
    expect(pose.cameraPitch).toBeLessThan(-2.4);
  });

  it('holds a full underwater view with strong bubbles', () => {
    const pose = createDivePose();
    sampleDivePose(5, pose);
    expect(pose.waterCoverage).toBe(1);
    expect(pose.bubbleStrength).toBeGreaterThan(0.85);
    expect(pose.goggleLift).toBe(1);
  });

  it('clamps invalid and late elapsed times', () => {
    const pose = createDivePose();
    sampleDivePose(Number.NaN, pose);
    expect(pose.elapsed).toBe(0);
    sampleDivePose(99, pose);
    expect(pose.elapsed).toBe(DIVE_ENTRY_DURATION_SECONDS);
  });
});

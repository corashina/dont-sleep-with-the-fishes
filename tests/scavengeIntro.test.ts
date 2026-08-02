import { describe, expect, it } from 'vitest';
import {
  SCAVENGE_INTRO_CRASH_SECONDS,
  SCAVENGE_INTRO_DURATION_SECONDS,
  advanceScavengeIntroElapsed,
  createScavengeIntroFrame,
  crossedScavengeIntroTime,
  sampleScavengeIntroFrameInto,
  type ScavengeIntroAnchors,
} from '../src/game/scavengeIntro';

const anchors: ScavengeIntroAnchors = {
  seatedPosition: [0.69, 13.74, 0.48],
  standingPosition: [0.73, 14.29, 0.14],
  ladderApproachPosition: [0.73, 14.29, -0.54],
  ladderTopPosition: [0, 14.29, -0.54],
  ladderBottomPosition: [0, 3.72, -0.54],
  exitPosition: [0, 3.72, -1.3],
};

describe('scavenge intro choreography', () => {
  it('starts standing, then samples the ladder approach, ladder, and exit poses', () => {
    const frame = createScavengeIntroFrame();
    const cameraPosition = frame.cameraPosition;
    sampleScavengeIntroFrameInto(frame, 0, anchors);
    expect(frame.cameraPosition).toEqual(anchors.standingPosition);
    sampleScavengeIntroFrameInto(frame, 0.6, anchors);
    expect(frame.cameraPosition).toEqual(anchors.standingPosition);
    sampleScavengeIntroFrameInto(frame, 1.2, anchors);
    expect(frame.cameraPosition).toEqual(anchors.standingPosition);
    sampleScavengeIntroFrameInto(frame, 9.3, anchors);
    expect(frame.cameraPosition).toEqual(anchors.ladderApproachPosition);
    sampleScavengeIntroFrameInto(frame, 9.5, anchors);
    expect(frame.cameraPosition).toEqual(anchors.ladderTopPosition);
    sampleScavengeIntroFrameInto(frame, 9.5001, anchors);
    expect(frame.cameraPosition[1]).toBeLessThan(anchors.ladderTopPosition[1]);
    sampleScavengeIntroFrameInto(frame, 11.5, anchors);
    expect(frame.cameraPosition).toEqual(anchors.ladderBottomPosition);
    sampleScavengeIntroFrameInto(frame, 12, anchors);
    expect(frame.cameraPosition).toEqual(anchors.exitPosition);
    expect(frame.complete).toBe(true);
    expect(frame.cameraPosition).toBe(cameraPosition);
  });

  it('stays continuous and finite at each position key', () => {
    const frame = createScavengeIntroFrame();
    const keys = [0, 1.2, 9, 9.3, 9.5, 11.5, 12];
    keys.forEach((key) => {
      sampleScavengeIntroFrameInto(frame, Math.max(0, key - 0.0001), anchors);
      const before = [...frame.cameraPosition];
      sampleScavengeIntroFrameInto(frame, key, anchors);
      const at = [...frame.cameraPosition];
      sampleScavengeIntroFrameInto(frame, Math.min(12, key + 0.0001), anchors);
      expect(frame.cameraPosition.every(Number.isFinite)).toBe(true);
      expect(Math.hypot(...before.map((value, index) => value - at[index]!))).toBeLessThan(0.001);
      expect(Math.hypot(...frame.cameraPosition.map((value, index) => value - at[index]!)))
        .toBeLessThan(0.001);
    });
  });

  it('emits a temporary impact after the crash', () => {
    const frame = createScavengeIntroFrame();
    sampleScavengeIntroFrameInto(frame, 6.3, anchors);
    expect(Math.abs(frame.impactRoll)).toBeGreaterThan(0);
    sampleScavengeIntroFrameInto(frame, 7.3, anchors);
    expect(frame).toMatchObject({ impactY: 0, impactPitch: 0, impactRoll: 0 });
  });

  it('waits one second after the crash before reacting', () => {
    const frame = createScavengeIntroFrame();
    sampleScavengeIntroFrameInto(frame, SCAVENGE_INTRO_CRASH_SECONDS, anchors);
    const crashView = [frame.cameraYaw, frame.cameraPitch, ...frame.cameraPosition];
    sampleScavengeIntroFrameInto(frame, 7.2, anchors);
    expect([frame.cameraYaw, frame.cameraPitch, ...frame.cameraPosition]).toEqual(crashView);
  });

  it('keeps the camera facing away from the mast during the ladder descent', () => {
    const frame = createScavengeIntroFrame();
    [9.5, 10.5, 11.5, 12].forEach((elapsed) => {
      sampleScavengeIntroFrameInto(frame, elapsed, anchors);
      const forwardZ = -Math.cos(frame.cameraYaw);
      expect(forwardZ).toBeLessThan(-0.9);
    });
  });

  it('keeps the mast outside the camera sight line after the crash', () => {
    const frame = createScavengeIntroFrame();
    for (let elapsed = SCAVENGE_INTRO_CRASH_SECONDS; elapsed <= 11.5; elapsed += 0.05) {
      sampleScavengeIntroFrameInto(frame, elapsed, anchors);
      const forwardX = -Math.sin(frame.cameraYaw);
      const forwardZ = -Math.cos(frame.cameraYaw);
      const distanceAlongRay = -(frame.cameraPosition[0] * forwardX
        + frame.cameraPosition[2] * forwardZ);
      if (distanceAlongRay <= 0) continue;
      const closestX = frame.cameraPosition[0] + forwardX * distanceAlongRay;
      const closestZ = frame.cameraPosition[2] + forwardZ * distanceAlongRay;
      expect(Math.hypot(closestX, closestZ)).toBeGreaterThan(0.36);
    }
  });

  it('clamps bad deltas and detects a crossed event once', () => {
    expect(advanceScavengeIntroElapsed(6.1, Number.NaN)).toBe(6.1);
    expect(advanceScavengeIntroElapsed(6.1, -1)).toBe(6.1);
    const elapsed = advanceScavengeIntroElapsed(6.1, 20);
    expect(elapsed).toBe(SCAVENGE_INTRO_DURATION_SECONDS);
    expect(crossedScavengeIntroTime(6.1, elapsed, SCAVENGE_INTRO_CRASH_SECONDS)).toBe(true);
    expect(crossedScavengeIntroTime(6.3, elapsed, SCAVENGE_INTRO_CRASH_SECONDS)).toBe(false);
  });
});

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
  seatedPosition: [0, 13.67, -0.85],
  standingPosition: [0, 14.22, -0.85],
  ladderBottomPosition: [0, 3.72, -0.54],
  exitPosition: [0, 3.72, -1.3],
};

describe('scavenge intro choreography', () => {
  it('samples the seated, standing, ladder, and exit poses', () => {
    const frame = createScavengeIntroFrame();
    sampleScavengeIntroFrameInto(frame, 0, anchors);
    expect(frame.cameraPosition).toEqual(anchors.seatedPosition);
    sampleScavengeIntroFrameInto(frame, 1, anchors);
    expect(frame.cameraPosition).toEqual(anchors.standingPosition);
    sampleScavengeIntroFrameInto(frame, 9.5, anchors);
    expect(frame.cameraPosition).toEqual(anchors.ladderBottomPosition);
    sampleScavengeIntroFrameInto(frame, 10, anchors);
    expect(frame.cameraPosition).toEqual(anchors.exitPosition);
    expect(frame.complete).toBe(true);
  });

  it('emits a temporary impact after the crash', () => {
    const frame = createScavengeIntroFrame();
    sampleScavengeIntroFrameInto(frame, 6.1, anchors);
    expect(Math.abs(frame.impactRoll)).toBeGreaterThan(0);
    sampleScavengeIntroFrameInto(frame, 7.5, anchors);
    expect(frame).toMatchObject({ impactY: 0, impactPitch: 0, impactRoll: 0 });
  });

  it('clamps bad deltas and detects a crossed event once', () => {
    expect(advanceScavengeIntroElapsed(5.9, Number.NaN)).toBe(5.9);
    expect(advanceScavengeIntroElapsed(5.9, -1)).toBe(5.9);
    const elapsed = advanceScavengeIntroElapsed(5.9, 20);
    expect(elapsed).toBe(SCAVENGE_INTRO_DURATION_SECONDS);
    expect(crossedScavengeIntroTime(5.9, elapsed, SCAVENGE_INTRO_CRASH_SECONDS)).toBe(true);
    expect(crossedScavengeIntroTime(6.1, elapsed, SCAVENGE_INTRO_CRASH_SECONDS)).toBe(false);
  });
});

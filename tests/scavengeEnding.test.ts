import { describe, expect, it } from 'vitest';
import {
  advanceScavengeEnding,
  createScavengeCinematicFrame,
  createScavengeEndingState,
  ENDING_HOLD_SECONDS,
  getScavengeCinematicFrame,
  sampleScavengeCinematicFrameInto,
  SINKING_CINEMATIC_SECONDS,
} from '../src/game/scavengeEnding';

describe('scavenge ending', () => {
  it('advances through exact cinematic and hold boundaries', () => {
    let state = createScavengeEndingState();
    state = advanceScavengeEnding(state, 'failure', 0);
    expect(state).toEqual({ stage: 'sinking', elapsedSeconds: 0 });
    state = advanceScavengeEnding(state, 'failure', SINKING_CINEMATIC_SECONDS);
    expect(state).toEqual({ stage: 'endingHold', elapsedSeconds: 0 });
    state = advanceScavengeEnding(state, 'failure', ENDING_HOLD_SECONDS);
    expect(state).toEqual({ stage: 'menuReady', elapsedSeconds: 0 });
  });

  it('consumes a delta that crosses multiple boundaries', () => {
    const state = advanceScavengeEnding(
      { stage: 'sinking', elapsedSeconds: 7.5 },
      'failure',
      4,
    );
    expect(state).toEqual({ stage: 'menuReady', elapsedSeconds: 0 });
  });

  it('clamps negative deltas and leaves menu readiness terminal', () => {
    const sinking = advanceScavengeEnding(
      { stage: 'sinking', elapsedSeconds: 2 },
      'failure',
      -1,
    );
    expect(sinking).toEqual({ stage: 'sinking', elapsedSeconds: 2 });

    const menuReady = { stage: 'menuReady', elapsedSeconds: 0 } as const;
    expect(advanceScavengeEnding(menuReady, 'failure', 10)).toBe(menuReady);
  });

  it('keys a restrained exterior sinking pose', () => {
    const start = getScavengeCinematicFrame(0);
    const middle = getScavengeCinematicFrame(4);
    const end = getScavengeCinematicFrame(8);
    expect(start.sinking.sinkOffset).toBe(0);
    expect(Math.abs(middle.sinking.rollRadians)).toBeGreaterThan(0.05);
    expect(end.sinking.sinkOffset).toBeLessThan(-10);
    expect(end.blackout).toBe(1);
    expect(end.cameraPosition).not.toEqual(start.cameraPosition);
  });

  it('samples cinematic output into one caller-owned frame', () => {
    const frame = createScavengeCinematicFrame();
    const startPosition = frame.cameraPosition;
    const startTarget = frame.cameraTarget;
    const startSinking = frame.sinking;

    expect(sampleScavengeCinematicFrameInto(frame, 0)).toBe(frame);
    sampleScavengeCinematicFrameInto(frame, SINKING_CINEMATIC_SECONDS);

    expect(frame.cameraPosition).toBe(startPosition);
    expect(frame.cameraTarget).toBe(startTarget);
    expect(frame.sinking).toBe(startSinking);
    expect(frame.sinking.sinkOffset).toBeLessThan(-10);
    expect(frame.blackout).toBe(1);
  });
});

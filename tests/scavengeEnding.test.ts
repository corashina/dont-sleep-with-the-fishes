import { describe, expect, it } from 'vitest';
import {
  advanceScavengeEnding,
  createScavengeEndingState,
  ENDING_HOLD_SECONDS,
  SINKING_CINEMATIC_SECONDS,
} from '../src/game/scavengeEnding';

describe('scavenge ending timeline', () => {
  it('finishes successful deadline evacuation at the fade without a failure hold', () => {
    const snapshot = { status: 'success', remainingSeconds: 0 } as const;
    const start = advanceScavengeEnding(createScavengeEndingState(), snapshot, 0);
    expect(start).toEqual({ stage: 'sinking', elapsedSeconds: 0 });
    const ready = advanceScavengeEnding(start, snapshot, SINKING_CINEMATIC_SECONDS + 20);
    expect(ready).toEqual({ stage: 'survivalReady', elapsedSeconds: 0 });
    expect(advanceScavengeEnding(ready, snapshot, 20)).toBe(ready);
  });

  it('keeps early evacuation outside the cinematic', () => {
    const state = createScavengeEndingState();
    expect(advanceScavengeEnding(state, { status: 'success', remainingSeconds: 1 }, 20)).toBe(state);
  });

  it('keeps the failure hold and menu action after sinking', () => {
    const snapshot = { status: 'failure', remainingSeconds: 0 } as const;
    const hold = advanceScavengeEnding(createScavengeEndingState(), snapshot, SINKING_CINEMATIC_SECONDS);
    expect(hold).toEqual({ stage: 'endingHold', elapsedSeconds: 0 });
    expect(advanceScavengeEnding(hold, snapshot, ENDING_HOLD_SECONDS))
      .toEqual({ stage: 'menuReady', elapsedSeconds: 0 });
  });
});

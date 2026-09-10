import { describe,expect,it } from 'vitest';
import {
  advanceScavengeEnding,
  createScavengeEndingState,
  ENDING_HOLD_SECONDS,
  SINKING_CINEMATIC_SECONDS,
} from '../src/game/scavengeEnding';

describe('scavenge ending timeline', () => {
  it('finishes successful deadline evacuation at the fade without a failure hold', () => {
    const start = advanceScavengeEnding(createScavengeEndingState(), 'success', 0);
    expect(start).toEqual({ stage: 'sinking', elapsedSeconds: 0 });
    const ready = advanceScavengeEnding(start, 'success', SINKING_CINEMATIC_SECONDS + 20);
    expect(ready).toEqual({ stage: 'survivalReady', elapsedSeconds: 0 });
    expect(advanceScavengeEnding(ready, 'success', 20)).toBe(ready);
  });

  it('keeps the failure hold and menu action after sinking', () => {
    const hold = advanceScavengeEnding(createScavengeEndingState(), 'failure', SINKING_CINEMATIC_SECONDS);
    expect(hold).toEqual({ stage: 'endingHold', elapsedSeconds: 0 });
    expect(advanceScavengeEnding(hold, 'failure', ENDING_HOLD_SECONDS))
      .toEqual({ stage: 'menuReady', elapsedSeconds: 0 });
  });
});

import { describe,expect,it } from 'vitest';
import {
  advanceScavengeEnding,
  createScavengeEndingState,
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

  // Importance: 95/100. Ending actions must be ready when the popup appears.
  it('makes failure actions ready as soon as sinking finishes', () => {
    const start = advanceScavengeEnding(createScavengeEndingState(), 'failure', SINKING_CINEMATIC_SECONDS - 0.5);
    expect(start.stage).toBe('sinking');
    const ready = advanceScavengeEnding(start, 'failure', 0.5);
    expect(ready).toEqual({ stage: 'menuReady', elapsedSeconds: 0 });
    expect(advanceScavengeEnding(ready, 'failure', 20)).toBe(ready);
  });
});

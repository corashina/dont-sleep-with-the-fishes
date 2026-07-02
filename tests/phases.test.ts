import { describe, it, expect } from 'vitest';
import { Phase, canTransition } from '../src/state/phases';

describe('phases', () => {
  it('allows intro -> scavenge', () => {
    expect(canTransition(Phase.Intro, Phase.Scavenge)).toBe(true);
  });
  it('allows scavenge -> crewSelect', () => {
    expect(canTransition(Phase.Scavenge, Phase.CrewSelect)).toBe(true);
  });
  it('allows crewSelect -> day', () => {
    expect(canTransition(Phase.CrewSelect, Phase.Day)).toBe(true);
  });
  it('allows day -> night and night -> day', () => {
    expect(canTransition(Phase.Day, Phase.Night)).toBe(true);
    expect(canTransition(Phase.Night, Phase.Day)).toBe(true);
  });
  it('allows day/night -> ending', () => {
    expect(canTransition(Phase.Day, Phase.Ending)).toBe(true);
    expect(canTransition(Phase.Night, Phase.Ending)).toBe(true);
  });
  it('disallows illegal jumps', () => {
    expect(canTransition(Phase.Intro, Phase.Night)).toBe(false);
    expect(canTransition(Phase.Day, Phase.Scavenge)).toBe(false);
  });
});

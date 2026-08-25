import { describe, expect, it } from 'vitest';
import {
  createWreckageSample,
  sampleWreckageBeat,
  wreckageBeatDuration,
} from '../src/survival/events/wreckageChoreography';

describe('wreckage choreography', () => {
  it.each([
    ['reveal', 1.2], ['search', 1.4], ['leave', 1.2],
    ['underwater-hold', 3], ['loot', 1.2], ['collapse', 1.5],
    ['creature', 1.35], ['ghost', 1.6], ['return', 0.8],
  ] as const)('defines %s duration', (beat, duration) => {
    expect(wreckageBeatDuration(beat)).toBe(duration);
  });

  it('samples every threat into one reused object', () => {
    const output = createWreckageSample();
    expect(sampleWreckageBeat('collapse', 0.75, output)).toBe(true);
    expect(output.fallingDebris).toBeGreaterThan(0);
    expect(output.silt).toBeGreaterThan(0);
    sampleWreckageBeat('creature', 0.9, output);
    expect(output.creatureAdvance).toBeGreaterThan(0);
    sampleWreckageBeat('ghost', 0.8, output);
    expect(output.ghostDrift).toBeGreaterThan(0);
  });

  it('uses elapsed seconds and resets inactive cues', () => {
    const output = createWreckageSample();
    sampleWreckageBeat('collapse', 0.75, output);
    sampleWreckageBeat('search', 0, output);

    expect(output.fallingDebris).toBe(0);
    expect(output.silt).toBe(0);
    expect(output.redFlash).toBe(0);
    expect(output.debrisApproach).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import {
  createWreckageSample,
  sampleWreckageBeat,
  wreckageBeatDuration,
} from '../src/survival/events/wreckageChoreography';

describe('wreckage choreography', () => {
  it.each([
    ['reveal', 1.2],
    ['surface-hold', 0],
    ['leave', 1.2],
  ] as const)('defines %s duration', (beat, duration) => {
    expect(wreckageBeatDuration(beat)).toBe(duration);
  });

  it('samples reveal, hold, and leave into one reused object', () => {
    const output = createWreckageSample();

    expect(sampleWreckageBeat('reveal', 0.6, output)).toBe(true);
    expect(output.debrisAlpha).toBeGreaterThan(0);
    expect(output.sceneAlpha).toBe(1);

    sampleWreckageBeat('surface-hold', 0, output);
    expect(output).toEqual({ debrisAlpha: 1, sceneAlpha: 1 });

    sampleWreckageBeat('leave', 0.6, output);
    expect(output.debrisAlpha).toBe(1);
    expect(output.sceneAlpha).toBeCloseTo(0.5);
  });
});

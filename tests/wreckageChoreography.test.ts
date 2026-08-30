import { describe, expect, it } from 'vitest';
import {
  createWreckageSample,
  sampleWreckageBeat,
  wreckageBeatDuration,
} from '../src/survival/events/wreckageChoreography';

describe('wreckage choreography', () => {
  it.each([
    ['surface-hold', 0],
    ['leave', 1.2],
  ] as const)('defines %s duration', (beat, duration) => {
    expect(wreckageBeatDuration(beat)).toBe(duration);
  });

  it('samples hold and leave into one reused object', () => {
    const output = createWreckageSample();

    expect(sampleWreckageBeat('surface-hold', 0, output)).toBe(true);
    expect(output).toEqual({ debrisAlpha: 1, sceneAlpha: 1 });

    sampleWreckageBeat('leave', 0.6, output);
    expect(output.debrisAlpha).toBe(1);
    expect(output.sceneAlpha).toBeCloseTo(0.5);
  });
});

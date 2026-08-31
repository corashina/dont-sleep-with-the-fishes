import { describe, expect, it } from 'vitest';
import {
  createWreckageSample,
  sampleWreckageBeat,
} from '../src/survival/events/wreckageChoreography';

describe('wreckage choreography', () => {

  it('samples hold and leave into one reused object', () => {
    const output = createWreckageSample();

    expect(sampleWreckageBeat('surface-hold', 0, output)).toBe(true);
    expect(output).toEqual({ debrisAlpha: 1, sceneAlpha: 1 });

    sampleWreckageBeat('leave', 0.6, output);
    expect(output.debrisAlpha).toBe(1);
    expect(output.sceneAlpha).toBeCloseTo(0.5);
  });
});

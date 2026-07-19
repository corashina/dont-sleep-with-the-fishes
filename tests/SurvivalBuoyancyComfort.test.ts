import { describe, expect, it } from 'vitest';
import type { BoatPose } from '../src/ocean/BoatBuoyancy';
import {
  SURVIVAL_ROTATION_SCALE,
  SURVIVAL_TRANSLATION_SCALE,
  applySurvivalBuoyancyComfortInto,
} from '../src/survival/survivalBuoyancyComfort';

describe('survival buoyancy comfort', () => {
  it('retains three percent translation and one percent rotation in caller-owned storage', () => {
    const source: BoatPose = {
      y: 2,
      pitch: 0.5,
      roll: -0.25,
      driftX: 0.4,
      driftZ: -0.6,
    };
    const output: BoatPose = {
      y: 99,
      pitch: 99,
      roll: 99,
      driftX: 99,
      driftZ: 99,
    };
    const outputReference = output;

    applySurvivalBuoyancyComfortInto(output, source);

    expect(SURVIVAL_TRANSLATION_SCALE).toBe(0.03);
    expect(SURVIVAL_ROTATION_SCALE).toBe(0.01);
    expect(output).toBe(outputReference);
    expect(output.y).toBeCloseTo(0.06);
    expect(output.pitch).toBeCloseTo(0.005);
    expect(output.roll).toBeCloseTo(-0.0025);
    expect(output.driftX).toBeCloseTo(0.012);
    expect(output.driftZ).toBeCloseTo(-0.018);
    expect(source).toEqual({
      y: 2,
      pitch: 0.5,
      roll: -0.25,
      driftX: 0.4,
      driftZ: -0.6,
    });
  });
});

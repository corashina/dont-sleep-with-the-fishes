import { describe, expect, it } from 'vitest';
import type { BoatPose } from '../src/ocean/BoatBuoyancy';
import {
  SURVIVAL_ROTATION_SCALE,
  SURVIVAL_TRANSLATION_SCALE,
  applySurvivalBuoyancyComfortInto,
} from '../src/survival/survivalBuoyancyComfort';

describe('survival buoyancy comfort', () => {
  it('retains eight percent translation and three percent rotation in caller-owned storage', () => {
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

    expect(SURVIVAL_TRANSLATION_SCALE).toBe(0.08);
    expect(SURVIVAL_ROTATION_SCALE).toBe(0.03);
    expect(output).toBe(outputReference);
    expect(output.y).toBeCloseTo(0.16);
    expect(output.pitch).toBeCloseTo(0.015);
    expect(output.roll).toBeCloseTo(-0.0075);
    expect(output.driftX).toBeCloseTo(0.032);
    expect(output.driftZ).toBeCloseTo(-0.048);
    expect(source).toEqual({
      y: 2,
      pitch: 0.5,
      roll: -0.25,
      driftX: 0.4,
      driftZ: -0.6,
    });
  });
});

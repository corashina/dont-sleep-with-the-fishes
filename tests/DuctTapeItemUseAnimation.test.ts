import { describe, expect, it } from 'vitest';
import {
  createEventItemUseSample,
  eventItemOutcomeDuration,
  eventItemUseDuration,
  sampleEventItemOutcome,
  sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';

function useSample(progress: number) {
  const sample = createEventItemUseSample();
  sampleEventItemUse('tape-stretch', 'ductTape', progress, sample);
  return sample;
}

function returnSample(progress: number) {
  const sample = createEventItemUseSample();
  sampleEventItemOutcome('tape-stretch', 'ductTape', 'depart', progress, sample);
  return sample;
}

describe('duct tape item use animation', () => {
  it('returns through the pickup path after the tape sound and action', () => {
    const held = useSample(1);
    const returnStart = returnSample(0);
    const returnMiddle = returnSample(0.5);
    const returned = returnSample(1);

    expect(returnStart).toEqual({ ...held, roll: -0 });
    expect(returnMiddle).toEqual({ ...useSample(0.21), roll: -0 });
    expect(returned.cameraSpaceBlend).toBe(0);
    expect(returned.viewX).toBe(0);
    expect(returned.viewY).toBeCloseTo(0);
    expect(returned.viewZ).toBe(-0.64);
    expect(returned.primaryEffect).toBe(0);
    expect(returned.itemVisible).toBe(false);
    expect(eventItemOutcomeDuration('ductTape', 'depart')).toBeCloseTo(
      eventItemUseDuration('tape-stretch') * 0.26,
    );
  });
});

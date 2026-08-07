// Importance: 4/5. Protects the targeted bucket scoop and flashlight-style return.
import { describe, expect, it } from 'vitest';
import {
  createEventItemUseSample,
  eventItemOutcomeDuration,
  sampleEventItemOutcome,
  sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';

function bucketSample(progress: number) {
  const sample = createEventItemUseSample();
  sampleEventItemUse('bucket-scoop', 'bucket', progress, sample);
  return sample;
}

function flashlightSample(progress: number) {
  const sample = createEventItemUseSample();
  sampleEventItemUse('flashlight-flash', 'flashlight', progress, sample);
  return sample;
}

describe('bucket item-use animation', () => {
  it('uses the flashlight lift timing', () => {
    for (const progress of [0.08, 0.16, 0.24, 0.34]) {
      expect(bucketSample(progress).cameraSpaceBlend)
        .toBeCloseTo(flashlightSample(progress).cameraSpaceBlend);
    }
  });

  it('flies over the starboard side, scoops in the water, and returns', () => {
    const held = bucketSample(0.4);
    const outbound = bucketSample(0.54);
    const target = bucketSample(0.66);
    const scoop = bucketSample(0.72);
    const returned = bucketSample(0.92);

    expect(held.targetBlend).toBe(0);
    expect(outbound.targetBlend).toBeGreaterThan(0);
    expect(outbound.targetBlend).toBeLessThan(1);
    expect(outbound.ballisticFlight).toBe(true);
    expect(outbound.flightArc).toBeGreaterThan(0.9);
    expect(outbound.flightArcHeight).toBe(0.9);
    expect(outbound.flightTarget).toBe('starboard-water');
    expect(target.targetBlend).toBe(1);
    expect(target.flightArc).toBe(0);
    expect(target.cameraTargetBlend).toBe(1);
    expect(scoop.targetBlend).toBe(1);
    expect(scoop.primaryEffect).toBe(1);
    expect(scoop.pitch).toBeGreaterThan(0.9);
    expect(returned.targetBlend).toBe(0);
    expect(returned.ballisticFlight).toBe(false);
    expect(returned.effectKind).toBe('none');
    expect(returned.itemVisible).toBe(true);
  });

  it('returns through the lift path with the flashlight duration', () => {
    const raised = bucketSample(1);
    const returnStart = createEventItemUseSample();
    const returned = createEventItemUseSample();

    sampleEventItemOutcome('bucket-scoop', 'bucket', 'recover', 0, returnStart);
    sampleEventItemOutcome('bucket-scoop', 'bucket', 'recover', 1, returned);

    expect(returnStart).toMatchObject({
      cameraSpaceBlend: raised.cameraSpaceBlend,
      viewX: raised.viewX,
      viewY: raised.viewY,
      viewZ: raised.viewZ,
    });
    expect(returned.cameraSpaceBlend).toBe(0);
    expect(returned.viewX).toBe(0);
    expect(returned.viewY).toBeCloseTo(0);
    expect(returned.viewZ).toBe(-0.64);
    expect(returned.itemVisible).toBe(false);
    expect(eventItemOutcomeDuration('bucket', 'recover'))
      .toBe(eventItemOutcomeDuration('flashlight', 'recover'));
  });
});

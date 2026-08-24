// Importance: 8/10 (scaled from 4/5). Protects the targeted bucket scoop and flashlight-style return.
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
  sampleEventItemUse('flashlight-signal', 'flashlight', progress, sample);
  return sample;
}

function baseBucketSample(progress: number) {
  const sample = createEventItemUseSample();
  sampleEventItemUse('base', 'bucket', progress, sample);
  return sample;
}

describe('bucket item-use animation', () => {
  it('uses the flashlight lift timing', () => {
    for (const progress of [0.08, 0.16, 0.24, 0.34]) {
      expect(bucketSample(progress).cameraSpaceBlend)
        .toBeCloseTo(flashlightSample(progress).cameraSpaceBlend);
    }
  });

  it('moves smoothly without an extra upward hop during pickup and return', () => {
    const pickupHeights = [0.08, 0.14, 0.2, 0.26, 0.32, 0.34]
      .map((progress) => bucketSample(progress).viewY);
    const returnHeights = [0, 0.2, 0.4, 0.6, 0.8, 1].map((progress) => {
      const sample = createEventItemUseSample();
      sampleEventItemOutcome('bucket-scoop', 'bucket', 'recover', progress, sample);
      return sample.viewY;
    });

    for (let index = 1; index < pickupHeights.length; index += 1) {
      expect(pickupHeights[index]).toBeLessThanOrEqual(pickupHeights[index - 1]!);
    }
    for (let index = 1; index < returnHeights.length; index += 1) {
      expect(returnHeights[index]).toBeGreaterThanOrEqual(returnHeights[index - 1]!);
    }
  });

  it('curves behind the bench without changing either endpoint', () => {
    const resting = bucketSample(0.08);
    const clearing = bucketSample(0.2);
    const held = bucketSample(0.34);

    expect(resting.viewX).toBe(baseBucketSample(0.08).viewX);
    expect(clearing.viewX).toBeLessThan(baseBucketSample(0.2).viewX - 0.25);
    expect(held.viewX).toBe(baseBucketSample(0.34).viewX);

    const returning = createEventItemUseSample();
    sampleEventItemOutcome('bucket-scoop', 'bucket', 'recover', 0.5, returning);
    expect(returning.viewX).toBeLessThan(-0.2);
  });

  it('flies over the starboard side, scoops in the water, and returns', () => {
    const held = bucketSample(0.38);
    const overBench = bucketSample(0.23);
    const overGunwale = bucketSample(0.44);
    const outbound = bucketSample(0.57);
    const target = bucketSample(0.7);
    const scoop = bucketSample(0.75);
    const returned = bucketSample(0.97);

    expect(held.targetBlend).toBe(0);
    expect(overBench.viewY).toBeLessThanOrEqual(held.viewY + 0.1);
    expect(overGunwale.targetBlend).toBe(0);
    expect(overGunwale.viewY).toBeGreaterThan(held.viewY + 0.25);
    expect(outbound.targetBlend).toBeGreaterThan(0);
    expect(outbound.targetBlend).toBeLessThan(1);
    expect(outbound.ballisticFlight).toBe(true);
    expect(outbound.flightArc).toBeGreaterThan(0.9);
    expect(outbound.flightArcHeight).toBe(0.9);
    expect(outbound.flightTarget).toBe('bucket-water');
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

import { describe, expect, it } from 'vitest';
import {
  createEventItemUseSample,
  eventItemOutcomeDuration,
  eventItemUseDuration,
  sampleEventItemOutcome,
  sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';
import { eventItemMotionProfile } from '../src/survival/eventItemMotionProfile';

describe('shotgun item use animation', () => {
  it('holds the shotgun in a first-person weapon position', () => {
    const sample = createEventItemUseSample();

    sampleEventItemUse('shotgun-fire', 'shotgun', 1, sample);

    expect(sample.cameraSpaceBlend).toBe(1);
    expect([sample.viewX, sample.viewY, sample.viewZ]).toEqual([0.18, -0.32, -0.78]);
    expect(sample.aimBlend).toBe(1);
    expect(eventItemMotionProfile('shotgun').aim).toBe('horizontal-entity');
  });

  it('returns along the reversed pickup path before hiding a spent shotgun', () => {
    const pickup = createEventItemUseSample();
    const returning = createEventItemUseSample();
    const stored = createEventItemUseSample();

    sampleEventItemUse('shotgun-fire', 'shotgun', 0.23, pickup);
    sampleEventItemOutcome('shotgun-fire', 'shotgun', 'depart', 0.5, returning);
    sampleEventItemOutcome('shotgun-fire', 'shotgun', 'depart', 1, stored);

    expect(returning.cameraSpaceBlend).toBeCloseTo(pickup.cameraSpaceBlend);
    expect(returning.viewX).toBeCloseTo(pickup.viewX);
    expect(returning.viewY).toBeCloseTo(pickup.viewY);
    expect(returning.viewZ).toBeCloseTo(pickup.viewZ);
    expect(stored.cameraSpaceBlend).toBe(0);
    expect(stored.itemVisible).toBe(false);
    expect(eventItemOutcomeDuration('shotgun', 'depart'))
      .toBeCloseTo(eventItemUseDuration('shotgun-fire') * 0.3);
  });
});

// Importance: 4/5. Protects the centered, close compass reading pose.
import { describe, expect, it } from 'vitest';
import {
  createEventItemUseSample,
  sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';
import { eventItemMotionProfile } from '../src/survival/eventItemMotionProfile';

describe('compass item-use animation', () => {
  it('holds the compass low, centered, close, and large', () => {
    const profile = eventItemMotionProfile('compass');
    const sample = createEventItemUseSample();
    sampleEventItemUse('compass-search', 'compass', 0.7, sample);

    expect(profile.view).toEqual([0, -0.1, -0.44]);
    expect(sample.cameraSpaceBlend).toBe(1);
    expect(sample.viewX).toBe(0);
    expect(sample.viewY).toBeCloseTo(-0.1);
    expect(sample.viewZ).toBe(-0.44);
    expect(sample.scaleX).toBeCloseTo(1.45);
    expect(sample.scaleY).toBeCloseTo(1.45);
    expect(sample.scaleZ).toBeCloseTo(1.45);
  });

  it('turns the compass left and then right without rotating the camera', () => {
    const left = createEventItemUseSample();
    const right = createEventItemUseSample();
    sampleEventItemUse('compass-search', 'compass', 0.55, left);
    sampleEventItemUse('compass-search', 'compass', 0.77, right);

    expect(left.yaw).toBeCloseTo(0.14);
    expect(right.yaw).toBeCloseTo(-0.14);
    expect(left.cameraYaw).toBe(0);
    expect(left.cameraPitch).toBe(0);
    expect(right.cameraYaw).toBe(0);
    expect(right.cameraPitch).toBe(0);
  });
});

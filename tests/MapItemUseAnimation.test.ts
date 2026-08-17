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
  sampleEventItemUse('map-read', 'map', progress, sample);
  return sample;
}

function returnSample(progress: number) {
  const sample = createEventItemUseSample();
  sampleEventItemOutcome('map-read', 'map', 'recover', progress, sample);
  return sample;
}

describe('map item use animation', () => {
  it('lifts the map before the camera turns left and right', () => {
    const lifted = useSample(0.34);
    const beforeLook = useSample(0.43);
    const leftLook = useSample(0.58);
    const rightLook = useSample(0.81);
    const centered = useSample(0.96);

    expect(lifted.cameraSpaceBlend).toBe(1);
    expect(lifted.viewY).toBeCloseTo(-0.2);
    expect(lifted.viewZ).toBeCloseTo(-0.58);
    expect(lifted.pitch).toBeCloseTo(-0.08);
    expect(lifted.scaleX).toBeCloseTo(1.5);
    expect(lifted.scaleY).toBeCloseTo(1.5);
    expect(lifted.scaleZ).toBeCloseTo(1.5);
    expect(lifted.cameraPitch).toBe(0);
    expect(beforeLook.cameraYaw).toBe(0);
    expect(leftLook.cameraYaw).toBeCloseTo(0.2);
    expect(rightLook.cameraYaw).toBeCloseTo(-0.2);
    expect(centered.cameraYaw).toBe(0);
    expect(leftLook.cameraPitch).toBe(0);
    expect(rightLook.cameraPitch).toBe(0);
    expect(centered.cameraPitch).toBe(0);
    expect(leftLook.roll).toBe(0);
    expect(rightLook.roll).toBe(0);
  });

  it('returns through the lift path and restores the camera', () => {
    const held = useSample(1);
    const returnStart = returnSample(0);
    const returnMiddle = returnSample(0.5);
    const returned = returnSample(1);

    expect(returnStart).toEqual(held);
    expect(returnMiddle).toEqual(useSample(0.22));
    expect(returnMiddle.cameraSpaceBlend).toBeGreaterThan(0);
    expect(returnMiddle.cameraSpaceBlend).toBeLessThan(1);
    expect(returned.cameraSpaceBlend).toBe(0);
    expect(returned.cameraYaw).toBe(0);
    expect(returned.cameraPitch).toBe(0);
    expect(returned.pitch).toBe(0);
    expect(eventItemOutcomeDuration('map', 'recover')).toBeCloseTo(
      eventItemUseDuration('map-read') * 0.44,
    );
  });
});

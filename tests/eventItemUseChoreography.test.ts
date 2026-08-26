// Importance: 10/10 (scaled from 5/5). Protects first-person event item choreography.
import { describe, expect, it } from 'vitest';
import {
  createEventItemUseSample,
  eventItemActionCueProgresses,
  resolveEventItemUseContext,
  sampleEventItemOutcome,
  sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';

function bucketHelmetAt(progress: number) {
  const sample = createEventItemUseSample();
  sampleEventItemUse('bucket-helmet', 'bucket', progress, sample);
  return sample;
}

describe('bucket helmet choreography', () => {
  it('moves the inverted bucket above the camera before lowering it around the view', () => {
    const start = bucketHelmetAt(0);
    const rising = bucketHelmetAt(0.18);
    const overhead = bucketHelmetAt(0.36);
    const worn = bucketHelmetAt(1);

    expect(start.cameraSpaceBlend).toBe(0);
    expect(rising.cameraSpaceBlend).toBeGreaterThan(0);
    expect(rising.viewY).toBeGreaterThan(0.45);
    expect(Math.abs(rising.viewZ)).toBeLessThan(0.01);
    expect(overhead.viewY).toBeGreaterThan(0.45);
    expect(overhead.viewX).toBeCloseTo(0);
    expect(Math.abs(overhead.viewZ)).toBeLessThan(0.01);
    expect(overhead.pitch).toBeCloseTo(-Math.PI);
    expect(overhead.scaleX).toBeCloseTo(1.35);
    expect(worn.viewY).toBeCloseTo(-0.04);
    expect(worn.viewX).toBeCloseTo(0);
    expect(Math.abs(worn.viewZ)).toBeLessThan(0.01);
    expect(worn.pitch).toBeCloseTo(-Math.PI);
    expect(worn.scaleX).toBeCloseTo(1.35);
    expect(worn.scaleY).toBeCloseTo(1.35);
    expect(worn.scaleZ).toBeCloseTo(1.35);
    expect(worn.primaryEffect).toBe(1);
  });

  it('keeps the bucket around the camera throughout the event result', () => {
    const worn = bucketHelmetAt(1);
    const outcome = createEventItemUseSample();

    sampleEventItemOutcome('bucket-helmet', 'bucket', 'broken', 0.7, outcome);

    expect(outcome.itemVisible).toBe(true);
    expect(outcome.cameraSpaceBlend).toBe(worn.cameraSpaceBlend);
    expect(outcome.viewX).toBeCloseTo(worn.viewX);
    expect(outcome.viewY).toBeCloseTo(worn.viewY);
    expect(outcome.viewZ).toBeCloseTo(worn.viewZ);
    expect(outcome.pitch).toBeCloseTo(worn.pitch);
  });

  it('starts enclosed rain when the bucket reaches the helmet position', () => {
    expect(eventItemActionCueProgresses('bucket-helmet')).toEqual([0.65]);
  });
});

describe('trade handover choreography', () => {
  it('turns the view and moves the item to the recipient', () => {
    const offered = createEventItemUseSample();

    sampleEventItemUse('trade-handover', 'bucket', 1, offered);

    expect(offered.targetBlend).toBeGreaterThan(0.9);
    expect(offered.cameraTargetBlend).toBeGreaterThan(0.7);
    expect(offered.ballisticFlight).toBe(false);
  });

  it('hands the Swim Ring to the recipient without throwing it', () => {
    const offered = createEventItemUseSample();

    sampleEventItemUse('trade-handover', 'swimRing', 1, offered);

    expect(offered.targetBlend).toBeGreaterThan(0.9);
    expect(offered.cameraTargetBlend).toBeGreaterThan(0.7);
    expect(offered.ballisticFlight).toBe(false);
  });
});

describe('radio signal reception choreography', () => {
  it('routes the lab choice and emits one signal cue', () => {
    expect(resolveEventItemUseContext(
      'item-animation-lab',
      'radioSignal',
      'radio',
    )).toBe('radio-signal-receive');
    expect(eventItemActionCueProgresses('radio-signal-receive')).toEqual([0.52]);
  });

  it('raises the radio toward the ear without aiming at an event target', () => {
    const held = createEventItemUseSample();
    const listening = createEventItemUseSample();

    sampleEventItemUse('radio-signal-receive', 'radio', 0.34, held);
    sampleEventItemUse('radio-signal-receive', 'radio', 0.8, listening);

    expect(listening.viewY).toBeGreaterThan(held.viewY + 0.3);
    expect(listening.viewZ).toBeGreaterThan(held.viewZ + 0.1);
    expect(listening.cameraYaw).toBeLessThan(0);
    expect(listening.targetBlend).toBe(0);
  });

  it('returns the radio to its storage pose without lowering it below the boat', () => {
    const returning = createEventItemUseSample();
    const returned = createEventItemUseSample();

    sampleEventItemOutcome('radio-signal-receive', 'radio', 'recover', 0.75, returning);
    sampleEventItemOutcome('radio-signal-receive', 'radio', 'recover', 1, returned);

    expect(returning.viewY).toBeGreaterThan(-0.2);
    expect(returned.cameraSpaceBlend).toBe(0);
    expect(returned.yaw).toBeCloseTo(0);
    expect(returned.pitch).toBeCloseTo(0);
    expect(returned.roll).toBeCloseTo(0);
    expect(returned.itemVisible).toBe(true);
  });
});

describe('map leak patch choreography', () => {
  it('aligns the map with the hull before pressing it onto the leak', () => {
    const startingPickup = createEventItemUseSample();
    const lifted = createEventItemUseSample();
    const clearingShelf = createEventItemUseSample();
    const aligning = createEventItemUseSample();
    const travelling = createEventItemUseSample();
    const patched = createEventItemUseSample();

    sampleEventItemUse('map-leak-patch', 'map', 0.09, startingPickup);
    sampleEventItemUse('map-leak-patch', 'map', 0.22, lifted);
    sampleEventItemUse('map-leak-patch', 'map', 0.2, clearingShelf);
    sampleEventItemUse('map-leak-patch', 'map', 0.55, aligning);
    sampleEventItemUse('map-leak-patch', 'map', 0.75, travelling);
    sampleEventItemUse('map-leak-patch', 'map', 1, patched);

    expect(startingPickup.minimumLiftY).toBeGreaterThan(0);
    expect(startingPickup.cameraSpaceBlend).toBe(0);
    expect(startingPickup.pitch).toBe(0);
    expect(startingPickup.roll).toBeCloseTo(0);
    expect(clearingShelf.minimumLiftY).toBeGreaterThan(startingPickup.minimumLiftY);
    expect(lifted.minimumLiftY).toBeCloseTo(0.42);
    expect(lifted.cameraSpaceBlend).toBe(0);
    expect(aligning.surfaceFacing).toBe('target-plane-opposite');
    expect(aligning.aimBlend).toBeGreaterThan(0);
    expect(aligning.targetBlend).toBe(0);
    expect(patched.aimBlend).toBe(1);
    expect(patched.targetBlend).toBeGreaterThan(0.97);
    expect(travelling.flightArc).toBeGreaterThan(0.9);
    expect(travelling.flightArcHeight).toBeGreaterThan(0.5);
    expect(eventItemActionCueProgresses('map-leak-patch')).toEqual([0.78]);
  });
});

describe('map event routing', () => {
  it('does not route the Map through cover supplies', () => {
    expect(resolveEventItemUseContext('shower-night', 'map', 'map')).toBe('map-read');
    expect(resolveEventItemUseContext('windy-night', 'map', 'map')).toBe('map-read');
  });
});

describe('umbrella event routing', () => {
  it('does not route Windy Night through cover supplies', () => {
    expect(resolveEventItemUseContext(
      'windy-night',
      'umbrella',
      'umbrella',
    )).toBeNull();
  });
});

describe('bucket event routing', () => {
  it('does not route the Flowers bucket through an item animation', () => {
    expect(resolveEventItemUseContext('flowers', 'bucket', 'bucket')).toBeNull();
  });
});

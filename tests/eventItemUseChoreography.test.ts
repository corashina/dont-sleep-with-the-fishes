// Importance: 10/10 (scaled from 5/5). Protects first-person event item choreography.
import { describe, expect, it } from 'vitest';
import {
  createEventItemUseSample,
  eventItemActionCueProgresses,
  resolveEventItemUseContext,
  sampleEventItemOutcome,
  sampleEventItemUse,
  type EventItemUseContext,
} from '../src/survival/eventItemUseChoreography';
import {
  identityDeathStareSample,
  sampleDeathStareItemUse,
} from '../src/survival/events/deathStareChoreography';
import {
  createSwarmSample,
  createSwarmSharkPose,
  createSwarmVariants,
  sampleSwarmItemUse,
  sampleSwarmSharkPose,
} from '../src/survival/events/sharkSwarmChoreography';

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
});

describe('trade handover choreography', () => {
  it('turns the view and moves the item to the recipient', () => {
    const offered = createEventItemUseSample();

    sampleEventItemUse('trade-handover', 'bucket', 1, offered);

    expect(offered.targetBlend).toBeGreaterThan(0.9);
    expect(offered.cameraTargetBlend).toBeGreaterThan(0.7);
    expect(offered.ballisticFlight).toBe(false);
  });
});

describe('radio signal reception choreography', () => {

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

describe('bucket event routing', () => {
  it('does not route the Flowers bucket through an item animation', () => {
    expect(resolveEventItemUseContext('flowers', 'bucket', 'bucket')).toBeNull();
  });
});

describe('fishing net attack choreography', () => {
  const combatEvents = ['death-stare', 'swarm-of-sharks'] as const;

  it('routes only combat net choices through the slap', () => {
    for (const eventId of combatEvents) {
      expect(resolveEventItemUseContext(eventId, 'fishingNet', 'fishingNet'))
        .toBe('net-slap');
    }

    expect(resolveEventItemUseContext('school-of-fish', 'fishingNet', 'fishingNet'))
      .toBe('net-scoop');
    expect(resolveEventItemUseContext('snatcher', 'fishingNet', 'fishingNet'))
      .toBe('net-scoop');
    expect(resolveEventItemUseContext('windy-night', 'fishingNet', 'fishingNet'))
      .toBe('net-scoop');
    expect(resolveEventItemUseContext('flowers', 'fishingNet', 'fishingNet'))
      .toBe('net-scoop');
    expect(resolveEventItemUseContext('handyman', 'fishingNet', 'fishingNet'))
      .toBe('trade-handover');
  });

  it('winds up, reaches the enemy, and returns to the player', () => {
    const context = 'net-slap' as EventItemUseContext;
    const windUp = createEventItemUseSample();
    const contact = createEventItemUseSample();
    const recovered = createEventItemUseSample();

    sampleEventItemUse(context, 'fishingNet', 0.6, windUp);
    sampleEventItemUse(context, 'fishingNet', 0.68, contact);
    sampleEventItemUse(context, 'fishingNet', 1, recovered);

    expect(windUp.yaw).toBeLessThan(contact.yaw);
    expect(windUp.roll).toBeCloseTo(Math.PI / 2);
    expect(windUp.targetBlend).toBeGreaterThan(0);
    expect(windUp.targetBlend).toBeLessThan(1);
    expect(contact.targetBlend).toBeGreaterThan(0.75);
    expect(contact.ballisticFlight).toBe(false);
    expect(contact.itemVisible).toBe(true);
    expect(contact.primaryEffect).toBe(0);
    expect(recovered.targetBlend).toBe(0);
    expect(recovered.itemVisible).toBe(true);
    expect(eventItemActionCueProgresses(context)).toEqual([0.68]);
  });

  it('makes the Death Stare creature flinch at contact', () => {
    const sample = identityDeathStareSample();

    sampleDeathStareItemUse('fishingNet', 0.692, sample);

    expect(sample.effectKind).toBe('net-slap');
    expect(sample.effectStrength).toBeGreaterThan(0.95);
    expect(sample.blink).toBeGreaterThan(0.95);
    expect(sample.fishZ).toBeLessThan(-0.1);
  });

  it('knocks the nearest shark away at contact', () => {
    const sample = createSwarmSample();
    const variants = createSwarmVariants(5, 17);
    const before = createSwarmSharkPose();
    const contact = createSwarmSharkPose();

    sampleSwarmSharkPose(variants[0]!, 0, sample, before);
    sampleSwarmItemUse('fishingNet', 0.692, sample);
    sampleSwarmSharkPose(variants[0]!, 0, sample, contact);

    expect(sample.effectKind).toBe('net-slap');
    expect(sample.effect).toBeGreaterThan(0.95);
    expect(Math.hypot(contact.x, contact.z)).toBeGreaterThan(
      Math.hypot(before.x, before.z),
    );
  });
});

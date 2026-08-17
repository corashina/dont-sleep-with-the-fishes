// Importance: 4/5. Protects the real net scoop and reverse stow motion.
import { describe, expect, it } from 'vitest';
import {
  createEventItemUseSample,
  eventItemOutcomeDuration,
  eventItemUseDuration,
  sampleEventItemOutcome,
  sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';
import { eventItemMotionProfile } from '../src/survival/eventItemMotionProfile';

describe('fishing net item-use animation', () => {
  it('holds the handle close and forward before rotating into the scoop', () => {
    const lifting = createEventItemUseSample();
    const baseLift = createEventItemUseSample();
    const held = createEventItemUseSample();
    const overGunwale = createEventItemUseSample();
    const scooping = createEventItemUseSample();
    const bucket = createEventItemUseSample();

    sampleEventItemUse('net-scoop', 'fishingNet', 0.23, lifting);
    sampleEventItemUse('base', 'fishingNet', 0.23, baseLift);
    sampleEventItemUse('net-scoop', 'fishingNet', 0.38, held);
    sampleEventItemUse('net-scoop', 'fishingNet', 0.57, overGunwale);
    sampleEventItemUse('net-scoop', 'fishingNet', 0.75, scooping);
    sampleEventItemUse('bucket-scoop', 'bucket', 0.57, bucket);

    expect(lifting.viewX).toBeCloseTo(baseLift.viewX);
    expect(lifting.viewY).toBeCloseTo(baseLift.viewY);
    expect(lifting.viewZ).toBeGreaterThan(baseLift.viewZ);
    expect(held.targetBlend).toBe(0);
    expect(held.viewZ).toBeCloseTo(eventItemMotionProfile('flareGun').view[2]);
    expect(held.yaw).toBeCloseTo(0);
    expect(held.pitch).toBeCloseTo(0);
    expect(held.roll).toBeCloseTo(0);
    expect(held.aimBlend).toBe(0);
    expect(overGunwale.targetBlend).toBeGreaterThan(0);
    expect(overGunwale.targetBlend).toBeLessThan(1);
    expect(overGunwale.ballisticFlight).toBe(true);
    expect(overGunwale.flightArc).toBeGreaterThan(0.9);
    expect(overGunwale.flightArcHeight).toBe(bucket.flightArcHeight);
    expect(overGunwale.flightTarget).toBe('bucket-water');
    expect(overGunwale.cameraTargetBlend).toBeGreaterThan(0);
    expect(overGunwale.targetBlend).toBeCloseTo(bucket.targetBlend);
    expect(overGunwale.cameraTargetBlend).toBeCloseTo(bucket.cameraTargetBlend);
    expect(overGunwale.pitch).toBeCloseTo(-bucket.pitch);
    expect(overGunwale.pitch).toBeLessThan(0);
    expect(overGunwale.roll).toBeCloseTo(bucket.roll);
    expect(overGunwale.yaw).toBeCloseTo(bucket.yaw);
    expect(overGunwale.aimBlend).toBe(0);
    expect(overGunwale.roll).toBeLessThan(0);
    expect(scooping.targetBlend).toBe(1);
    expect(scooping.ballisticFlight).toBe(true);
    expect(scooping.flightArc).toBe(0);
    expect(scooping.cameraTargetBlend).toBe(1);
    expect(scooping.primaryEffect).toBe(1);
    expect(scooping.pitch).toBeLessThan(0);
    expect(scooping.effectKind).toBe('none');
    expect(scooping.scaleX).toBe(1);
    expect(scooping.scaleY).toBe(1);
    expect(scooping.scaleZ).toBe(1);
    expect(eventItemMotionProfile('fishingNet').actionOrigin)
      .toEqual([0, 0, -0.82]);
  });

  it('returns forward without a vertical bounce after a recovered use', () => {
    const raised = createEventItemUseSample();
    const returning = createEventItemUseSample();
    const halfwayReturned = createEventItemUseSample();
    const matchingLift = createEventItemUseSample();
    const stowed = createEventItemUseSample();

    sampleEventItemUse('net-scoop', 'fishingNet', 1, raised);
    sampleEventItemOutcome('net-scoop', 'fishingNet', 'recover', 0, returning);
    sampleEventItemOutcome('net-scoop', 'fishingNet', 'recover', 0.5, halfwayReturned);
    sampleEventItemUse('base', 'fishingNet', 0.23, matchingLift);
    sampleEventItemOutcome('net-scoop', 'fishingNet', 'recover', 1, stowed);

    expect(returning.cameraSpaceBlend).toBe(raised.cameraSpaceBlend);
    expect(returning.viewX).toBe(raised.viewX);
    expect(returning.viewY).toBe(raised.viewY);
    expect(returning.viewZ).toBe(raised.viewZ);
    expect(returning.aimBlend).toBe(raised.aimBlend);
    expect(returning.yaw).toBeCloseTo(0);
    expect(returning.pitch).toBeCloseTo(0);
    expect(returning.roll).toBeCloseTo(0);
    expect(halfwayReturned.viewY).toBeCloseTo(matchingLift.viewY);
    expect(stowed.cameraSpaceBlend).toBe(0);
    expect(stowed.viewX).toBe(0);
    expect(stowed.viewY).toBeCloseTo(0);
    expect(stowed.viewZ).toBe(-0.64);
    expect(stowed.yaw).toBe(0);
    expect(stowed.aimBlend).toBe(0);
    expect(stowed.itemVisible).toBe(false);
    expect(eventItemOutcomeDuration('fishingNet', 'recover'))
      .toBeLessThan(eventItemUseDuration('net-scoop'));
  });
});

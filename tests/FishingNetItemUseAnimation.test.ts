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
  it('lifts the real net over the boat before it enters the water', () => {
    const held = createEventItemUseSample();
    const overGunwale = createEventItemUseSample();
    const scooping = createEventItemUseSample();

    sampleEventItemUse('net-scoop', 'fishingNet', 0.47, held);
    sampleEventItemUse('net-scoop', 'fishingNet', 0.6, overGunwale);
    sampleEventItemUse('net-scoop', 'fishingNet', 0.76, scooping);

    expect(held.targetBlend).toBe(0);
    expect(held.viewY).toBeGreaterThan(0);
    expect(overGunwale.targetBlend).toBeGreaterThan(0);
    expect(overGunwale.targetBlend).toBeLessThan(1);
    expect(overGunwale.ballisticFlight).toBe(false);
    expect(overGunwale.flightArc).toBe(0);
    expect(overGunwale.flightArcHeight).toBe(0);
    expect(overGunwale.flightTarget).toBe('starboard-water');
    expect(overGunwale.cameraTargetBlend).toBeGreaterThan(0);
    expect(overGunwale.fovScale).toBeGreaterThan(1);
    expect(scooping.targetBlend).toBe(1);
    expect(scooping.ballisticFlight).toBe(false);
    expect(scooping.flightArc).toBe(0);
    expect(scooping.cameraTargetBlend).toBe(0.5);
    expect(scooping.effectKind).toBe('none');
    expect(scooping.scaleX).toBe(1);
    expect(scooping.scaleY).toBe(1);
    expect(scooping.scaleZ).toBe(1);
    expect(eventItemMotionProfile('fishingNet').actionOrigin)
      .toEqual([0, -0.82, 0]);
  });

  it('returns through the lift path after a recovered use', () => {
    const raised = createEventItemUseSample();
    const returning = createEventItemUseSample();
    const stowed = createEventItemUseSample();

    sampleEventItemUse('net-scoop', 'fishingNet', 1, raised);
    sampleEventItemOutcome('net-scoop', 'fishingNet', 'recover', 0, returning);
    sampleEventItemOutcome('net-scoop', 'fishingNet', 'recover', 1, stowed);

    expect(returning).toMatchObject({
      cameraSpaceBlend: raised.cameraSpaceBlend,
      viewX: raised.viewX,
      viewY: raised.viewY,
      viewZ: raised.viewZ,
      aimBlend: raised.aimBlend,
    });
    expect(stowed.cameraSpaceBlend).toBe(0);
    expect(stowed.viewX).toBe(0);
    expect(stowed.viewY).toBeCloseTo(0);
    expect(stowed.viewZ).toBe(-0.64);
    expect(stowed.aimBlend).toBe(0);
    expect(stowed.itemVisible).toBe(false);
    expect(eventItemOutcomeDuration('fishingNet', 'recover'))
      .toBeLessThan(eventItemUseDuration('net-scoop'));
  });
});

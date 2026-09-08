import { describe, expect, it } from 'vitest';
import {
  createEventItemUseSample,
  sampleEventItemUse,
} from '../src/survival/eventItemUseChoreography';

describe('Knife survival item', () => {

  it('stabs the active target after clearing the gunwale without camera motion', () => {
    const ready = createEventItemUseSample();
    const contact = createEventItemUseSample();

    sampleEventItemUse('knife-stab', 'knife', 0.36, ready);
    sampleEventItemUse('knife-stab', 'knife', 0.68, contact);

    expect(contact.targetBlend).toBe(1);
    expect(contact.cameraTargetBlend).toBe(0);
    expect(contact.ballisticFlight).toBe(false);
    expect(contact.flightArc).toBe(0);
    expect(contact.flightArcHeight).toBeGreaterThan(0.6);
    expect(contact.minimumLiftY).toBe(0);
    expect(contact.aimBlend).toBe(1);
    expect(contact.viewZ).toBeGreaterThan(-0.7);
    expect(contact.itemVisible).toBe(true);
    expect(contact.cameraYaw).toBe(0);
    expect(contact.cameraPitch).toBe(0);
    expect(contact.yaw).toBe(ready.yaw);
    expect(contact.pitch).toBe(ready.pitch);
    expect(contact.roll).toBe(ready.roll);
  });

  it('keeps every new knife phase continuous', () => {
    let previousTargetBlend = 0;
    let previousAimBlend = 0;
    let previousFlightArc = 0;
    let maximumFlightArcStep = 0;
    for (let frame = 0; frame <= 300; frame += 1) {
      const sample = createEventItemUseSample();
      sampleEventItemUse('knife-stab', 'knife', frame / 300, sample);

      expect(Math.abs(sample.targetBlend - previousTargetBlend)).toBeLessThan(0.05);
      expect(Math.abs(sample.aimBlend - previousAimBlend)).toBeLessThan(0.05);
      maximumFlightArcStep = Math.max(
        maximumFlightArcStep,
        Math.abs(sample.flightArc - previousFlightArc),
      );
      if (sample.targetBlend > 0) expect(sample.aimBlend).toBe(1);
      expect(sample.flightArc).toBeGreaterThanOrEqual(0);
      expect(sample.minimumLiftY).toBe(0);
      previousTargetBlend = sample.targetBlend;
      previousAimBlend = sample.aimBlend;
      previousFlightArc = sample.flightArc;
    }
    expect(maximumFlightArcStep).toBeLessThan(0.2);
  });
});

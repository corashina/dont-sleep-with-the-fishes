// Importance: 10/10 (scaled from 5/5). Protects first-person event item choreography.
import { describe, expect, it } from 'vitest';
import {
  createEventItemUseSample,
  eventItemActionCueProgresses,
  sampleEventItemUse,
  type EventItemUseContext,
} from '../src/survival/eventItemUseChoreography';

describe('fishing net attack choreography', () => {

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
});

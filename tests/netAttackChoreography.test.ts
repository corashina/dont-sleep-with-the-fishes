import { describe, expect, it } from 'vitest';
import { createEventItemUseSample, eventItemUseDuration, sampleEventItemUse } from '../src/survival/eventItemUseChoreography';
import { deathStareItemDuration, identityDeathStareSample, sampleDeathStareItemUse } from '../src/survival/events/deathStareChoreography';
import { createSwarmSample, sampleSwarmItemUse, swarmItemDuration } from '../src/survival/events/sharkSwarmChoreography';

describe('shared net attack', () => {
  it('synchronizes both enemies with the item clock', () => {
    expect(deathStareItemDuration('fishingNet')).toBe(eventItemUseDuration('net-slap'));
    expect(swarmItemDuration('fishingNet')).toBe(eventItemUseDuration('net-slap'));
  });

  it('does not make either enemy recoil before contact', () => {
    const deathStare = identityDeathStareSample();
    const shark = createSwarmSample();
    for (const progress of [0.5, 0.58, 0.619]) {
      sampleDeathStareItemUse('fishingNet', progress, deathStare);
      sampleSwarmItemUse('fishingNet', progress, shark);
      expect(deathStare.effectStrength).toBe(0);
      expect(shark.netSlap).toBe(0);
    }
  });

  it('continues the arc through impact and then slows to a stop', () => {
    const before = createEventItemUseSample();
    const contact = createEventItemUseSample();
    const after = createEventItemUseSample();
    sampleEventItemUse('net-slap', 'fishingNet', 0.61, before);
    sampleEventItemUse('net-slap', 'fishingNet', 0.62, contact);
    sampleEventItemUse('net-slap', 'fishingNet', 0.63, after);
    expect(before.pitch).toBeGreaterThan(contact.pitch);
    expect(contact.pitch).toBeGreaterThan(after.pitch);
    expect(contact.targetBlend).toBe(1);
    expect(after.targetBlend).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import { createEventItemUseSample, eventItemUseDuration, resolveEventItemUseContext, sampleEventItemUse } from '../src/survival/eventItemUseChoreography';
import { deathStareItemDuration, identityDeathStareSample, sampleDeathStareItemUse } from '../src/survival/events/deathStareChoreography';
import { createSwarmSample, sampleSwarmItemUse, swarmItemDuration } from '../src/survival/events/sharkSwarmChoreography';

describe('shared net attack', () => {
  it('resolves the generic attack without an enemy event', () => {
    for (const eventId of ['item-animation-lab', 'death-stare', 'swarm-of-sharks', 'arbitrary-target']) {
      expect(resolveEventItemUseContext(eventId, 'attack', 'fishingNet')).toBe('net-slap');
    }
    const sample = createEventItemUseSample();
    for (let frame = 0; frame <= 100; frame += 1) {
      sampleEventItemUse('net-slap', 'fishingNet', frame / 100, sample);
      expect([sample.cameraYaw, sample.cameraPitch, sample.cameraTargetBlend]).toEqual([0, 0, 0]);
      expect(sample.fovScale).toBe(1);
    }
  });
  it('synchronizes both enemies with the item clock', () => {
    expect(deathStareItemDuration('fishingNet')).toBe(eventItemUseDuration('net-slap'));
    expect(swarmItemDuration('fishingNet')).toBe(eventItemUseDuration('net-slap'));
  });

  it('does not make either enemy recoil before contact', () => {
    const deathStare = identityDeathStareSample();
    const shark = createSwarmSample();
    for (const progress of [0.5, 0.64, 0.679]) {
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
    sampleEventItemUse('net-slap', 'fishingNet', 0.679, before);
    sampleEventItemUse('net-slap', 'fishingNet', 0.68, contact);
    sampleEventItemUse('net-slap', 'fishingNet', 0.681, after);
    expect(before.yaw).toBeLessThan(contact.yaw);
    expect(contact.yaw).toBeLessThan(after.yaw);
    expect(contact.targetBlend).toBe(1);
    expect(after.targetBlend).toBe(1);
  });

  it('takes time to lift, then sweeps through the strike in about 0.38 seconds', () => {
    const sample = createEventItemUseSample();
    sampleEventItemUse('net-slap', 'fishingNet', 0.38, sample);
    expect(sample.cameraSpaceBlend).toBeLessThan(0.9);
    expect(sample.targetBlend).toBe(0);
    sampleEventItemUse('net-slap', 'fishingNet', 0.48, sample);
    expect(sample.cameraSpaceBlend).toBe(1);
    expect(sample.targetBlend).toBe(0);
    sampleEventItemUse('net-slap', 'fishingNet', 0.63, sample);
    const backswingYaw = sample.yaw;
    const strikeEnd = 0.63 + 0.385 / eventItemUseDuration('net-slap');
    sampleEventItemUse('net-slap', 'fishingNet', strikeEnd, sample);
    expect(sample.yaw - backswingYaw).toBeGreaterThan(2.6);
  });
});

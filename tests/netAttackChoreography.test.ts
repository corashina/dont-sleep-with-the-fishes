import { describe,expect,it } from 'vitest';
import { createEventItemUseSample,resolveEventItemUseContext,sampleEventItemUse } from '../src/survival/eventItemUseChoreography';

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
});

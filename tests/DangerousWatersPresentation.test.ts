import { describe, expect, it } from 'vitest';
import {
  DangerousWatersPresentation,
  DANGEROUS_WATERS_ITEM_DURATION,
  type DangerousWatersBoatReaction,
} from '../src/survival/DangerousWatersPresentation';

function reaction(): DangerousWatersBoatReaction {
  return {
    driftX: 0, pitch: 0, yaw: 0, roll: 0, cameraYaw: 0, cameraZ: 0,
    lightScale: 1, supplyRoll: 0, supplyLift: 0,
  };
}

describe('Dangerous Waters map result', () => {
  it.each([0, -8])('keeps the map route still while retaining hull damage of %s', async (hull) => {
    const presentation = new DangerousWatersPresentation();
    const pose = reaction();
    try {
      presentation.stage();
      const use = presentation.playItemUse('map', 'map-1');
      for (let frame = 0; frame < 20; frame += 1) {
        presentation.update(frame, DANGEROUS_WATERS_ITEM_DURATION / 20);
        presentation.copyBoatReaction(pose);
        expect(pose).toEqual(reaction());
      }
      presentation.update(21, 0.01);
      await use;
      const result = presentation.react({
        accepted: true, code: 'event-resolved', message: '', cue: 'none', deltas: { hull },
      });
      presentation.update(22, 0.45);
      presentation.copyBoatReaction(pose);
      expect(pose.driftX).toBe(0);
      expect(pose.yaw).toBe(0);
      if (hull === 0) expect(pose).toEqual(reaction());
      else expect(pose.roll).not.toBe(0);
      presentation.update(23, 0.45);
      await result;
      presentation.copyBoatReaction(pose);
      expect(pose.driftX).toBe(0);
      expect(pose.yaw).toBe(0);
    } finally {
      presentation.dispose();
    }
  });
});

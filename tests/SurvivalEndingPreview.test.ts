import { describe, expect, it, vi } from 'vitest';
import { SurvivalAudio } from '../src/audio/SurvivalAudio';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';

describe('survival ending previews', () => {
  it.each([
    ['rescue', 'rescued'],
    ['death', 'dead'],
    ['sinking', 'sunk'],
  ] as const)('presents %s once without changing checkpoints', async (endingId, state) => {
    const render = vi.fn();
    const showEnding = vi.fn();
    const onCheckpointChange = vi.fn();
    const endingAudio = vi.spyOn(SurvivalAudio.prototype, 'ending');
    const phase = SurvivalPhase.forTestStart({
      world: { playRescueEnding: async (onStart) => { onStart(); } },
      ui: { render, showEnding },
      onCheckpointChange,
    }, {
      kind: 'ending-preview',
      endingId,
      savedItems: [{ instanceId: 'map-1', type: 'map' }],
      seed: 41,
      scavengeElapsedSeconds: 0,
    });

    try {
      phase.start();
      phase.start();
      phase.update(1, 1);
      phase.handleAction('eat');
      await Promise.resolve();

      expect(render).toHaveBeenCalledWith(expect.objectContaining({
        state,
        pendingEventId: null,
        ending: expect.objectContaining({ id: endingId, day: 1, savedPickupCount: 1 }),
      }), expect.any(Function));
      expect(showEnding).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: endingId }));
      expect(endingAudio).toHaveBeenCalledExactlyOnceWith(endingId);
      expect(phase.getSurvivalCheckpoint()).toBeNull();
      expect(onCheckpointChange).not.toHaveBeenCalled();
    } finally {
      phase.dispose();
      endingAudio.mockRestore();
    }
  });

});

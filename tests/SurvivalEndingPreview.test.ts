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

  it.each(['complete', 'dispose', 'restart'] as const)(
    'waits for the rescue fade and handles %s', async (operation) => {
      let finish!: () => void;
      const showEnding = vi.fn();
      const beginRescueEnding = vi.fn();
      const setRescueFade = vi.fn();
      const playRescueEnding = vi.fn((start: () => void, fade: (value: number) => void) => {
        start();
        return new Promise<void>((resolve) => { finish = () => { fade(1); resolve(); }; });
      });
      const phase = SurvivalPhase.forTestStart({
        world: { playRescueEnding },
        ui: { showEnding, beginRescueEnding, setRescueFade },
      }, {
        kind: 'ending-preview', endingId: 'rescue', savedItems: [], seed: 41,
        scavengeElapsedSeconds: 0,
      });
      try {
        phase.start();
        phase.update(1, 1);
        expect(beginRescueEnding).toHaveBeenCalledOnce();
        expect(playRescueEnding).toHaveBeenCalledOnce();
        expect(showEnding).not.toHaveBeenCalled();
        if (operation === 'dispose') phase.dispose();
        if (operation === 'restart') phase.requestRestart();
        finish();
        await Promise.resolve();
        if (operation === 'complete') {
          expect(setRescueFade).toHaveBeenLastCalledWith(1);
          expect(showEnding).toHaveBeenCalledOnce();
          expect(setRescueFade.mock.invocationCallOrder[0])
            .toBeLessThan(showEnding.mock.invocationCallOrder[0]!);
        } else {
          expect(showEnding).not.toHaveBeenCalled();
          expect(setRescueFade).not.toHaveBeenCalled();
        }
      } finally { phase.dispose(); }
    },
  );
});

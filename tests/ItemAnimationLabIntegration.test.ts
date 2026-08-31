import { describe, expect, it, vi } from 'vitest';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import type { SurvivalUI } from '../src/ui/SurvivalUI';

describe('Item Animation Lab condition projection', () => {
  it('refreshes the world and UI in the same action without publishing a checkpoint', () => {
    const session = new SurvivalSession([{ instanceId: 'bucket-1', type: 'bucket' }], { seed: 19 });
    const render = vi.fn();
    const showItemAnimationLabChoices = vi.fn();
    const ui: Partial<SurvivalUI> = { render, showItemAnimationLabChoices };
    const syncInventory = vi.fn();
    const onCheckpointChange = vi.fn();
    const onFatalError = vi.fn();
    const phase = SurvivalPhase.forTest({
      session, ui, world: { syncInventory }, onCheckpointChange, onFatalError,
    }, 'item-animation-lab');
    try {
      phase.start();
      onCheckpointChange.mockClear();
      ui.onEventItem?.('bucket-scoop', 'bucket-1');

      ui.onEventChoice?.('break');

      expect(session.snapshot().inventory['bucket-1']?.condition).toBe('broken');
      expect(render.mock.lastCall?.[0]).toBe(session.snapshot());
      expect(syncInventory).toHaveBeenLastCalledWith(session.snapshot());
      expect(showItemAnimationLabChoices).toHaveBeenLastCalledWith(expect.arrayContaining([
        { id: 'fix', label: 'Fix', unavailableReason: null },
      ]));

      ui.onEventChoice?.('fix');

      expect(session.snapshot().inventory['bucket-1']?.condition).toBe('usable');
      expect(render.mock.lastCall?.[0]).toBe(session.snapshot());
      expect(syncInventory).toHaveBeenLastCalledWith(session.snapshot());
      expect(phase.getSurvivalCheckpoint()).toBeNull();
      expect(onCheckpointChange).not.toHaveBeenCalled();
      expect(onFatalError).not.toHaveBeenCalled();
    } finally {
      phase.dispose();
    }
  });
});

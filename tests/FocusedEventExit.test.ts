import { describe, expect, it, vi } from 'vitest';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import type { SurvivalUI } from '../src/ui/SurvivalUI';
import type { FocusedEventFocusView } from '../src/ui/SurvivalUiViewModel';

describe('focused event exits with no affordable reward', () => {
  for (const eventId of ['wreckage', 'drifting-supplies', 'drifting-chest'] as const) {
    it.each(['choice', 'return'] as const)(`${eventId}: %s restores the day without cost`, async (exit) => {
      const session = new SurvivalSession([], {
        seed: 41, initial: { day: 3, energy: 0 }, initialEventId: eventId,
      });
      const before = session.snapshot();
      const showFocusedEvent = vi.fn();
      const ui: Partial<SurvivalUI> = {
        setBusy: vi.fn(), render: vi.fn(), restoreCommandFocus: vi.fn(),
        showFocusedEvent, hideFocusedEvent: vi.fn(), clearEventPresentation: vi.fn(),
        playEventChoiceBeat: vi.fn(async () => {}),
        setSleepCovered: vi.fn(async () => {}),
        settleCoveredScene: vi.fn(async () => {}),
        showEventReveal: vi.fn(async () => {}),
      };
      const phase = SurvivalPhase.forTest({
        session, ui,
        world: {
          stageEvent: vi.fn(), revealEvent: vi.fn(async () => {}),
          enterFocusedEventView: vi.fn(async () => {}),
          exitFocusedEventView: vi.fn(async () => {}),
          recedeDriftingItem: vi.fn(async () => {}),
          playEventChoice: vi.fn(async () => {}), clearEvent: vi.fn(),
        },
      }, eventId);
      try {
        phase.start();
        await vi.waitFor(() => expect(ui.setBusy).toHaveBeenLastCalledWith(false));
        ui.onFocusedEventSelect?.(eventId);
        await vi.waitFor(() => expect(showFocusedEvent).toHaveBeenCalledOnce());
        const declineId = eventId === 'wreckage' ? 'leave' : 'sleep';
        const choices = (showFocusedEvent.mock.calls[0]![0] as FocusedEventFocusView).choices;
        expect(choices).toEqual(expect.arrayContaining([
          expect.objectContaining({ id: declineId, unavailableReason: null }),
        ]));
        for (const choice of choices.filter(({ id }) => id !== declineId)) {
          expect(choice.unavailableReason).toEqual(expect.any(String));
        }
        if (exit === 'return') ui.onFocusedEventBack?.();
        else ui.onFocusedEventChoice?.({ id: declineId, instanceId: null });
        await vi.waitFor(() => expect(session.snapshot()).toMatchObject({ state: 'day', pendingEventId: null }));
        await vi.waitFor(() => expect(ui.restoreCommandFocus).toHaveBeenCalled());
        expect(session.snapshot()).toMatchObject({
          day: before.day, health: before.health, hunger: before.hunger,
          energy: before.energy, hull: before.hull, inventory: before.inventory,
        });
        expect(ui.setBusy).toHaveBeenLastCalledWith(false);
        expect(ui.clearEventPresentation).toHaveBeenCalled();
      } finally {
        phase.dispose();
      }
    });
  }
});

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { SurvivalUI } from '../src/ui/SurvivalUI';
import type { FocusedEventFocusView } from '../src/ui/SurvivalUiViewModel';

const exitCases = [
  ...(['drifting-supplies', 'drifting-chest'] as const).map((eventId) => ({
    eventId, energy: 0, carlitos: 'absent',
  })),
  ...[0].flatMap((energy) => ['absent', 'tired', 'exhausted'].map((carlitos) => ({
    eventId: 'drifting-supplies' as const, energy, carlitos,
  }))),
];

describe('focused event dismiss actions', () => {
  for (const { eventId, energy, carlitos } of exitCases) {
    const declineId = 'sleep';
    it.each(['choice', 'return'] as const)(`${eventId}, Energy ${energy}, Carlitos ${carlitos}: %s resolves the event`, async (exit) => {
      const session = new SurvivalSession([
        ...(eventId === 'drifting-supplies' ? [{ instanceId: 'scubaSet-1' as const, type: 'scubaSet' as const }] : []),
        ...(carlitos !== 'absent' ? [{ instanceId: 'carlitos-1' as const, type: 'carlitos' as const }] : []),
      ], {
        seed: 41, initial: { day: 3, energy }, initialEventId: eventId,
        initialCarlitos: { rest: carlitos === 'tired' ? 'tired' : 'exhausted' },
      });
      const before = session.snapshot();
      const showFocusedEvent = vi.fn();
      const exitFocusedEventView = vi.fn(async () => {});
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
          exitFocusedEventView,
          playEventChoice: vi.fn(async () => {}), clearEvent: vi.fn(),
        },
      }, eventId);
      try {
        phase.start();
        await vi.waitFor(() => expect(ui.setBusy).toHaveBeenLastCalledWith(false));
        ui.onFocusedEventSelect?.(eventId);
        await vi.waitFor(() => expect(showFocusedEvent).toHaveBeenCalledOnce());
        const choices = (showFocusedEvent.mock.calls[0]![0] as FocusedEventFocusView).choices;
        expect(choices).toEqual(expect.arrayContaining([
          expect.objectContaining({
            id: declineId, unavailableReason: null, dismisses: true,
          }),
        ]));
        for (const choice of choices.filter(({ id }) => id !== declineId)) {
          expect(choice.unavailableReason).toEqual(expect.any(String));
        }
        vi.mocked(ui.setSleepCovered!).mockClear();
        vi.mocked(ui.settleCoveredScene!).mockClear();
        if (exit === 'return') ui.onFocusedEventBack?.();
        else ui.onFocusedEventChoice?.({ id: declineId, instanceId: null });
        await vi.waitFor(() => expect(exitFocusedEventView).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(ui.restoreCommandFocus).toHaveBeenCalled());
        expect(session.snapshot()).toMatchObject({
          state: 'day', pendingEventId: null,
          day: before.day, health: before.health, hunger: before.hunger,
          energy: before.energy, hull: before.hull, inventory: before.inventory,
          food: before.food, bait: before.bait,
          carlitos: before.carlitos,
        });
        expect(ui.setBusy).toHaveBeenLastCalledWith(false);
        expect(ui.clearEventPresentation).toHaveBeenCalled();
        expect(ui.hideFocusedEvent).toHaveBeenCalled();
        if (eventId === 'drifting-supplies') {
          expect(ui.setSleepCovered).not.toHaveBeenCalled();
          expect(ui.settleCoveredScene).not.toHaveBeenCalled();
        }
        ui.onFocusedEventSelect?.(eventId);
        await Promise.resolve();
        expect(showFocusedEvent).toHaveBeenCalledOnce();
      } finally {
        phase.dispose();
      }
    });
  }

  it.each(['drifting-supplies', 'drifting-chest'] as const)(
    '%s: pillow expires the pending loot and starts night',
    (eventId) => {
      const session = new SurvivalSession([], {
        seed: 41,
        initial: { day: 3, energy: 0 },
        initialEventId: eventId,
      });

      expect(session.availableReason('endDay')).toBeNull();
      expect(session.perform('endDay')).toMatchObject({ accepted: true });
      expect(session.snapshot()).toMatchObject({ state: 'nightEvent' });
      expect(session.snapshot().pendingEventId).not.toBe(eventId);
    },
  );
});

import { describe, expect, it, vi } from 'vitest';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import type { SurvivalUI } from '../src/ui/SurvivalUI';
import type { FocusedEventFocusView } from '../src/ui/SurvivalUiViewModel';

const exitCases = [
  ...(['drifting-supplies', 'drifting-chest'] as const).map((eventId) => ({
    eventId, energy: 0, carlitos: 'absent',
  })),
  ...[0, 1].flatMap((energy) => ['absent', 'low-energy', 'hungry'].map((carlitos) => ({
    eventId: 'wreckage' as const, energy, carlitos,
  }))),
];

describe('focused event exits with no affordable reward', () => {
  for (const { eventId, energy, carlitos } of exitCases) {
    it.each(['choice', 'return'] as const)(`${eventId}, Energy ${energy}, Carlitos ${carlitos}: %s restores the day without cost`, async (exit) => {
      const session = new SurvivalSession([
        ...(eventId === 'wreckage' ? [{ instanceId: 'scubaSet-1' as const, type: 'scubaSet' as const }] : []),
        ...(carlitos !== 'absent' ? [{ instanceId: 'carlitos-1' as const, type: 'carlitos' as const }] : []),
      ], {
        seed: 41, initial: { day: 3, energy }, initialEventId: eventId,
        initialCarlitos: { energy: carlitos === 'low-energy' ? 2 : 3, hunger: carlitos === 'hungry' ? 0 : 5 },
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
          food: before.food, bait: before.bait, repairMaterial: before.repairMaterial,
          carlitos: before.carlitos,
        });
        expect(ui.setBusy).toHaveBeenLastCalledWith(false);
        expect(ui.clearEventPresentation).toHaveBeenCalled();
        expect(ui.hideFocusedEvent).toHaveBeenCalled();
      } finally {
        phase.dispose();
      }
    });
  }
});

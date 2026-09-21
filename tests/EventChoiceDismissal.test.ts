// @vitest-environment jsdom
// Importance: 92/100. Choice popups must close before actions and reject repeated input.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { survivalEventById } from '../src/survival/eventCatalog';
import { SurvivalUI } from '../src/ui/SurvivalUI';

const activeUIs: SurvivalUI[] = [];

afterEach(() => {
  activeUIs.splice(0).forEach((ui) => ui.dispose());
  vi.useRealTimers();
  document.body.replaceChildren();
});

function fixture() {
  vi.useFakeTimers();
  const mount = document.createElement('main');
  document.body.append(mount);
  const ui = new SurvivalUI(mount);
  activeUIs.push(ui);
  ui.beginEventPresentation();
  return { ui, mount };
}

function activate(button: HTMLButtonElement, input: string): void {
  button.focus();
  if (input === 'click') button.click();
  else button.dispatchEvent(new KeyboardEvent('keydown', { key: input, bubbles: true }));
}

describe.each(['click', 'Enter', ' '])('event popup dismissal with %s', (input) => {
  it.each([
    ['midnight-tour', 'visit'], ['midnight-tour', 'sleep'],
    ['check-the-back', 'check'], ['check-the-back', 'sleep'],
    ['guarded-sleep', 'watch'], ['guarded-sleep', 'sleep'],
  ])('closes %s before resolving %s', async (eventId, choiceId) => {
    const { ui, mount } = fixture();
    const event = survivalEventById(eventId)!;
    void ui.showEventReveal(event);
    const choices = event.choices.filter((choice) => choice.itemId === undefined)
      .map((choice) => ({ id: choice.id, label: choice.label, unavailableReason: null }));
    ui.setEventSelection(new Map(), choices);
    const popup = mount.querySelector<HTMLElement>('[data-event-caption]')!;
    const button = popup.querySelector<HTMLButtonElement>(`[data-event-choice="${choiceId}"]`)!;
    expect(button).not.toBeNull();
    const select = vi.fn((id: string) => {
      expect(popup.getAttribute('aria-hidden')).toBe('true');
      expect(popup.classList.contains('is-visible')).toBe(false);
      void ui.playEventChoiceBeat(id);
    });
    ui.onEventChoice = select;

    activate(button, input);
    button.click();

    expect(select).toHaveBeenCalledExactlyOnceWith(choiceId);
    await vi.runAllTimersAsync();
    expect(popup.getAttribute('aria-hidden')).toBe('true');
    ui.setEventSelection(new Map(), choices);
    expect(popup.getAttribute('aria-hidden')).toBe('false');
  });

  it.each(['drifting-supplies', 'drifting-chest'] as const)(
    'closes %s before resolving a choice', async (eventId) => {
      const { ui, mount } = fixture();
      ui.showFocusedEvent({
        eventId, target: null,
        choices: [{ id: 'retrieve', label: 'Retrieve', unavailableReason: null, instanceId: null }],
      });
      const popup = mount.querySelector<HTMLElement>('[data-focused-event-view]')!;
      const button = popup.querySelector<HTMLButtonElement>('[data-event-choice="retrieve"]')!;
      const select = vi.fn(() => {
        expect(popup.getAttribute('aria-hidden')).toBe('true');
        expect(popup.classList.contains('is-visible')).toBe(false);
        void ui.playEventChoiceBeat('retrieve');
      });
      ui.onFocusedEventChoice = select;

      activate(button, input);
      button.click();

      expect(select).toHaveBeenCalledOnce();
      await vi.runAllTimersAsync();
    },
  );
});

it('keeps an unavailable confirmation option open', () => {
  const { ui, mount } = fixture();
  void ui.showEventReveal(survivalEventById('guarded-sleep')!);
  ui.setEventSelection(new Map(), [
    { id: 'watch', label: 'Yes', unavailableReason: 'Carlitos is tired.' },
    { id: 'sleep', label: 'No', unavailableReason: null },
  ]);
  const select = vi.fn();
  ui.onEventChoice = select;
  mount.querySelector<HTMLButtonElement>('[data-event-choice="watch"]')!.click();
  expect(select).not.toHaveBeenCalled();
  expect(mount.querySelector('[data-event-caption]')!.getAttribute('aria-hidden')).toBe('false');
});

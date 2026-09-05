// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeLanguage, setLanguage } from '../src/i18n/language';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { focusedChoicesFor } from '../src/survival/SurvivalEventFlow';
import { survivalEventById } from '../src/survival/eventCatalog';
import { FocusedEventView } from '../src/ui/FocusedEventView';

beforeEach(() => initializeLanguage(null));
afterEach(() => { setLanguage('en'); document.body.replaceChildren(); });

describe('open drifting supply language changes', () => {
  it('updates variant choices while keeping selected buttons, focus, and game state', () => {
    const random = vi.fn(() => 0);
    const session = new SurvivalSession([{ instanceId: 'carlitos-1', type: 'carlitos' }], {
      seed: 7, random: { next: random }, initial: { day: 3, energy: 3 },
      initialEventId: 'drifting-supplies', initialCarlitos: { hunger: 5, energy: 3 },
    });
    const event = survivalEventById('drifting-supplies')!;
    const choices = focusedChoicesFor(event, session.snapshot());
    const mount = document.createElement('main');
    const view = new FocusedEventView(mount);
    document.body.append(mount);
    mount.append(view.root);
    view.show({ eventId: 'drifting-supplies', choices, target: null });
    view.root.removeAttribute('inert');
    const buttons = choices.map(({ id }) => view.choiceButton(id)!);
    view.setSelectedChoice('retrieve');
    const selected = view.choiceButton('retrieve')!;
    selected.focus();
    const state = JSON.stringify(session.snapshot());
    random.mockClear();
    try {
      for (const language of ['pl', 'en'] as const) {
        setLanguage(language);
        choices.forEach((choice, index) => {
          const button = view.choiceButton(choice.id)!;
          expect(button).toBe(buttons[index]);
          expect(button.querySelector('.focused-event-view__choice-main')!.firstChild!.textContent)
            .toBe(event.choices.find(({ id }) => id === choice.id)!.label);
        });
        expect(document.activeElement).toBe(selected);
        expect(selected.getAttribute('aria-pressed')).toBe('true');
        expect(JSON.stringify(session.snapshot())).toBe(state);
        expect(random).not.toHaveBeenCalled();
      }
    } finally {
      view.dispose();
    }
  });
});

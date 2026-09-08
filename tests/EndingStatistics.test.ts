// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { SurvivalUI } from '../src/ui/SurvivalUI';

const views: { dispose(): void }[] = [];
const element = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const key = (target: HTMLElement, value: string, shiftKey = false) => target.dispatchEvent(new KeyboardEvent('keydown', {
  key: value, shiftKey, bubbles: true, cancelable: true,
}));

afterEach(() => {
  views.splice(0).forEach((view) => view.dispose());
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('ending statistics page', () => {
  it.each(['rescue', 'death', 'sinking'] as const)('opens %s statistics and returns without restarting or pausing', (id) => {
    vi.useFakeTimers();
    const session = SurvivalSession.createEndingPreview([], 123, id);
    const snapshot = session.snapshot();
    const ui = new SurvivalUI(document.body);
    views.push(ui);
    const restart = vi.fn();
    const pause = vi.fn();
    ui.onRestart = restart;
    ui.onPauseChange = pause;
    ui.render(snapshot, () => null);
    ui.showEnding(snapshot.ending! as Exclude<typeof snapshot.ending, { id: 'dorothy' } | null>);
    const button = element<HTMLButtonElement>('[data-view-statistics]');
    const card = element('[data-ending-statistics]');
    if (id !== 'rescue') {
      button.click();
      expect(card.hidden).toBe(true);
      vi.advanceTimersByTime(1500);
    }
    button.click();
    expect(card.hidden).toBe(false);
    expect(element('[data-ending] > div').hidden).toBe(true);
    expect(document.activeElement).toBe(element('[data-statistics-title]'));
    expect(card.textContent).toContain('RADIO SIGNALS');
    expect(card.querySelectorAll('.statistics-series path')).toHaveLength(6);
    expect(card.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(card.querySelector('tbody tr')?.textContent).toContain(String(snapshot.health));

    element('[data-statistics-back]').focus();
    key(element('[data-statistics-back]'), 'Tab');
    expect(document.activeElement).toBe(element('summary'));
    key(element('summary'), 'Tab', true);
    expect(document.activeElement).toBe(element('[data-statistics-back]'));
    key(element('[data-statistics-back]'), 'Escape');
    expect(card.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
    expect(restart).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
    button.click();
    element<HTMLButtonElement>('[data-statistics-back]').click();
    expect(document.activeElement).toBe(button);
    element<HTMLButtonElement>('[data-restart]').click();
    expect(restart).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(true);
  });

  it('returns focus to statistics after a pause and removes its controls on disposal', () => {
    const ui = new SurvivalUI(document.body);
    views.push(ui);
    const snapshot = SurvivalSession.createEndingPreview([], 1, 'rescue').snapshot();
    ui.render(snapshot, () => null);
    ui.showEnding({ id: 'rescue', day: 1, savedPickupCount: 0, signalAssisted: false });
    element<HTMLButtonElement>('[data-view-statistics]').click();
    ui.setPaused(true);
    ui.setPaused(false);
    expect(document.activeElement).toBe(element('[data-statistics-title]'));
    const card = element('[data-ending-statistics]');
    ui.dispose();
    expect(card.isConnected).toBe(false);
  });
});

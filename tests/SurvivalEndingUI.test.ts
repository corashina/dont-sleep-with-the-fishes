// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurvivalUI } from '../src/ui/SurvivalUI';

let ui: SurvivalUI | undefined;

afterEach(() => {
  ui?.dispose();
  vi.useRealTimers();
  document.body.replaceChildren();
});

function setup() {
  vi.useFakeTimers();
  ui = new SurvivalUI(document.body);
  return {
    ui,
    root: document.querySelector<HTMLElement>('[data-ending]')!,
    panel: document.querySelector<HTMLElement>('[data-ending] > div')!,
    title: document.querySelector<HTMLElement>('[data-ending-title]')!,
    restart: document.querySelector<HTMLButtonElement>('[data-restart]')!,
    menu: document.querySelector<HTMLButtonElement>('[data-ending-menu]')!,
  };
}

describe('survival ending animation', () => {
  // Importance: 98/100. Sound must start on the actual popup reveal, once, after the fade.
  it('notifies when the Kraken popup becomes visible, not when its fade starts', () => {
    const view = setup();
    const shown = vi.fn(() => expect(view.panel.hidden).toBe(false));
    view.ui.onEndingShown = shown;
    const ending = { id: 'kraken' as const, day: 8, savedPickupCount: 4 };
    view.ui.showEnding(ending);
    expect(shown).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1499);
    expect(shown).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(shown).toHaveBeenCalledExactlyOnceWith('kraken');
    view.ui.showEnding(ending);
    vi.advanceTimersByTime(2000);
    expect(shown).toHaveBeenCalledOnce();
  });

  // Importance: 98/100. Leaving during a fade must cancel its sound callback.
  it('cancels the popup notification when disposed during the Kraken fade', () => {
    const view = setup();
    const shown = vi.fn();
    view.ui.onEndingShown = shown;
    view.ui.showEnding({ id: 'kraken', day: 8, savedPickupCount: 4 });
    view.ui.dispose();
    vi.advanceTimersByTime(2000);
    expect(shown).not.toHaveBeenCalled();
  });

  // Importance: 95/100. Reward audio must use the same tick as visible popup content.
  it('notifies immediately when a reward popup appears', () => {
    const view = setup();
    const shown = vi.fn(() => {
      expect(document.querySelector('[data-dive-result]')?.classList.contains('is-visible')).toBe(true);
    });
    view.ui.onRewardShown = shown;
    void view.ui.showRewardResult({ title: 'SALVAGE', reward: null, lines: [] });
    expect(shown).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(2000);
    expect(shown).toHaveBeenCalledOnce();
  });

  it('clears the sleep cover and keeps the finish screen closed during rescue', () => {
    const view = setup();
    void view.ui.setSleepCovered(true);
    view.ui.beginEndingSequence();
    const cover = document.querySelector<HTMLElement>('[data-sleep-cover]')!;
    expect(cover.classList.contains('is-covered')).toBe(false);
    expect(cover.style.opacity).toBe('0');
    expect(document.querySelector('.survival-ui')?.classList.contains('is-ending-sequence')).toBe(true);
    expect(view.root.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector<HTMLElement>('[data-boat-anchors]')?.inert).toBe(true);
    view.ui.setRescueFade(0.5);
    expect(cover.style.opacity).toBe('0.5');
    view.ui.setRescueFade(1);
    view.ui.showEnding({ id: 'rescue', day: 8, savedPickupCount: 4, signalAssisted: false });
    expect(cover.style.opacity).toBe('1');
    expect(view.root.getAttribute('aria-hidden')).toBe('false');
    expect(view.panel.hidden).toBe(false);
  });

  // Importance: 99/100. Endings must keep their popup and actions hidden until the fade completes.
  it.each(['death', 'sinking', 'kraken'] as const)('fades %s before showing its popup and menu controls', (id) => {
    const view = setup();
    // Importance: 98/100. Every faded ending must notify at the popup reveal.
    const shown = vi.fn();
    view.ui.onEndingShown = shown;
    const restart = vi.fn();
    const menu = vi.fn();
    view.ui.onRestart = restart;
    view.ui.onReturnToMenu = menu;
    const record = id === 'death'
      ? { id, day: 8, savedPickupCount: 4, cause: { kind: 'starvation' as const } }
      : id === 'sinking'
        ? { id, day: 8, savedPickupCount: 4, cause: { eventId: 'tornado' } }
        : { id, day: 8, savedPickupCount: 4 };

    view.ui.showEnding(record);
    expect(view.panel.hidden).toBe(true);
    expect(document.activeElement).toBe(view.root);
    expect(document.querySelector('[data-boat-anchors]')?.hasAttribute('inert')).toBe(true);
    view.restart.click();
    view.menu.click();
    expect(restart).not.toHaveBeenCalled();
    expect(menu).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1499);
    view.ui.showEnding(record);
    expect(view.panel.hidden).toBe(true);
    expect(shown).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(view.panel.hidden).toBe(false);
    expect(shown).toHaveBeenCalledExactlyOnceWith(id);
    expect(document.activeElement).toBe(view.title);
    expect(view.title.textContent).toBe({
      death: 'THE SEA OUTLASTED YOU', sinking: 'THE BOAT IS GONE', kraken: 'THE SEA RELEASES YOU',
    }[id]);
    expect(document.querySelector('[data-ending-stats]')?.textContent).toBe('DAY 8');
    view.menu.click();
    view.menu.click();
    view.restart.click();
    expect(menu).toHaveBeenCalledOnce();
    expect(restart).not.toHaveBeenCalled();
    expect(view.menu.disabled).toBe(true);
    expect(view.restart.disabled).toBe(true);
  });

  it('cancels popup work when disposed during the fade', () => {
    const view = setup();
    view.ui.showEnding({ id: 'death', day: 2, savedPickupCount: 1, cause: { kind: 'other' } });
    view.ui.dispose();
    vi.advanceTimersByTime(2000);
    expect(view.panel.hidden).toBe(true);
    expect(document.querySelector('[data-ending]')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps keyboard focus out of the popup until the fade ends', () => {
    const view = setup();
    view.ui.showEnding({ id: 'death', day: 2, savedPickupCount: 1, cause: { kind: 'other' } });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(view.root);
    vi.advanceTimersByTime(1500);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(view.restart);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(view.menu);
  });

  it('does not steal pause focus when the fade finishes', () => {
    const view = setup();
    view.ui.showEnding({ id: 'sinking', day: 2, savedPickupCount: 1, cause: { eventId: null } });
    view.ui.setPaused(true);
    vi.advanceTimersByTime(1500);
    expect(document.activeElement).toBe(document.querySelector('[data-resume]'));
    expect(view.root.hasAttribute('inert')).toBe(true);
    view.ui.setPaused(false);
    expect(document.activeElement).toBe(view.title);
  });

  it('keeps rescue immediate and prevents a second action after restart', () => {
    const view = setup();
    // Importance: 98/100. Rescue has no popup delay, so its bell must be immediate.
    const shown = vi.fn();
    view.ui.onEndingShown = shown;
    const restart = vi.fn();
    const menu = vi.fn();
    view.ui.onRestart = restart;
    view.ui.onReturnToMenu = menu;
    view.ui.showEnding({ id: 'rescue', day: 30, savedPickupCount: 4, signalAssisted: false });
    expect(shown).toHaveBeenCalledExactlyOnceWith('rescue');
    expect(view.panel.hidden).toBe(false);
    expect(document.activeElement).toBe(view.title);
    view.restart.click();
    view.menu.click();
    expect(restart).toHaveBeenCalledOnce();
    expect(menu).not.toHaveBeenCalled();
  });
});
